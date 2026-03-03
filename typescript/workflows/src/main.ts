/**
 * Customer Data Merge Workflow
 *
 * Merges customer data from 4 sources (CRM, Billing, Product, Support) into
 * enriched customer profiles using shard-based parallel processing.
 *
 * Workflow Tasks:
 * 1. merge_customer_data: Orchestrator that spawns parallel subtasks
 * 2. process_shard: Each subtask loads CSVs, filters to its shard, merges records
 *
 * Design Notes:
 * - Each subtask loads and filters its own data to avoid large INPUT payloads
 * - Aggregation runs in the orchestrator (not a subtask) to avoid large OUTPUT payloads
 * - The workflow SDK has payload size limits for data passed between tasks
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import Papa from "papaparse";
import { task } from "@renderinc/sdk/workflows";
import { NUM_SHARDS, getShardId } from "./sharding.js";
import { enrichProfile, type EnrichedProfile } from "./enrichment.js";

// Path to sample data
const DATA_DIR = process.env.DATA_DIR || "../../sample_data";

type Record = { [key: string]: unknown };

interface ShardResult {
  shard_id: number;
  profiles: EnrichedProfile[];
  count: number;
}

interface AggregatedResult {
  profiles_generated: number;
  records_processed: number;
  shards_processed: number;
  sample_profile: EnrichedProfile | null;
  statistics: {
    avg_health_score: number;
    churn_distribution: { LOW: number; MEDIUM: number; HIGH: number };
  };
}

/**
 * Load a CSV file and return as array of records.
 */
function loadCsv(filename: string): Record[] {
  const filepath = join(DATA_DIR, filename);

  if (!existsSync(filepath)) {
    console.log(`Warning: ${filepath} not found, using empty dataset`);
    return [];
  }

  const content = readFileSync(filepath, "utf-8");
  const result = Papa.parse<Record>(content, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
  });

  return result.data;
}

/**
 * Filter records to only those belonging to the given shard.
 */
function filterRecordsForShard(records: Record[], shardId: number): Record[] {
  return records.filter((r) => {
    const customerId = r.customer_id;
    return customerId && getShardId(String(customerId)) === shardId;
  });
}

/**
 * Main orchestrator task.
 */
const mergeCustomerData = task(
  {
    name: "merge_customer_data",
    retry: {
      maxRetries: 2,
      waitDurationMs: 1000,
    },
  },
  async function mergeCustomerData(): Promise<AggregatedResult> {
    // Process all shards in parallel - each subtask loads its own data
    console.log(`Spawning ${NUM_SHARDS} parallel subtasks...`);
    const shardResults = await Promise.all(
      Array.from({ length: NUM_SHARDS }, (_, shardId) => processShard(shardId))
    );

    // Aggregate results locally (not as a subtask to avoid large payload)
    console.log("Aggregating results...");
    const finalResult = aggregateResults(shardResults);

    return finalResult;
  }
);

/**
 * Process a single shard - load data and merge records for customers in this shard.
 *
 * Each subtask loads its own data to avoid large payload transfers between tasks.
 */
const processShard = task(
  { name: "process_shard" },
  function processShard(shardId: number): ShardResult {
    console.log(`Shard ${shardId}: Loading CSV files...`);

    // Load all source CSVs in this subtask
    const crmRecords = loadCsv("crm.csv");
    const billingRecords = loadCsv("billing.csv");
    const productRecords = loadCsv("product.csv");
    const supportRecords = loadCsv("support.csv");

    // Filter to only records belonging to this shard
    const crmShard = filterRecordsForShard(crmRecords, shardId);
    const billingShard = filterRecordsForShard(billingRecords, shardId);
    const productShard = filterRecordsForShard(productRecords, shardId);
    const supportShard = filterRecordsForShard(supportRecords, shardId);

    console.log(
      `Shard ${shardId}: Processing ${crmShard.length} CRM, ${billingShard.length} billing, ` +
      `${productShard.length} product, ${supportShard.length} support records`
    );

    // Index records by customer_id
    const crmIdx = new Map<string, Record>();
    const billingIdx = new Map<string, Record>();
    const productIdx = new Map<string, Record>();
    const supportIdx = new Map<string, Record>();

    for (const r of crmShard) {
      crmIdx.set(String(r.customer_id), r);
    }
    for (const r of billingShard) {
      billingIdx.set(String(r.customer_id), r);
    }
    for (const r of productShard) {
      productIdx.set(String(r.customer_id), r);
    }
    for (const r of supportShard) {
      supportIdx.set(String(r.customer_id), r);
    }

    // Get all unique customer IDs in this shard
    const allCustomerIds = new Set<string>([
      ...crmIdx.keys(),
      ...billingIdx.keys(),
      ...productIdx.keys(),
      ...supportIdx.keys(),
    ]);

    // Merge and enrich each customer
    const profiles: EnrichedProfile[] = [];
    for (const customerId of allCustomerIds) {
      // Start with base profile
      const profile: Record = { customer_id: customerId };

      // Merge from each source
      const crm = crmIdx.get(customerId);
      if (crm) Object.assign(profile, crm);

      const billing = billingIdx.get(customerId);
      if (billing) Object.assign(profile, billing);

      const product = productIdx.get(customerId);
      if (product) Object.assign(profile, product);

      const support = supportIdx.get(customerId);
      if (support) Object.assign(profile, support);

      // Add calculated fields
      const enriched = enrichProfile(profile);
      profiles.push(enriched);
    }

    console.log(`Shard ${shardId}: Generated ${profiles.length} enriched profiles`);

    return {
      shard_id: shardId,
      profiles,
      count: profiles.length,
    };
  }
);

/**
 * Aggregate results from all shards into final output.
 *
 * This runs in the orchestrator (not as a subtask) to avoid passing
 * large profile data between tasks.
 */
function aggregateResults(shardResults: ShardResult[]): AggregatedResult {
  const allProfiles: EnrichedProfile[] = [];

  for (const shardResult of shardResults) {
    allProfiles.push(...shardResult.profiles);
  }

  // Get a sample profile for the frontend preview
  const sampleProfile = allProfiles.length > 0 ? allProfiles[0] : null;

  // Calculate statistics
  const totalProfiles = allProfiles.length;

  const healthScores = allProfiles
    .filter((p) => p.health_score !== undefined)
    .map((p) => p.health_score);
  const avgHealth =
    healthScores.length > 0
      ? healthScores.reduce((a, b) => a + b, 0) / healthScores.length
      : 0;

  const churnCounts = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  for (const p of allProfiles) {
    churnCounts[p.churn_risk]++;
  }

  return {
    profiles_generated: totalProfiles,
    records_processed: totalProfiles * 4,
    shards_processed: NUM_SHARDS,
    sample_profile: sampleProfile,
    statistics: {
      avg_health_score: Math.round(avgHealth * 10) / 10,
      churn_distribution: churnCounts,
    },
  };
}

