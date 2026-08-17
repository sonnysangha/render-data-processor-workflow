import type { WorkflowResult } from "@/lib/api";

interface DataPreviewProps {
  result: WorkflowResult | null;
}

// Fields that come from each source (used to split the merged profile back into sources)
const sourceFields = {
  crm: [
    "customer_id",
    "company_name",
    "industry",
    "deal_stage",
    "region",
    "account_tier",
  ],
  billing: ["plan", "mrr", "payment_status", "billing_cycle", "last_payment"],
  product: [
    "total_sessions",
    "usage_pct",
    "last_active",
    "features_used",
    "api_calls",
  ],
  support: [
    "total_tickets",
    "nps_score",
    "avg_resolution_hrs",
    "last_ticket_date",
  ],
};

// Default sample data (shown before workflow runs)
const defaultSources = {
  crm: { customer_id: "—", company_name: "—", industry: "—", deal_stage: "—" },
  billing: { plan: "—", mrr: "—", payment_status: "—" },
  product: { total_sessions: "—", usage_pct: "—", last_active: "—" },
  support: { total_tickets: "—", nps_score: "—", avg_resolution_hrs: "—" },
};

// Extract source-specific fields from a merged profile
function extractSourceData(
  profile: Record<string, unknown>,
  source: keyof typeof sourceFields
) {
  const fields = sourceFields[source];
  const data: Record<string, unknown> = {};
  for (const field of fields) {
    if (
      field in profile &&
      profile[field] !== undefined &&
      profile[field] !== null
    ) {
      data[field] = profile[field];
    }
  }
  return Object.keys(data).length > 0 ? data : null;
}

function DataCard({
  title,
  data,
  highlight,
}: {
  title: string;
  data: Record<string, unknown>;
  highlight?: boolean;
}) {
  return (
    <div
      className={`border ${highlight ? "border-terminal-green" : "border-gray-700"} p-3 mb-2`}
    >
      <div
        className={`text-xs mb-2 ${highlight ? "text-terminal-green" : "text-gray-500"}`}
      >
        {title}
      </div>
      <div className="space-y-1">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="flex justify-between text-xs">
            <span className="text-gray-400">{key}:</span>
            <span
              className={
                highlight &&
                (key === "health_score" ||
                  key === "churn_risk" ||
                  key === "expansion_potential")
                  ? "text-terminal-green"
                  : "text-white"
              }
            >
              {typeof value === "number"
                ? value.toLocaleString()
                : String(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DataPreview({ result }: DataPreviewProps) {
  const profile = result?.sampleProfile as Record<string, unknown> | undefined;

  // Extract source data from the real profile, or use defaults
  const sources = profile
    ? {
        crm: extractSourceData(profile, "crm") || defaultSources.crm,
        billing:
          extractSourceData(profile, "billing") || defaultSources.billing,
        product:
          extractSourceData(profile, "product") || defaultSources.product,
        support:
          extractSourceData(profile, "support") || defaultSources.support,
      }
    : defaultSources;

  // For the enriched view, show calculated fields prominently
  const enrichedData = profile
    ? {
        customer_id: profile.customer_id,
        company_name: profile.company_name,
        plan: profile.plan,
        mrr: profile.mrr,
        health_score: profile.health_score,
        churn_risk: profile.churn_risk,
        expansion_potential: profile.expansion_potential,
      }
    : {
        customer_id: "—",
        company_name: "—",
        plan: "—",
        mrr: "—",
        health_score: "—",
        churn_risk: "—",
        expansion_potential: "—",
      };

  return (
    <div className="h-80 overflow-y-auto pr-3">
      {/* Before */}
      <div className="mb-4">
        <div className="text-xs text-gray-500 mb-2 uppercase tracking-wider">
          {profile
            ? `Before: Customer ${profile.customer_id}`
            : "Before: 4 Sources"}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <DataCard title="CRM" data={sources.crm} />
          <DataCard title="BILLING" data={sources.billing} />
          <DataCard title="PRODUCT" data={sources.product} />
          <DataCard title="SUPPORT" data={sources.support} />
        </div>
      </div>

      {/* Arrow */}
      <div className="text-center text-2xl text-gray-500 my-4">↓</div>

      {/* After */}
      <div>
        <div className="text-xs text-gray-500 mb-2 uppercase tracking-wider">
          {profile ? "After: Enriched Profile" : "After: Merged + Calculated"}
        </div>
        <DataCard
          title="MERGED + CALCULATED"
          data={enrichedData}
          highlight={!!result}
        />
      </div>
    </div>
  );
}
