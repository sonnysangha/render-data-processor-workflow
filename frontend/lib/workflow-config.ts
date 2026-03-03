import type { WorkflowConfig } from "workflow-visualizer";

export const workflowConfig: WorkflowConfig = {
  title: "CUSTOMER DATA MERGE",
  subtitle: "How Render Workflows processes 400K records in parallel",
  nodes: [
    // Trigger
    {
      id: "api-trigger",
      label: "API Trigger",
      type: "trigger",
      description: "Frontend calls /trigger endpoint to start the workflow",
      position: { x: 400, y: 50 },
      details: [
        { label: "Endpoint", value: "POST /trigger" },
        { label: "Response", value: "{ runId: string }" },
      ],
    },
    // Orchestrator
    {
      id: "orchestrator",
      label: "merge_customer_data",
      type: "orchestrator",
      description: "Main orchestrator task that spawns 10 parallel shard workers and aggregates results",
      position: { x: 400, y: 180 },
      details: [
        { label: "Retries", value: "2" },
        { label: "Spawns", value: "10 parallel subtasks" },
      ],
    },
    // Batch task (shards)
    {
      id: "process-shards",
      label: "process_shard",
      type: "batch",
      description: "10 parallel workers, each processing ~10K customers. Each shard loads its own data to avoid large payload transfers.",
      position: { x: 400, y: 320 },
      details: [
        { label: "Parallelism", value: "10 shards" },
        { label: "Records/shard", value: "~10,000" },
        { label: "Sharding", value: "Hash-based on customer_id" },
      ],
    },
    // Data sources
    {
      id: "crm-data",
      label: "crm.csv",
      type: "task",
      description: "CRM data: customer info, company details, deal stage, sales data",
      position: { x: 100, y: 480 },
      details: [
        { label: "Records", value: "100,000" },
        { label: "Fields", value: "customer_id, company_name, industry, deal_stage, region" },
      ],
    },
    {
      id: "billing-data",
      label: "billing.csv",
      type: "task",
      description: "Billing data: subscription plans, MRR, payment status",
      position: { x: 300, y: 480 },
      details: [
        { label: "Records", value: "100,000" },
        { label: "Fields", value: "plan, mrr, payment_status, billing_cycle" },
      ],
    },
    {
      id: "product-data",
      label: "product.csv",
      type: "task",
      description: "Product usage data: sessions, feature usage, API calls",
      position: { x: 500, y: 480 },
      details: [
        { label: "Records", value: "100,000" },
        { label: "Fields", value: "total_sessions, usage_pct, features_used, api_calls" },
      ],
    },
    {
      id: "support-data",
      label: "support.csv",
      type: "task",
      description: "Support data: tickets, NPS scores, resolution times",
      position: { x: 700, y: 480 },
      details: [
        { label: "Records", value: "100,000" },
        { label: "Fields", value: "total_tickets, nps_score, avg_resolution_hrs" },
      ],
    },
    // Enrichment
    {
      id: "enrich",
      label: "Enrich Profiles",
      type: "task",
      description: "Calculate health_score, churn_risk, and expansion_potential for each customer",
      position: { x: 400, y: 620 },
      details: [
        { label: "Calculations", value: "health_score, churn_risk, expansion_potential" },
        { label: "Output", value: "Enriched customer profiles" },
      ],
    },
    // Aggregate
    {
      id: "aggregate",
      label: "Aggregate Results",
      type: "task",
      description: "Combine all shard results into final output with statistics",
      position: { x: 400, y: 760 },
      details: [
        { label: "Output", value: "100,000 enriched profiles" },
        { label: "Stats", value: "avg_health_score, churn_distribution" },
      ],
    },
  ],
  edges: [
    { id: "trigger-orch", from: "api-trigger", to: "orchestrator", style: "solid" },
    { id: "orch-shards", from: "orchestrator", to: "process-shards", label: "spawns 10", style: "solid" },
    { id: "shards-crm", from: "process-shards", to: "crm-data", label: "loads", style: "dashed" },
    { id: "shards-billing", from: "process-shards", to: "billing-data", label: "loads", style: "dashed" },
    { id: "shards-product", from: "process-shards", to: "product-data", label: "loads", style: "dashed" },
    { id: "shards-support", from: "process-shards", to: "support-data", label: "loads", style: "dashed" },
    { id: "shards-enrich", from: "process-shards", to: "enrich", label: "merges", style: "solid" },
    { id: "enrich-agg", from: "enrich", to: "aggregate", style: "solid" },
  ],
  defaultTrigger: "api-trigger",
  triggerFlows: [
    {
      triggerId: "api-trigger",
      nodes: [
        "api-trigger",
        "orchestrator",
        "process-shards",
        "crm-data",
        "billing-data",
        "product-data",
        "support-data",
        "enrich",
        "aggregate",
      ],
      edges: [
        "trigger-orch",
        "orch-shards",
        "shards-crm",
        "shards-billing",
        "shards-product",
        "shards-support",
        "shards-enrich",
        "enrich-agg",
      ],
      animationSequence: [
        {
          id: "step-1",
          activeNodes: ["api-trigger"],
          activeEdges: [],
          duration: 3500,
          title: "API Trigger",
          description: "Frontend calls POST /trigger to start the workflow. Returns a run ID for polling status.",
        },
        {
          id: "step-2",
          activeNodes: ["api-trigger", "orchestrator"],
          activeEdges: ["trigger-orch"],
          duration: 3500,
          title: "Orchestrator Starts",
          description: "The merge_customer_data task starts. This is the main orchestrator that coordinates the parallel processing.",
        },
        {
          id: "step-3",
          activeNodes: ["orchestrator", "process-shards"],
          activeEdges: ["orch-shards"],
          duration: 3500,
          title: "Spawn Parallel Shards",
          description: "Orchestrator spawns 10 parallel process_shard tasks. Each shard handles ~10K customers based on hash of customer_id.",
        },
        {
          id: "step-4",
          activeNodes: ["process-shards", "crm-data", "billing-data", "product-data", "support-data"],
          activeEdges: ["shards-crm", "shards-billing", "shards-product", "shards-support"],
          duration: 4000,
          title: "Load Data Sources",
          description: "Each shard loads all 4 CSV files and filters to only records belonging to its shard. This avoids large payload transfers between tasks.",
        },
        {
          id: "step-5",
          activeNodes: ["process-shards", "enrich"],
          activeEdges: ["shards-enrich"],
          duration: 3500,
          title: "Merge & Enrich",
          description: "Each shard merges records by customer_id and calculates health_score, churn_risk, and expansion_potential.",
        },
        {
          id: "step-6",
          activeNodes: ["enrich", "aggregate"],
          activeEdges: ["enrich-agg"],
          duration: 3500,
          title: "Aggregate Results",
          description: "Orchestrator collects results from all 10 shards and aggregates into final output with 100K enriched customer profiles.",
        },
      ],
    },
  ],
};
