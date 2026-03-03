interface WorkflowTriggerProps {
  onRun: () => void;
  isRunning: boolean;
}

export default function WorkflowTrigger({
  onRun,
  isRunning,
}: WorkflowTriggerProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
      {/* Run Button */}
      <button
        type="button"
        onClick={onRun}
        disabled={isRunning}
        className="border-2 border-white bg-white text-black hover:bg-black hover:text-white px-6 py-3 font-mono uppercase tracking-wider transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {isRunning ? (
          <>
            <span className="inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
            RUNNING...
          </>
        ) : (
          <>
            <span className="text-xl">▶</span>
            RUN WORKFLOW
          </>
        )}
      </button>

      {/* Info */}
      <div className="text-gray-400 text-sm">
        <span className="text-white">400K</span> records →{" "}
        <span className="text-white">10</span> parallel shards →{" "}
        <span className="text-white">100K</span> profiles
      </div>
    </div>
  );
}
