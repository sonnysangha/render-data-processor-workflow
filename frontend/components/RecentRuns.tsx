"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchRecentRuns, type RecentRun } from "@/lib/api";

interface RecentRunsProps {
  refreshKey: number;
}

const RUN_LIMIT = 5;

function formatRunId(runId: string): string {
  if (runId.length <= 22) return runId;
  return `${runId.slice(0, 13)}...${runId.slice(-6)}`;
}

function formatCount(value: number | undefined): string {
  return value === undefined ? "—" : value.toLocaleString();
}

function formatDuration(elapsedMs: number | undefined): string {
  if (elapsedMs === undefined) return "—";
  if (elapsedMs < 1000) return `${elapsedMs.toString()}ms`;
  return `${(elapsedMs / 1000).toFixed(2)}s`;
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function getStatusClass(status: string): string {
  switch (status.toLowerCase()) {
    case "completed":
      return "border-terminal-green text-terminal-green";
    case "failed":
      return "border-terminal-red text-terminal-red";
    case "pending":
    case "running":
      return "border-terminal-amber text-terminal-amber";
    default:
      return "border-gray-500 text-gray-300";
  }
}

export default function RecentRuns({ refreshKey }: RecentRunsProps) {
  const [runs, setRuns] = useState<RecentRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const loadRuns = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const recentRuns = await fetchRecentRuns(RUN_LIMIT, controller.signal);
      setRuns(recentRuns);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(
        err instanceof Error ? err.message : "Unable to load Postgres history."
      );
    } finally {
      if (requestRef.current === controller) {
        setIsLoading(false);
      }
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey intentionally retriggers the database query after a completed workflow
  useEffect(() => {
    void loadRuns();
    return () => requestRef.current?.abort();
  }, [loadRuns, refreshKey]);

  return (
    <section
      className="brutalist-card mt-6 overflow-hidden p-0"
      aria-labelledby="recent-runs-heading"
      aria-busy={isLoading}
    >
      <div className="flex flex-col gap-4 border-b border-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h2
              id="recent-runs-heading"
              className="text-lg font-bold tracking-tight"
            >
              RECENT RUNS{" "}
              <span className="text-terminal-green">· POSTGRES</span>
            </h2>
            <span className="inline-flex items-center gap-2 border border-terminal-green px-2 py-1 text-[10px] uppercase tracking-widest text-terminal-green">
              <span
                className="h-1.5 w-1.5 bg-terminal-green"
                aria-hidden="true"
              />
              Durable
            </span>
          </div>
          <p className="text-xs text-gray-500">
            LAST 5 WORKFLOW RESULTS · PERSISTED ACROSS API REDEPLOYS
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadRuns()}
          disabled={isLoading}
          className="brutalist-btn self-start px-3 py-2 text-xs sm:self-auto"
          aria-label="Refresh recent workflow runs from Postgres"
        >
          <span aria-hidden="true">↻</span> {isLoading ? "SYNCING" : "REFRESH"}
        </button>
      </div>

      <div className="min-h-48" aria-live="polite">
        {isLoading && runs.length === 0 ? (
          <div className="flex min-h-48 items-center justify-center p-8 text-sm text-gray-500">
            <span className="mr-3 inline-block h-3 w-3 animate-spin border border-white border-t-transparent" />
            QUERYING WORKFLOW_RUNS...
          </div>
        ) : error ? (
          <div className="flex min-h-48 flex-col items-start justify-center gap-4 p-6">
            <div>
              <p className="text-sm text-terminal-red">
                {">"} POSTGRES HISTORY UNAVAILABLE
              </p>
              <p className="mt-2 max-w-3xl text-xs leading-relaxed text-gray-500">
                {error}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadRuns()}
              className="brutalist-btn px-3 py-2 text-xs"
            >
              RETRY QUERY
            </button>
          </div>
        ) : runs.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center p-8 text-center">
            <div className="mb-3 text-2xl text-gray-700" aria-hidden="true">
              ▱
            </div>
            <p className="text-sm text-gray-400">NO PERSISTED RUNS YET</p>
            <p className="mt-2 text-xs text-gray-600">
              RUN THE WORKFLOW TO WRITE THE FIRST POSTGRES ROW.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left text-xs">
              <caption className="sr-only">
                Five most recent workflow runs persisted in Postgres
              </caption>
              <thead>
                <tr className="border-b border-gray-800 text-[10px] uppercase tracking-widest text-gray-500">
                  <th scope="col" className="px-6 py-3 font-normal">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-normal">
                    Run ID
                  </th>
                  <th scope="col" className="px-4 py-3 font-normal">
                    Profiles
                  </th>
                  <th scope="col" className="px-4 py-3 font-normal">
                    Records
                  </th>
                  <th scope="col" className="px-4 py-3 font-normal">
                    Shards
                  </th>
                  <th scope="col" className="px-4 py-3 font-normal">
                    Started
                  </th>
                  <th scope="col" className="px-6 py-3 text-right font-normal">
                    Duration
                  </th>
                </tr>
              </thead>
              <tbody className={isLoading ? "opacity-50" : undefined}>
                {runs.map((run) => (
                  <tr
                    key={run.runId}
                    className="border-b border-gray-900 transition-colors last:border-b-0 hover:bg-white/[0.04]"
                  >
                    <td className="px-6 py-4">
                      <span
                        className={[
                          "inline-block border px-2 py-1 text-[10px] uppercase tracking-wider",
                          getStatusClass(run.status),
                        ].join(" ")}
                      >
                        {run.status}
                      </span>
                    </td>
                    <th
                      scope="row"
                      className="px-4 py-4 font-normal text-white"
                      title={run.runId}
                    >
                      {formatRunId(run.runId)}
                    </th>
                    <td className="px-4 py-4 text-gray-200">
                      {formatCount(run.profilesGenerated)}
                    </td>
                    <td className="px-4 py-4 text-gray-400">
                      {formatCount(run.recordsProcessed)}
                    </td>
                    <td className="px-4 py-4 text-gray-400">
                      {formatCount(run.shardsProcessed)}
                    </td>
                    <td className="px-4 py-4 text-gray-400">
                      <time dateTime={run.startedAt}>
                        {formatTimestamp(run.startedAt)}
                      </time>
                    </td>
                    <td className="px-6 py-4 text-right text-terminal-green">
                      {formatDuration(run.elapsedMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
