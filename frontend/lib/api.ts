export interface ShardTiming {
  shard_id: number;
  task_run_id: string;
  elapsed_ms: number;
  count: number;
}

export interface WorkflowResult {
  status: "pending" | "running" | "completed" | "failed";
  runId: string;
  profilesGenerated?: number;
  recordsProcessed?: number;
  shardsProcessed?: number;
  shardsCompleted?: number;
  elapsedMs?: number;
  error?: string;
  sampleProfile?: Record<string, unknown>;
  shardTimings?: ShardTiming[];
  totalSequentialMs?: number;
  maxParallelMs?: number;
}

function getApiUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

  if (!envUrl) {
    return "http://localhost:8002";
  }

  const normalizedUrl = envUrl.replace(/\/+$/, "");
  if (
    normalizedUrl.startsWith("http://") ||
    normalizedUrl.startsWith("https://")
  ) {
    return normalizedUrl;
  }

  return `https://${normalizedUrl}`;
}

export async function triggerWorkflow(): Promise<{ runId: string }> {
  const apiUrl = getApiUrl();

  const response = await fetch(`${apiUrl}/trigger`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to trigger workflow: ${error}`);
  }

  return response.json();
}

export async function pollWorkflowStatus(
  runId: string
): Promise<WorkflowResult> {
  const apiUrl = getApiUrl();

  const response = await fetch(`${apiUrl}/status/${runId}`);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get status: ${error}`);
  }

  return response.json();
}

export async function getWorkflowResults(
  runId: string
): Promise<WorkflowResult> {
  const apiUrl = getApiUrl();

  const response = await fetch(`${apiUrl}/results/${runId}`);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get results: ${error}`);
  }

  return response.json();
}
