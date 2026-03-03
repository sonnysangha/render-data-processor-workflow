/**
 * Hash-based sharding for deterministic customer routing.
 */

import { createHash } from "crypto";

export const NUM_SHARDS = 10; // Reduced for testing - increase to 100 for production

/**
 * Deterministically assign a customer to a shard based on their ID.
 *
 * Uses MD5 hash to ensure:
 * - Same customer always goes to same shard (across all source files)
 * - Even distribution across shards
 */
export function getShardId(customerId: string): number {
  const hash = createHash("md5").update(customerId).digest();
  const value = hash.readUInt32BE(0);
  return value % NUM_SHARDS;
}

/**
 * Route a list of records to their respective shards.
 */
export function routeRecordsToShards(
  records: Record<string, unknown>[],
  customerIdField: string = "customer_id"
): Map<number, Record<string, unknown>[]> {
  const shards = new Map<number, Record<string, unknown>[]>();

  // Initialize all shards
  for (let i = 0; i < NUM_SHARDS; i++) {
    shards.set(i, []);
  }

  // Route records
  for (const record of records) {
    const customerId = record[customerIdField];
    if (customerId) {
      const shardId = getShardId(String(customerId));
      const shard = shards.get(shardId);
      if (shard) {
        shard.push(record);
      }
    }
  }

  return shards;
}
