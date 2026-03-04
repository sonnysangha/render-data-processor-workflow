import os
import time
import asyncio
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from render_sdk import RenderAsync


app = FastAPI(
    title="Customer Data Merge API",
    description="API to trigger and monitor customer data merge workflows",
    version="1.0.0",
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Render SDK client
render = RenderAsync()

# Workflow configuration
# WORKFLOW_SLUG should be just the workflow name (e.g., "data-processor-workflows-py")
# We append the task name automatically
WORKFLOW_NAME = os.getenv("WORKFLOW_SLUG", "data-processor-workflows-py")
TASK_NAME = "merge_customer_data"
WORKFLOW_SLUG = f"{WORKFLOW_NAME}/{TASK_NAME}"

# In-memory store for run metadata (in production, use Redis or DB)
run_metadata: dict[str, dict] = {}


async def get_task_run_with_retry(task_id: str):
    """Get task run details, retrying until completed_at is populated."""
    for _ in range(5):
        details = await render.workflows.get_task_run(task_id)
        if details.completed_at is not None:
            return details
        await asyncio.sleep(0.5)
    return await render.workflows.get_task_run(task_id)


class TriggerResponse(BaseModel):
    runId: str
    status: str = "pending"


class ShardTiming(BaseModel):
    shard_id: int
    task_run_id: str
    elapsed_ms: int
    count: int


class StatusResponse(BaseModel):
    status: str
    runId: str
    profilesGenerated: Optional[int] = None
    recordsProcessed: Optional[int] = None
    shardsProcessed: Optional[int] = None
    shardsCompleted: Optional[int] = None
    elapsedMs: Optional[int] = None
    error: Optional[str] = None
    sampleProfile: Optional[dict] = None
    shardTimings: Optional[list[ShardTiming]] = None
    totalSequentialMs: Optional[int] = None
    maxParallelMs: Optional[int] = None


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "customer-merge-api-python"}


@app.post("/trigger", response_model=TriggerResponse)
async def trigger_workflow():
    """Trigger the customer data merge workflow."""
    try:
        start_time = time.time()
        
        # start_task returns immediately with the run ID;
        # run_task would block until the workflow completes.
        task_run = await render.workflows.start_task(WORKFLOW_SLUG, [])
        run_id = task_run.id
        
        # Store metadata
        run_metadata[run_id] = {
            "start_time": start_time,
            "status": "pending",
        }
        
        return TriggerResponse(runId=run_id, status="pending")
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/status/{run_id}", response_model=StatusResponse)
async def get_status(run_id: str):
    """Get the status of a workflow run."""
    try:
        # Get task run details
        task_run = await render.workflows.get_task_run(run_id)
        
        # Calculate elapsed time
        metadata = run_metadata.get(run_id, {})
        start_time = metadata.get("start_time", time.time())
        elapsed_ms = int((time.time() - start_time) * 1000)
        
        # Map status
        status = task_run.status
        
        response = StatusResponse(
            status=status,
            runId=run_id,
            elapsedMs=elapsed_ms,
        )
        
        # If completed, add results
        if status == "succeeded" and task_run.results:
            # results is always a list; the task return value is the first element
            results = task_run.results[0] if task_run.results else {}
            if isinstance(results, dict):
                response.profilesGenerated = results.get("profiles_generated")
                response.recordsProcessed = results.get("records_processed")
                response.shardsProcessed = results.get("shards_processed")
                response.sampleProfile = results.get("sample_profile")
                
                # Fetch subtask details
                # Note: SDK's list_task_runs doesn't support root_task_run_id filter,
                # so we use httpx for listing, but SDK's get_task_run for details
                try:
                    api_key = os.getenv("RENDER_API_KEY")
                    headers = {"Authorization": f"Bearer {api_key}"}
                    
                    async with httpx.AsyncClient() as http_client:
                        # List subtasks by root_task_run_id
                        api_url = f"https://api.render.com/v1/task-runs?rootTaskRunId={run_id}&limit=100"
                        resp = await http_client.get(api_url, headers=headers)
                        
                        if resp.status_code == 200:
                            subtask_data = resp.json()
                            # Filter to only subtasks (exclude root task)
                            subtask_ids = [t["id"] for t in subtask_data if t.get("id") != run_id]
                            
                            shard_timings = []
                            total_sequential_ms = 0
                            max_parallel_ms = 0
                            
                            for task_id in subtask_ids:
                                # Use SDK to get full task run details
                                details = await get_task_run_with_retry(task_id)
                                
                                started_at = details.started_at
                                completed_at = details.completed_at
                                
                                print(f"Task {task_id}: started_at={started_at}, completed_at={completed_at}")
                                
                                # Calculate elapsed time (timestamps are datetime objects)
                                task_elapsed_ms = 0
                                if started_at and completed_at:
                                    task_elapsed_ms = int((completed_at - started_at).total_seconds() * 1000)
                                    print(f"Task {task_id}: elapsed_ms={task_elapsed_ms}")
                                
                                # Get shard_id from input_ (note trailing underscore)
                                input_data = details.input_ or []
                                shard_id = input_data[0] if input_data else len(shard_timings)
                                
                                # Get count from results
                                subtask_results = details.results
                                count = 0
                                if subtask_results:
                                    if isinstance(subtask_results, list) and subtask_results:
                                        subtask_results = subtask_results[0]
                                    if isinstance(subtask_results, dict):
                                        count = subtask_results.get('count', 0)
                                
                                shard_timings.append({
                                    "shard_id": shard_id,
                                    "task_run_id": task_id,
                                    "elapsed_ms": task_elapsed_ms,
                                    "count": count,
                                })
                                
                                total_sequential_ms += task_elapsed_ms
                                if task_elapsed_ms > max_parallel_ms:
                                    max_parallel_ms = task_elapsed_ms
                            
                            # Sort by shard_id
                            shard_timings.sort(key=lambda x: x["shard_id"])
                            
                            response.shardTimings = shard_timings
                            response.totalSequentialMs = total_sequential_ms
                            response.maxParallelMs = max_parallel_ms
                        else:
                            print(f"API error listing subtasks: {resp.status_code}")
                    
                except Exception as e:
                    print(f"Error fetching subtask details: {e}")
                    import traceback
                    traceback.print_exc()
                    response.shardTimings = results.get("shard_timings")
        
        # If failed, add error
        if status == "failed":
            response.error = "Workflow execution failed"
        
        return response
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/results/{run_id}", response_model=StatusResponse)
async def get_results(run_id: str):
    """Get the results of a completed workflow run."""
    return await get_status(run_id)


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)
