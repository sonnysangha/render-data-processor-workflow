#!/usr/bin/env python3
"""
Generate sample CSV data for the Customer Data Merge workflow demo.

Creates 4 CSV files with realistic-looking customer data:
- crm.csv: CRM/sales data
- billing.csv: Billing/subscription data
- product.csv: Product usage data
- support.csv: Support/ticket data

Usage:
    python generate_data.py                    # Generate 100K rows (default)
    python generate_data.py --rows 10000       # Generate 10K rows
    python generate_data.py --rows 1000000     # Generate 1M rows
"""

import argparse
import csv
import random
import string
from datetime import datetime, timedelta
from pathlib import Path


# Configuration
OUTPUT_DIR = Path(__file__).parent.parent / "sample_data"

INDUSTRIES = [
    "Technology", "Healthcare", "Finance", "Retail", "Manufacturing",
    "Education", "Media", "Real Estate", "Transportation", "Energy"
]

COMPANY_PREFIXES = [
    "Acme", "Global", "Tech", "Smart", "Cloud", "Data", "Cyber", "Next",
    "Prime", "Elite", "Peak", "Core", "Apex", "Nova", "Quantum"
]

COMPANY_SUFFIXES = [
    "Corp", "Inc", "Labs", "Systems", "Solutions", "Group", "Technologies",
    "Dynamics", "Ventures", "Digital", "Analytics", "Networks", "AI"
]

PLANS = ["Starter", "Business", "Professional", "Enterprise"]
PAYMENT_STATUSES = ["Active", "Active", "Active", "Active", "Past Due", "Failed"]  # Weighted toward active
DEAL_STAGES = ["Lead", "Qualified", "Proposal", "Negotiation", "Closed Won", "Enterprise"]

FIRST_NAMES = [
    "James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda",
    "William", "Elizabeth", "David", "Barbara", "Richard", "Susan", "Joseph", "Jessica",
    "Thomas", "Sarah", "Charles", "Karen", "Chris", "Alex", "Jordan", "Taylor", "Morgan"
]

LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
    "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Thompson", "White", "Harris"
]


def generate_customer_id(index: int) -> str:
    """Generate a unique customer ID."""
    return f"cust_{index:08d}"


def generate_email(company_name: str, first_name: str, last_name: str) -> str:
    """Generate a plausible email address."""
    domain = company_name.lower().replace(" ", "").replace(",", "")[:15]
    return f"{first_name.lower()}.{last_name.lower()}@{domain}.com"


def generate_company_name() -> str:
    """Generate a random company name."""
    prefix = random.choice(COMPANY_PREFIXES)
    suffix = random.choice(COMPANY_SUFFIXES)
    return f"{prefix} {suffix}"


def random_date(start_days_ago: int, end_days_ago: int = 0) -> str:
    """Generate a random date string."""
    days_ago = random.randint(end_days_ago, start_days_ago)
    date = datetime.now() - timedelta(days=days_ago)
    return date.strftime("%Y-%m-%d")


def generate_crm_data(num_rows: int) -> list[dict]:
    """Generate CRM data records."""
    records = []
    
    for i in range(1, num_rows + 1):
        customer_id = generate_customer_id(i)
        company_name = generate_company_name()
        first_name = random.choice(FIRST_NAMES)
        last_name = random.choice(LAST_NAMES)
        
        records.append({
            "customer_id": customer_id,
            "email": generate_email(company_name, first_name, last_name),
            "company_name": company_name,
            "industry": random.choice(INDUSTRIES),
            "employee_count": random.choice([10, 25, 50, 100, 250, 500, 1000, 2500, 5000]),
            "deal_stage": random.choice(DEAL_STAGES),
            "deal_value": random.randint(1000, 100000),
            "sales_owner": f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}",
            "last_contact": random_date(90),
        })
    
    return records


def generate_billing_data(num_rows: int) -> list[dict]:
    """Generate billing data records."""
    records = []
    
    for i in range(1, num_rows + 1):
        customer_id = generate_customer_id(i)
        plan = random.choice(PLANS)
        
        # MRR based on plan
        mrr_ranges = {
            "Starter": (29, 99),
            "Business": (99, 499),
            "Professional": (499, 1999),
            "Enterprise": (1999, 9999),
        }
        mrr_min, mrr_max = mrr_ranges[plan]
        
        records.append({
            "customer_id": customer_id,
            "email": f"billing_{i}@example.com",  # Will be overwritten in merge
            "plan": plan,
            "mrr": random.randint(mrr_min, mrr_max),
            "payment_status": random.choice(PAYMENT_STATUSES),
            "subscription_start": random_date(730, 30),  # 30 days to 2 years ago
            "last_payment": random_date(30),
        })
    
    return records


def generate_product_data(num_rows: int) -> list[dict]:
    """Generate product usage data records."""
    records = []
    
    for i in range(1, num_rows + 1):
        customer_id = generate_customer_id(i)
        
        # Generate correlated data
        total_sessions = random.randint(10, 2000)
        usage_pct = min(100, max(5, int(random.gauss(60, 25))))
        
        records.append({
            "customer_id": customer_id,
            "email": f"product_{i}@example.com",  # Will be overwritten in merge
            "signup_date": random_date(730, 30),
            "last_active": random_date(30),
            "total_sessions": total_sessions,
            "features_used": random.randint(3, 25),
            "usage_pct": usage_pct,
            "account_status": random.choice(["Active", "Active", "Active", "Inactive", "Trial"]),
        })
    
    return records


def generate_support_data(num_rows: int) -> list[dict]:
    """Generate support ticket data records."""
    records = []
    
    for i in range(1, num_rows + 1):
        customer_id = generate_customer_id(i)
        
        total_tickets = random.randint(0, 20)
        open_tickets = min(total_tickets, random.randint(0, 3))
        
        records.append({
            "customer_id": customer_id,
            "email": f"support_{i}@example.com",  # Will be overwritten in merge
            "total_tickets": total_tickets,
            "open_tickets": open_tickets,
            "avg_resolution_hrs": round(random.uniform(1, 48), 1),
            "last_ticket_date": random_date(180) if total_tickets > 0 else "",
            "nps_score": random.randint(1, 10),
            "csat_score": round(random.uniform(1, 5), 1),
        })
    
    return records


def write_csv(filename: str, records: list[dict]) -> None:
    """Write records to a CSV file."""
    if not records:
        return
    
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    filepath = OUTPUT_DIR / filename
    
    with open(filepath, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=records[0].keys())
        writer.writeheader()
        writer.writerows(records)
    
    print(f"  Created {filepath} ({len(records):,} rows)")


def main():
    parser = argparse.ArgumentParser(description="Generate sample CSV data")
    parser.add_argument(
        "--rows", "-r",
        type=int,
        default=100000,
        help="Number of rows per CSV file (default: 100000)"
    )
    args = parser.parse_args()
    
    num_rows = args.rows
    print(f"Generating {num_rows:,} rows per CSV file...")
    print()
    
    # Generate all data
    print("Generating CRM data...")
    crm_data = generate_crm_data(num_rows)
    write_csv("crm.csv", crm_data)
    
    print("Generating billing data...")
    billing_data = generate_billing_data(num_rows)
    write_csv("billing.csv", billing_data)
    
    print("Generating product data...")
    product_data = generate_product_data(num_rows)
    write_csv("product.csv", product_data)
    
    print("Generating support data...")
    support_data = generate_support_data(num_rows)
    write_csv("support.csv", support_data)
    
    print()
    print(f"Done! Generated {num_rows * 4:,} total records in {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
