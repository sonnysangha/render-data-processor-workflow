"use client";

import { useEffect, useRef } from "react";

export interface LogEntry {
  timestamp: Date;
  message: string;
  type: "info" | "success" | "error" | "warning";
}

interface EventLogProps {
  logs: LogEntry[];
  isRunning: boolean;
}

function formatTimestamp(date: Date, start?: Date): string {
  if (!start) return "00:00.00";
  const diff = date.getTime() - start.getTime();
  const seconds = Math.floor(diff / 1000);
  const ms = Math.floor((diff % 1000) / 10);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

function getTypeColor(type: LogEntry["type"]): string {
  switch (type) {
    case "success":
      return "text-terminal-green";
    case "error":
      return "text-terminal-red";
    case "warning":
      return "text-terminal-amber";
    default:
      return "text-white";
  }
}

export default function EventLog({ logs, isRunning }: EventLogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startTime = logs.length > 0 ? logs[0].timestamp : undefined;

  // Auto-scroll to bottom when logs change
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally trigger on logs.length change
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs.length]);

  return (
    <div
      ref={containerRef}
      className="font-mono text-sm h-80 overflow-y-auto bg-black"
    >
      {logs.length === 0 ? (
        <div className="text-gray-500">{">"} WAITING FOR WORKFLOW START...</div>
      ) : (
        logs.map((log, index) => {
          const isLastLog = index === logs.length - 1;
          const showCursor = isRunning && isLastLog;
          return (
            <div
              key={`${log.timestamp.getTime()}-${index}`}
              className="flex gap-4 py-0.5"
            >
              <span className={getTypeColor(log.type)}>
                {">"} {log.message}
                {showCursor && <span className="cursor-blink">_</span>}
              </span>
              <span className="text-gray-500 ml-auto">
                {formatTimestamp(log.timestamp, startTime)}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}
