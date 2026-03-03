"use client";

import { WorkflowVisualizer } from "workflow-visualizer";
import { workflowConfig } from "@/lib/workflow-config";

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen relative p-8">
      <a
        href="/"
        className="absolute top-8 right-8 z-50 brutalist-btn text-xs py-2 px-4"
      >
        BACK TO DEMO
      </a>
      <WorkflowVisualizer
        config={workflowConfig}
        defaultSelectedNode="api-trigger"
      />
    </div>
  );
}
