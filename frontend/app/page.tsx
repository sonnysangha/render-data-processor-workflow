"use client";

import { useState, useCallback, useRef } from "react";
import DataPreview from "@/components/DataPreview";
import EventLog, { type LogEntry } from "@/components/EventLog";
import ResultsSummary from "@/components/ResultsSummary";
import WorkflowTrigger from "@/components/WorkflowTrigger";
import {
  pollWorkflowStatus,
  triggerWorkflow,
  type WorkflowResult,
} from "@/lib/api";

type WorkflowState = "idle" | "running" | "completed" | "error";

const PROCESSING_MESSAGES = [
  "PROCESSING SHARDS...",
  "MERGING RECORDS...",
  "ENRICHING PROFILES...",
  "CRUNCHING DATA...",
  "AGGREGATING RESULTS...",
];

export default function Home() {
  const [state, setState] = useState<WorkflowState>("idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [result, setResult] = useState<WorkflowResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const processingIndexRef = useRef(0);

  const addLog = useCallback((message: string, type: LogEntry["type"] = "info") => {
    const timestamp = new Date();
    setLogs((prev) => [...prev, { timestamp, message, type }]);
  }, []);

  const updateLastLog = useCallback((message: string) => {
    setLogs((prev) => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      updated[updated.length - 1] = { ...updated[updated.length - 1], message };
      return updated;
    });
  }, []);

  const runWorkflow = async () => {
    setState("running");
    setLogs([]);
    setResult(null);
    setError(null);

    addLog("WORKFLOW STARTED", "success");

    try {
      addLog("TRIGGERING MERGE WORKFLOW...");
      const { runId } = await triggerWorkflow();
      addLog(`RUN ID: ${runId}`, "success");
      addLog("SPAWNING 10 PARALLEL SHARD TASKS...");
      
      // Add cycling status message immediately
      addLog(PROCESSING_MESSAGES[0], "info");
      processingIndexRef.current = 0;

      // Poll for completion
      let workflowResult: WorkflowResult | null = null;
      let attempts = 0;
      const maxAttempts = 120;
      let nextMessageChange = 2 + Math.floor(Math.random() * 2); // First change after 1-1.5s

      while (attempts < maxAttempts) {
        const status = await pollWorkflowStatus(runId);

        // Cycle through processing messages while not completed
        if (status.status !== "completed" && status.status !== "failed" && attempts >= nextMessageChange) {
          processingIndexRef.current = (processingIndexRef.current + 1) % PROCESSING_MESSAGES.length;
          updateLastLog(PROCESSING_MESSAGES[processingIndexRef.current]);
          // Next change in 2-4 polls (1-2 seconds)
          nextMessageChange = attempts + 2 + Math.floor(Math.random() * 3);
        }

        if (status.status === "completed") {
          workflowResult = status;
          break;
        }
        if (status.status === "failed") {
          throw new Error(status.error || "Workflow failed");
        }

        attempts++;
        await new Promise((r) => setTimeout(r, 500));
      }

      if (!workflowResult) {
        throw new Error("Workflow timed out");
      }

      const shardCount = workflowResult.shardTimings?.length || workflowResult.shardsProcessed || 10;
      addLog(`ALL ${shardCount} SHARDS COMPLETE`, "success");
      
      if (workflowResult.shardTimings && workflowResult.shardTimings.length > 0) {
        const fastestMs = Math.min(...workflowResult.shardTimings.map(s => s.elapsed_ms));
        const slowestMs = Math.max(...workflowResult.shardTimings.map(s => s.elapsed_ms));
        addLog(`SHARD TIMES: ${(fastestMs/1000).toFixed(1)}s - ${(slowestMs/1000).toFixed(1)}s`, "info");
      }
      
      addLog("AGGREGATING RESULTS...");
      addLog(
        `WORKFLOW COMPLETE - ${workflowResult.profilesGenerated?.toLocaleString()} PROFILES`,
        "success"
      );

      setResult(workflowResult);
      setState("completed");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      addLog(`ERROR: ${message}`, "error");
      setError(message);
      setState("error");
    }
  };

  return (
    <main className="min-h-screen p-8">
      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-normal tracking-tight">
            CUSTOMER DATA MERGE
          </h1>
          <a
            href="/how-it-works"
            className="brutalist-btn text-xs py-2 px-4"
          >
            HOW IT WORKS
          </a>
        </div>
        <p className="text-neutral-500 text-sm">
          Merge 400K records from 4 sources using parallel{" "}
          <a
            href="https://render.com/docs/workflows"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/80 hover:underline"
          >
            Render Workflows
          </a>
          . 10 shards processed simultaneously.
        </p>
      </header>

      {/* Controls */}
      <WorkflowTrigger onRun={runWorkflow} isRunning={state === "running"} />

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        {/* Event Log */}
        <div className="brutalist-card">
          <h2 className="text-lg font-bold mb-4 border-b border-white pb-2">
            EVENT LOG
          </h2>
          <EventLog logs={logs} isRunning={state === "running"} />
        </div>

        {/* Data Preview */}
        <div className="brutalist-card">
          <h2 className="text-lg font-bold mb-4 border-b border-white pb-2">
            DATA PREVIEW
          </h2>
          <DataPreview result={result} />
        </div>
      </div>

      {/* Results Summary */}
      {(state === "completed" || state === "error") && (
        <ResultsSummary result={result} error={error} />
      )}
    </main>
  );
}
