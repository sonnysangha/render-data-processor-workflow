/**
 * Customer profile enrichment calculations.
 */

export interface CustomerProfile {
  customer_id: string;
  [key: string]: unknown;
}

export interface EnrichedProfile extends CustomerProfile {
  health_score: number;
  churn_risk: "LOW" | "MEDIUM" | "HIGH";
  expansion_potential: "LOW" | "MEDIUM" | "HIGH";
}

/**
 * Calculate a health score (0-100) based on customer data.
 */
export function calculateHealthScore(
  profile: Record<string, unknown>
): number {
  let score = 50; // Base score

  // Usage factor (+/- 20 points)
  const usagePct = (profile.usage_pct as number) ?? 50;
  if (usagePct >= 80) {
    score += 20;
  } else if (usagePct >= 60) {
    score += 10;
  } else if (usagePct < 30) {
    score -= 10;
  }

  // Payment factor (+/- 15 points)
  const paymentStatus = String(profile.payment_status ?? "").toLowerCase();
  if (paymentStatus === "active") {
    score += 15;
  } else if (paymentStatus === "past_due" || paymentStatus === "failed") {
    score -= 15;
  }

  // NPS factor (+/- 10 points)
  const npsScore = profile.nps_score as number | undefined;
  if (npsScore !== undefined) {
    if (npsScore >= 9) {
      score += 10;
    } else if (npsScore >= 7) {
      score += 5;
    } else if (npsScore <= 5) {
      score -= 10;
    }
  }

  // Support tickets factor (+/- 5 points)
  const openTickets = (profile.open_tickets as number) ?? 0;
  if (openTickets === 0) {
    score += 5;
  } else if (openTickets > 3) {
    score -= 5;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate churn risk level based on customer signals.
 */
export function calculateChurnRisk(
  profile: Record<string, unknown>
): "LOW" | "MEDIUM" | "HIGH" {
  let riskScore = 0;

  // Low usage = higher risk
  const usagePct = (profile.usage_pct as number) ?? 50;
  if (usagePct < 30) {
    riskScore += 3;
  } else if (usagePct < 50) {
    riskScore += 1;
  }

  // Payment issues = higher risk
  const paymentStatus = String(profile.payment_status ?? "").toLowerCase();
  if (paymentStatus === "past_due" || paymentStatus === "failed") {
    riskScore += 3;
  }

  // Low NPS = higher risk
  const npsScore = profile.nps_score as number | undefined;
  if (npsScore !== undefined && npsScore <= 6) {
    riskScore += 2;
  }

  // Many open tickets = higher risk
  const openTickets = (profile.open_tickets as number) ?? 0;
  if (openTickets > 3) {
    riskScore += 1;
  }

  if (riskScore >= 5) {
    return "HIGH";
  } else if (riskScore >= 2) {
    return "MEDIUM";
  }
  return "LOW";
}

/**
 * Calculate expansion/upsell potential based on customer signals.
 */
export function calculateExpansionPotential(
  profile: Record<string, unknown>
): "LOW" | "MEDIUM" | "HIGH" {
  let potentialScore = 0;

  // High usage = expansion potential
  const usagePct = (profile.usage_pct as number) ?? 50;
  if (usagePct >= 80) {
    potentialScore += 3;
  } else if (usagePct >= 60) {
    potentialScore += 1;
  }

  // Lower tier plans = upgrade potential
  const plan = String(profile.plan ?? "").toLowerCase();
  if (["starter", "free", "basic"].includes(plan)) {
    potentialScore += 2;
  } else if (["business", "professional"].includes(plan)) {
    potentialScore += 1;
  }

  // High NPS = likely to expand
  const npsScore = profile.nps_score as number | undefined;
  if (npsScore !== undefined && npsScore >= 9) {
    potentialScore += 2;
  }

  // Deal stage consideration
  const dealStage = String(profile.deal_stage ?? "").toLowerCase();
  if (dealStage === "enterprise") {
    potentialScore += 1;
  }

  if (potentialScore >= 5) {
    return "HIGH";
  } else if (potentialScore >= 2) {
    return "MEDIUM";
  }
  return "LOW";
}

/**
 * Add calculated fields to a customer profile.
 */
export function enrichProfile(
  profile: Record<string, unknown>
): EnrichedProfile {
  return {
    ...profile,
    customer_id: String(profile.customer_id),
    health_score: calculateHealthScore(profile),
    churn_risk: calculateChurnRisk(profile),
    expansion_potential: calculateExpansionPotential(profile),
  };
}
