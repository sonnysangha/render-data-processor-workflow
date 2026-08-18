"""
Customer Data Merge Workflow

Merges customer data from 4 sources (CRM, Billing, Product, Support) into
enriched customer profiles using shard-based parallel processing.

Workflow Tasks:
1. merge_customer_data: Orchestrator that spawns parallel subtasks
2. process_shard: Each subtask loads CSVs, filters to its shard, merges records

Design Notes:
- Each subtask loads and filters its own data to avoid large INPUT payloads
- Aggregation runs in the orchestrator (not a subtask) to avoid large OUTPUT payloads
- The workflow SDK has payload size limits for data passed between tasks
"""

import asyncio
import os
from pathlib import Path
from typing import Any

import pandas as pd
from render_sdk import Retry, Workflows

from sharding import NUM_SHARDS, get_shard_id
from enrichment import enrich_profile

app = Workflows(
    default_retry=Retry(max_retries=2, wait_duration_ms=1000),
)


# Path to sample data (relative to workflow service root)
DATA_DIR = Path(os.getenv("DATA_DIR", "../../sample_data"))


def sanitize_for_json(obj: Any) -> Any:
    """Convert numpy/pandas types to native Python types for JSON serialization."""
    if pd.isna(obj):
        return None
    if hasattr(obj, "item"):  # numpy scalar
        return obj.item()
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize_for_json(v) for v in obj]
    return obj


def load_csv(filename: str) -> list[dict[str, Any]]:
    """Load a CSV file and return as list of dicts with native Python types."""
    filepath = DATA_DIR / filename
    if not filepath.exists():
        # For demo purposes, return empty if file doesn't exist
        print(f"Warning: {filepath} not found, using empty dataset")
        return []
    
    df = pd.read_csv(filepath)
    # Convert to JSON-safe format (removes numpy types)
    records = df.to_dict("records")
    return [sanitize_for_json(r) for r in records]


@app.task
async def merge_customer_data() -> dict[str, Any]:
    """
    Main orchestrator task.
    
    Spawns parallel subtasks to process each shard. Each subtask loads
    and filters its own data to avoid large payload transfers.
    
    Returns:
        Aggregated results with profiles, statistics, and task run info
    """
    # Create subtask handles first
    print(f"Spawning {NUM_SHARDS} parallel subtasks...")
    task_handles = [process_shard(shard_id) for shard_id in range(NUM_SHARDS)]
    
    # Debug: check what attributes TaskInstance has
    if task_handles:
        handle = task_handles[0]
        print(f"DEBUG TaskInstance type: {type(handle)}")
        print(f"DEBUG TaskInstance dir: {dir(handle)}")
        print(f"DEBUG TaskInstance __dict__: {getattr(handle, '__dict__', 'no __dict__')}")
    
    # Await all subtasks in parallel
    shard_results = await asyncio.gather(*task_handles)
    
    # Aggregate results locally (not as a subtask to avoid large payload)
    print("Aggregating results...")
    final_result = aggregate_results(shard_results)
    
    return final_result


def filter_records_for_shard(records: list[dict[str, Any]], shard_id: int) -> list[dict[str, Any]]:
    """Filter records to only those belonging to the given shard."""
    return [r for r in records if get_shard_id(str(r.get("customer_id", ""))) == shard_id]


@app.task
def process_shard(shard_id: int) -> dict[str, Any]:
    """
    Process a single shard - load data and merge records for customers in this shard.
    
    Each subtask loads its own data to avoid large payload transfers between tasks.
    
    Args:
        shard_id: The shard ID to process (0 to NUM_SHARDS-1)
        
    Returns:
        Compact shard summary: shard_id, count, records_processed,
        health_score_sum, churn_distribution, and one sample_profile
    """
    print(f"Shard {shard_id}: Loading CSV files...")
    
    # Load all source CSVs in this subtask
    crm_records = load_csv("crm.csv")
    billing_records = load_csv("billing.csv")
    product_records = load_csv("product.csv")
    support_records = load_csv("support.csv")
    
    # Filter to only records belonging to this shard
    crm_shard = filter_records_for_shard(crm_records, shard_id)
    billing_shard = filter_records_for_shard(billing_records, shard_id)
    product_shard = filter_records_for_shard(product_records, shard_id)
    support_shard = filter_records_for_shard(support_records, shard_id)
    
    print(f"Shard {shard_id}: Processing {len(crm_shard)} CRM, {len(billing_shard)} billing, "
          f"{len(product_shard)} product, {len(support_shard)} support records")
    
    # Index records by customer_id
    crm_idx = {r["customer_id"]: r for r in crm_shard}
    billing_idx = {r["customer_id"]: r for r in billing_shard}
    product_idx = {r["customer_id"]: r for r in product_shard}
    support_idx = {r["customer_id"]: r for r in support_shard}
    
    # Get all unique customer IDs in this shard
    all_customer_ids = (
        set(crm_idx.keys()) | 
        set(billing_idx.keys()) | 
        set(product_idx.keys()) | 
        set(support_idx.keys())
    )
    
    # Merge and enrich each customer
    profiles = []
    for customer_id in all_customer_ids:
        # Start with base profile
        profile: dict[str, Any] = {"customer_id": customer_id}
        
        # Merge from each source (later sources override earlier for same keys)
        if customer_id in crm_idx:
            profile.update(crm_idx[customer_id])
        if customer_id in billing_idx:
            profile.update(billing_idx[customer_id])
        if customer_id in product_idx:
            profile.update(product_idx[customer_id])
        if customer_id in support_idx:
            profile.update(support_idx[customer_id])
        
        # Add calculated fields
        enriched = enrich_profile(profile)
        profiles.append(enriched)
    
    print(f"Shard {shard_id}: Generated {len(profiles)} enriched profiles")

    # Return a compact summary, not the profiles themselves. Task inputs and
    # outputs are capped at 4 MB, and a full shard of enriched profiles would
    # exceed that. Mirrors typescript/workflows/src/main.ts.
    records_processed = (
        len(crm_shard) + len(billing_shard) + len(product_shard) + len(support_shard)
    )
    churn_distribution = {"LOW": 0, "MEDIUM": 0, "HIGH": 0}
    health_score_sum = 0
    for p in profiles:
        churn_distribution[p["churn_risk"]] += 1
        health_score_sum += p["health_score"]

    return {
        "shard_id": shard_id,
        "count": len(profiles),
        "records_processed": records_processed,
        "health_score_sum": health_score_sum,
        "churn_distribution": churn_distribution,
        "sample_profile": profiles[0] if profiles else None,
    }


def aggregate_results(shard_results: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Aggregate results from all shards into final output.
    
    This runs in the orchestrator (not as a subtask) to avoid passing
    large profile data between tasks. It only sees the compact per-shard
    summaries returned by process_shard, never the full profiles.
    
    Args:
        shard_results: List of results from each process_shard task
        
    Returns:
        Final aggregated result with statistics and per-shard counts
    """
    total_profiles = 0
    total_records = 0
    health_score_sum = 0
    churn_counts = {"LOW": 0, "MEDIUM": 0, "HIGH": 0}
    sample_profile = None
    shard_timings = []
    
    for shard_result in shard_results:
        total_profiles += shard_result["count"]
        total_records += shard_result["records_processed"]
        health_score_sum += shard_result["health_score_sum"]
        for risk in churn_counts:
            churn_counts[risk] += shard_result["churn_distribution"].get(risk, 0)
        if sample_profile is None:
            sample_profile = shard_result.get("sample_profile")
        shard_timings.append({
            "shard_id": shard_result["shard_id"],
            "count": shard_result["count"],
        })
    
    # Sort by shard_id for consistent display
    shard_timings.sort(key=lambda x: x["shard_id"])
    
    avg_health = health_score_sum / total_profiles if total_profiles else 0
    
    return {
        "profiles_generated": total_profiles,
        "records_processed": total_records,
        "shards_processed": len(shard_results),
        "sample_profile": sample_profile,
        "shard_timings": shard_timings,
        "statistics": {
            "avg_health_score": round(avg_health, 1),
            "churn_distribution": churn_counts,
        },
    }


if __name__ == "__main__":
    app.start()
