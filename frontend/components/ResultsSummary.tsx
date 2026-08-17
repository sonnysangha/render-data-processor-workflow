import type { WorkflowResult } from "@/lib/api";

interface ResultsSummaryProps {
  result: WorkflowResult | null;
  error: string | null;
}

export default function ResultsSummary({ result, error }: ResultsSummaryProps) {
  if (error) {
    return (
      <div className="brutalist-card mt-6 border-terminal-red">
        <h2 className="text-lg font-bold mb-4 text-terminal-red">ERROR</h2>
        <p className="text-terminal-red">{error}</p>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="brutalist-card mt-6 border-terminal-green">
      <h2 className="text-lg font-bold mb-4 border-b border-terminal-green pb-2 text-terminal-green">
        RESULTS
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
        <div>
          <div className="text-3xl font-bold">
            {result.profilesGenerated?.toLocaleString() || "—"}
          </div>
          <div className="text-gray-400 text-sm uppercase">Profiles</div>
        </div>
        <div>
          <div className="text-3xl font-bold">
            {result.elapsedMs
              ? `${(result.elapsedMs / 1000).toFixed(2)}s`
              : "—"}
          </div>
          <div className="text-gray-400 text-sm uppercase">Time</div>
        </div>
        <div>
          <div className="text-3xl font-bold">
            {result.shardsProcessed || 10}
          </div>
          <div className="text-gray-400 text-sm uppercase">Parallel Tasks</div>
        </div>
        <div>
          <div className="text-3xl font-bold">
            {result.recordsProcessed?.toLocaleString() || "400,000"}
          </div>
          <div className="text-gray-400 text-sm uppercase">Records In</div>
        </div>
      </div>

      {/* Shard Timings Table */}
      {result.shardTimings && result.shardTimings.length > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-700">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">
            Parallel Task Runs
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            {result.shardTimings.map((shard) => (
              <div key={shard.shard_id} className="border border-gray-700 p-2">
                <div
                  className="text-terminal-green font-mono text-[10px] truncate"
                  title={shard.task_run_id}
                >
                  {shard.task_run_id}
                </div>
                <div className="text-white font-mono mt-1">
                  {(shard.elapsed_ms / 1000).toFixed(2)}s
                </div>
                <div className="text-gray-500">
                  {shard.count.toLocaleString()} profiles
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Speedup comparison - now using real data */}
      {result.totalSequentialMs && result.elapsedMs && (
        <div className="mt-4 pt-4 border-t border-gray-700">
          <div className="text-sm text-gray-400">
            <span className="text-white">If sequential:</span>{" "}
            {(result.totalSequentialMs / 1000).toFixed(2)}s |{" "}
            <span className="text-white">Actual parallel:</span>{" "}
            {(result.elapsedMs / 1000).toFixed(2)}s |{" "}
            <span className="text-terminal-green">
              Speedup:{" "}
              {(result.totalSequentialMs / result.elapsedMs).toFixed(1)}x
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
