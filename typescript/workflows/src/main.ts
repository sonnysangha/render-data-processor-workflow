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
  count: number;
  records_processed: number;
  health_score_sum: number;
  churn_distribution: { LOW: number; MEDIUM: number; HIGH: number };
  sample_profile: EnrichedProfile | null;
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
  {
    name: "process_shard",
    retry: {
      maxRetries: 3,
      waitDurationMs: 1000,
      backoffScaling: 2,
    },
  },
  function processShard(shardId: number): ShardResult {
    const startedAt = performance.now();
    console.log(JSON.stringify({ event: "shard_started", shard_id: shardId }));

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

    const recordsProcessed =
      crmShard.length +
      billingShard.length +
      productShard.length +
      supportShard.length;

    console.log(
      JSON.stringify({
        event: "shard_input_loaded",
        shard_id: shardId,
        crm_records: crmShard.length,
        billing_records: billingShard.length,
        product_records: productShard.length,
        support_records: supportShard.length,
        records_processed: recordsProcessed,
      })
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

    const churnDistribution = { LOW: 0, MEDIUM: 0, HIGH: 0 };
    let healthScoreSum = 0;
    for (const profile of profiles) {
      churnDistribution[profile.churn_risk]++;
      healthScoreSum += profile.health_score;
    }

    console.log(
      JSON.stringify({
        event: "shard_completed",
        shard_id: shardId,
        profiles_generated: profiles.length,
        records_processed: recordsProcessed,
        elapsed_ms: Math.round(performance.now() - startedAt),
      })
    );

    return {
      shard_id: shardId,
      count: profiles.length,
      records_processed: recordsProcessed,
      health_score_sum: healthScoreSum,
      churn_distribution: churnDistribution,
      sample_profile: profiles[0] ?? null,
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
  let totalProfiles = 0;
  let totalRecords = 0;
  let healthScoreSum = 0;
  const churnCounts = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  let sampleProfile: EnrichedProfile | null = null;

  for (const shardResult of shardResults) {
    totalProfiles += shardResult.count;
    totalRecords += shardResult.records_processed;
    healthScoreSum += shardResult.health_score_sum;
    churnCounts.LOW += shardResult.churn_distribution.LOW;
    churnCounts.MEDIUM += shardResult.churn_distribution.MEDIUM;
    churnCounts.HIGH += shardResult.churn_distribution.HIGH;
    sampleProfile ??= shardResult.sample_profile;
  }

  const avgHealth =
    totalProfiles > 0 ? healthScoreSum / totalProfiles : 0;

  return {
    profiles_generated: totalProfiles,
    records_processed: totalRecords,
    shards_processed: shardResults.length,
    sample_profile: sampleProfile,
    statistics: {
      avg_health_score: Math.round(avgHealth * 10) / 10,
      churn_distribution: churnCounts,
    },
  };
}
