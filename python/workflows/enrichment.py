"""Customer profile enrichment calculations."""

from typing import Any


def calculate_health_score(profile: dict[str, Any]) -> int:
    """
    Calculate a health score (0-100) based on customer data.
    
    Factors:
    - Usage percentage (product engagement)
    - Payment status (billing health)
    - NPS score (customer satisfaction)
    - Support ticket volume (potential issues)
    """
    score = 50  # Base score
    
    # Usage factor (+/- 20 points)
    usage_pct = profile.get("usage_pct", 50)
    if usage_pct >= 80:
        score += 20
    elif usage_pct >= 60:
        score += 10
    elif usage_pct < 30:
        score -= 10
    
    # Payment factor (+/- 15 points)
    payment_status = profile.get("payment_status", "").lower()
    if payment_status == "active":
        score += 15
    elif payment_status in ("past_due", "failed"):
        score -= 15
    
    # NPS factor (+/- 10 points)
    nps_score = profile.get("nps_score")
    if nps_score is not None:
        if nps_score >= 9:
            score += 10
        elif nps_score >= 7:
            score += 5
        elif nps_score <= 5:
            score -= 10
    
    # Support tickets factor (+/- 5 points)
    open_tickets = profile.get("open_tickets", 0)
    if open_tickets == 0:
        score += 5
    elif open_tickets > 3:
        score -= 5
    
    return max(0, min(100, score))


def calculate_churn_risk(profile: dict[str, Any]) -> str:
    """
    Calculate churn risk level based on customer signals.
    
    Returns: "LOW", "MEDIUM", or "HIGH"
    """
    risk_score = 0
    
    # Low usage = higher risk
    usage_pct = profile.get("usage_pct", 50)
    if usage_pct < 30:
        risk_score += 3
    elif usage_pct < 50:
        risk_score += 1
    
    # Payment issues = higher risk
    payment_status = profile.get("payment_status", "").lower()
    if payment_status in ("past_due", "failed"):
        risk_score += 3
    
    # Low NPS = higher risk
    nps_score = profile.get("nps_score")
    if nps_score is not None and nps_score <= 6:
        risk_score += 2
    
    # Many open tickets = higher risk
    open_tickets = profile.get("open_tickets", 0)
    if open_tickets > 3:
        risk_score += 1
    
    # No recent activity = higher risk
    # (would check last_active date in real implementation)
    
    if risk_score >= 5:
        return "HIGH"
    elif risk_score >= 2:
        return "MEDIUM"
    return "LOW"


def calculate_expansion_potential(profile: dict[str, Any]) -> str:
    """
    Calculate expansion/upsell potential based on customer signals.
    
    Returns: "LOW", "MEDIUM", or "HIGH"
    """
    potential_score = 0
    
    # High usage = expansion potential
    usage_pct = profile.get("usage_pct", 50)
    if usage_pct >= 80:
        potential_score += 3
    elif usage_pct >= 60:
        potential_score += 1
    
    # Lower tier plans = upgrade potential
    plan = profile.get("plan", "").lower()
    if plan in ("starter", "free", "basic"):
        potential_score += 2
    elif plan in ("business", "professional"):
        potential_score += 1
    
    # High NPS = likely to expand
    nps_score = profile.get("nps_score")
    if nps_score is not None and nps_score >= 9:
        potential_score += 2
    
    # Deal stage consideration
    deal_stage = profile.get("deal_stage", "").lower()
    if deal_stage == "enterprise":
        potential_score += 1
    
    if potential_score >= 5:
        return "HIGH"
    elif potential_score >= 2:
        return "MEDIUM"
    return "LOW"


def enrich_profile(profile: dict[str, Any]) -> dict[str, Any]:
    """
    Add calculated fields to a customer profile.
    
    Args:
        profile: Merged customer data from all sources
        
    Returns:
        Profile with health_score, churn_risk, expansion_potential added
    """
    enriched = profile.copy()
    enriched["health_score"] = calculate_health_score(profile)
    enriched["churn_risk"] = calculate_churn_risk(profile)
    enriched["expansion_potential"] = calculate_expansion_potential(profile)
    return enriched
