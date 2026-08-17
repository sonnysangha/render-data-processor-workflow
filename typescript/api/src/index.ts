import Fastify from "fastify";
import cors from "@fastify/cors";
import { Render } from "@renderinc/sdk";

const fastify = Fastify({ logger: true, trustProxy: true });

// Only allow the deployed frontend (or local dev frontend) to call this API.
const frontendOrigins = (
  process.env.FRONTEND_ORIGIN || "http://localhost:3000"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
await fastify.register(cors, { origin: frontendOrigins });

// Render SDK client
const render = new Render();

// Workflow configuration
// WORKFLOW_SLUG is the generated Workflow service slug shown by
// `render workflows list`; Render can append a suffix. We append the task name.
const WORKFLOW_NAME = process.env.WORKFLOW_SLUG || "data-processor-workflows-ts";
const TASK_NAME = "merge_customer_data";
const WORKFLOW_SLUG = `${WORKFLOW_NAME}/${TASK_NAME}`;

// In-memory store for run metadata
const runMetadata: Map<string, { startTime: number; status: string }> =
  new Map();
const RUN_METADATA_MAX_SIZE = 1000;

// Demo mode: when enabled, rate-limits /trigger to prevent abuse of the
// public live instance. Users who clone this template can leave it unset.
const DEMO_MODE = ["1", "true"].includes(
  (process.env.DEMO_MODE || "").toLowerCase()
);
const DEMO_TRIGGER_COOLDOWN_MS = 10_000;
const triggerTimestamps: Map<string, number> = new Map();

// Types
interface TriggerResponse {
  runId: string;
  status: string;
  error?: string;
}

interface ShardTiming {
  shard_id: number;
  task_run_id: string;
  elapsed_ms: number;
  count: number;
}

interface StatusResponse {
  status: string;
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

// Helper to get task run details with retry for completedAt
async function getTaskRunWithRetry(taskId: string) {
  for (let retry = 0; retry < 5; retry++) {
    const details = await render.workflows.getTaskRun(taskId);
    if (details.completedAt) {
      return details;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  // Return last attempt even without completedAt
  return render.workflows.getTaskRun(taskId);
}

// Health check
fastify.get("/health", async () => {
  return {
    status: "healthy",
    service: "customer-merge-api-typescript",
  };
});

// Trigger workflow
fastify.post<{ Reply: TriggerResponse }>("/trigger", async (request, reply) => {
  try {
    if (DEMO_MODE) {
      const clientIp = request.ip;
      const lastTrigger = triggerTimestamps.get(clientIp) ?? 0;
      if (Date.now() - lastTrigger < DEMO_TRIGGER_COOLDOWN_MS) {
        reply.code(429);
        return {
          runId: "",
          status: "error",
          error: "Please wait before triggering another workflow run.",
        };
      }
      triggerTimestamps.set(clientIp, Date.now());
    }

    const startTime = Date.now();

    // Trigger the workflow (startTask returns immediately, no SSE blocking)
    const taskRun = await render.workflows.startTask(WORKFLOW_SLUG, []);
    const runId = taskRun.taskRunId;

    // Store metadata (evict oldest entries when at capacity)
    if (DEMO_MODE && runMetadata.size >= RUN_METADATA_MAX_SIZE) {
      const oldestKey = runMetadata.keys().next().value!;
      runMetadata.delete(oldestKey);
    }
    runMetadata.set(runId, {
      startTime,
      status: "pending",
    });

    return {
      runId,
      status: "pending",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    reply.code(500);
    return { runId: "", status: "error", error: message };
  }
});

// Get workflow status
fastify.get<{ Params: { runId: string }; Reply: StatusResponse }>(
  "/status/:runId",
  async (request, reply) => {
    const { runId } = request.params;

    try {
      // Get task run details
      const taskRun = await render.workflows.getTaskRun(runId);

      // Calculate elapsed time
      const metadata = runMetadata.get(runId);
      const startTime = metadata?.startTime || Date.now();
      const elapsedMs = Date.now() - startTime;

      const response: StatusResponse = {
        status: taskRun.status,
        runId,
        elapsedMs,
      };

      // If completed, add results and shard timings
      if (taskRun.status === "completed" && taskRun.results) {
        // Results could be an array or object depending on SDK version
        const results =
          Array.isArray(taskRun.results) && taskRun.results.length > 0
            ? (taskRun.results[0] as Record<string, unknown>)
            : (taskRun.results as unknown as Record<string, unknown>);

        if (results && typeof results === "object") {
          response.profilesGenerated =
            results.profiles_generated as number | undefined;
          response.recordsProcessed =
            results.records_processed as number | undefined;
          response.shardsProcessed =
            results.shards_processed as number | undefined;
          response.sampleProfile = results.sample_profile as
            | Record<string, unknown>
            | undefined;
        }

        // Fetch subtask details for timing info using SDK
        try {
          const taskRuns = await render.workflows.listTaskRuns({
            rootTaskRunId: [runId],
            limit: 100,
          });
          const subtasks = taskRuns.filter(
            (entry) => entry.taskRun.parentTaskRunId === runId
          );
          const shardTimings: ShardTiming[] = [];
          let totalSequentialMs = 0;
          let maxParallelMs = 0;

          for (const entry of subtasks) {
            const subtask = entry.taskRun;
            const details = await getTaskRunWithRetry(subtask.id);
            
            const startedAt = details.startedAt;
            const completedAt = details.completedAt;
            
            let taskElapsedMs = 0;
            if (startedAt && completedAt) {
              const startDt = new Date(startedAt);
              const endDt = new Date(completedAt);
              taskElapsedMs = endDt.getTime() - startDt.getTime();
            }

            // Get shard_id from input
            const inputData = details.input as unknown[];
            const shardId = (inputData?.[0] as number) ?? shardTimings.length;

            // Get count from results
            let count = 0;
            const subtaskResults = details.results;
            if (subtaskResults) {
              const resultObj = Array.isArray(subtaskResults) && subtaskResults.length > 0
                ? (subtaskResults[0] as Record<string, unknown>)
                : (subtaskResults as unknown as Record<string, unknown>);
              if (typeof resultObj === "object" && resultObj !== null) {
                count = (resultObj.count as number) || 0;
              }
            }

            shardTimings.push({
              shard_id: shardId,
              task_run_id: entry.taskRun.id,
              elapsed_ms: taskElapsedMs,
              count,
            });

            totalSequentialMs += taskElapsedMs;
            if (taskElapsedMs > maxParallelMs) {
              maxParallelMs = taskElapsedMs;
            }
          }

          if (shardTimings.length > 0) {
            response.shardTimings = shardTimings;
            response.totalSequentialMs = totalSequentialMs;
            response.maxParallelMs = maxParallelMs;
          }
        } catch (e) {
          // If subtask fetch fails, continue without timing info
          console.error("Failed to fetch subtask timings:", e);
        }
      }

      // If failed, add error
      if (taskRun.status === "failed") {
        response.error = "Workflow execution failed";
      }

      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      reply.code(500);
      return { status: "error", runId, error: message };
    }
  }
);

// Get workflow results (redirects to status which has full details)
fastify.get<{ Params: { runId: string }; Reply: StatusResponse }>(
  "/results/:runId",
  async (request, reply) => {
    // Reuse the status endpoint logic - it now includes shard timings
    return reply.redirect(`/status/${request.params.runId}`);
  }
);

// Start server
const port = parseInt(process.env.PORT || "8002", 10);

try {
  await fastify.listen({ port, host: "0.0.0.0" });
  console.log(`Server running at http://localhost:${port}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
