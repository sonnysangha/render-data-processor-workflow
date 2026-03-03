"""Hash-based sharding for deterministic customer routing."""

import hashlib

NUM_SHARDS = 10  # Reduced for testing - increase to 100 for production


def get_shard_id(customer_id: str) -> int:
    """
    Deterministically assign a customer to a shard based on their ID.
    
    Uses MD5 hash to ensure:
    - Same customer always goes to same shard (across all source files)
    - Even distribution across shards
    
    Args:
        customer_id: The customer identifier
        
    Returns:
        Shard ID (0 to NUM_SHARDS-1)
    """
    hash_bytes = hashlib.md5(customer_id.encode()).digest()
    return int.from_bytes(hash_bytes[:4], "big") % NUM_SHARDS


def route_records_to_shards(
    records: list[dict],
    customer_id_field: str = "customer_id"
) -> dict[int, list[dict]]:
    """
    Route a list of records to their respective shards.
    
    Args:
        records: List of record dictionaries
        customer_id_field: Field name containing the customer ID
        
    Returns:
        Dictionary mapping shard_id to list of records
    """
    shards: dict[int, list[dict]] = {i: [] for i in range(NUM_SHARDS)}
    
    for record in records:
        customer_id = record.get(customer_id_field, "")
        if customer_id:
            shard_id = get_shard_id(str(customer_id))
            shards[shard_id].append(record)
    
    return shards
