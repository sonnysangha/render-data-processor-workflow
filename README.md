# Customer Data Merge - Render Workflows Demo

Merge customer data from multiple sources into enriched profiles using parallel Render Workflows.

This demo showcases:

- **Parallel processing**: 10 shards processed simultaneously
- **Multi-source merge**: CRM + Billing + Product + Support → Enriched profiles
- **High throughput**: 400K input records split across 10 parallel tasks
- **Both Python and TypeScript**: Identical implementations in both languages

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js)                           │
│                     UI - Trigger & Monitor                          │
└─────────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│    Python API           │     │    TypeScript API       │
│    (FastAPI)            │     │    (Fastify)            │
└─────────────────────────┘     └─────────────────────────┘
              │                               │
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│   Python Workflow       │     │   TypeScript Workflow   │
│   (render_sdk)          │     │   (@renderinc/sdk)      │
└─────────────────────────┘     └─────────────────────────┘
              │                               │
              └───────────────┬───────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         SAMPLE DATA                                  │
│   crm.csv │ billing.csv │ product.csv │ support.csv (100K each)     │
└─────────────────────────────────────────────────────────────────────┘
```

## Workflow: Shard-Based Parallel Processing

The workflow uses hash-based sharding to ensure deterministic routing:

1. **Load**: Read all 4 CSV source files
2. **Route**: Hash each `customer_id` to assign records to 10 shards
3. **Process**: Spawn 10 parallel subtasks (one per shard)
4. **Merge**: Each shard merges its customers' data from all sources
5. **Enrich**: Calculate health_score, churn_risk, expansion_potential
6. **Aggregate**: Combine all shard results into final output

```
customer_id → hash(customer_id) % 10 → shard_id
```

Same customer always routes to the same shard across all files.

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 20+
- [Render CLI](https://render.com/docs/cli) 2.11.0+ (`brew install render` on macOS)
- Render account with Workflows access

### Local Development

1. **Generate sample data**:

   ```bash
   cd scripts
   python generate_data.py --rows 1000  # Small dataset for testing
   # python generate_data.py --rows 100000  # Full 100K dataset
   ```

2. **Start the local workflow server** (pick Python or TypeScript):

   The Render CLI runs a local task server on port 8120:

   Python:

   ```bash
   cd python/workflows
   pip install -r requirements.txt
   render workflows dev -- python main.py
   ```

   TypeScript:

   ```bash
   cd typescript/workflows
   npm ci
   render workflows dev -- npx tsx src/main.ts
   ```

   Verify tasks registered:

   ```bash
   render workflows tasks list --local
   ```

3. **Start the matching API** (pick one):

   Set `RENDER_USE_LOCAL_DEV=true` so the API triggers the local workflow server instead of Render's API:

   Python (default, runs on http://localhost:8001):

   ```bash
   cd python/api
   pip install -r requirements.txt
   RENDER_USE_LOCAL_DEV=true python main.py
   ```

   TypeScript (runs on http://localhost:8002):

   ```bash
   cd typescript/api
   npm ci
   RENDER_USE_LOCAL_DEV=true RENDER_API_KEY=local npm run dev
   ```

   If using the TypeScript API, also set `NEXT_PUBLIC_API_URL=http://localhost:8002` before starting the frontend.

4. **Start the frontend**:

   ```bash
   cd frontend
   npm install
   npm run dev
   # Runs on http://localhost:3000
   ```

5. Open http://localhost:3000 and click **Run Workflow**.

### Environment Variables

| Variable | Default | Used by |
|----------|---------|---------|
| `RENDER_API_KEY` | (required for deployed services; use `local` for local dev) | API services |
| `RENDER_USE_LOCAL_DEV` | `false` | API services (set `true` for local dev) |
| `WORKFLOW_SLUG` | `data-processor-workflows-py` / `data-processor-workflows-ts` | API services |
| `DATA_DIR` | `../../sample_data` | Workflow services |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8001` | Frontend |

## Deploy to Render

### 1. Deploy Frontend and API (Blueprint)

The Blueprint (`render.yaml`) in this fork deploys the frontend and the **TypeScript API**. The Workflow is created separately because Workflows are not yet supported by Blueprints.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

Or manually:

1. Push this repo to GitHub/GitLab
2. In Render Dashboard: **New** → **Blueprint**
3. Connect your repo and deploy

### 2. Create Workflows (Manual)

Workflows are not yet supported in Blueprints. Create them manually:

#### Python Workflow

1. In Render Dashboard: **New** → **Workflow**
2. Connect your repo
3. Settings:
   - **Name**: `data-processor-workflows-py`
   - **Root Directory**: `python/workflows`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python main.py`
4. Deploy

#### TypeScript Workflow

Create the Workflow from the repository root so the task can read
`sample_data/`. Do **not** set a Root Directory: Render excludes files outside a
configured root directory.

```bash
render workflows create \
  --name data-processor-workflows-ts \
  --repo https://github.com/sonnysangha/render-data-processor-workflow \
  --branch main \
  --runtime node \
  --region frankfurt \
  --build-command "cd typescript/workflows && npm ci && npm run build" \
  --run-command "cd typescript/workflows && npm start" \
  --env-var DATA_DIR=../../sample_data \
  --auto-deploy-trigger commit
```

### 3. Configure Environment Variables

On each API service, set:

- `RENDER_API_KEY`: Your Render API key (create at Dashboard → Account → API Keys)
- `WORKFLOW_SLUG`: `data-processor-workflows-ts`
- `DEMO_MODE`: `true` for the public demo
- `FRONTEND_ORIGIN`: the frontend's exact public `https://...onrender.com` URL

On the frontend static site, set:

- `NEXT_PUBLIC_API_URL`: the API's exact public `https://...onrender.com` URL

On the Workflow service, set:

- `DATA_DIR`: `../../sample_data`

Never expose `RENDER_API_KEY` through a `NEXT_PUBLIC_*` variable or commit it to
the repository. See [DEPLOYMENT.md](./DEPLOYMENT.md) for the exact TypeScript
deployment and verification commands.


## Project Structure

```
/
├── frontend/                    # Next.js brutalist UI
│   ├── app/
│   │   ├── page.tsx             # Main demo page
│   │   └── how-it-works/
│   │       └── page.tsx         # Workflow visualizer
│   ├── components/
│   │   ├── WorkflowTrigger.tsx  # Run button
│   │   ├── EventLog.tsx         # Terminal-style log
│   │   ├── DataPreview.tsx      # Before/after view
│   │   └── ResultsSummary.tsx   # Stats and shard timings
│   └── lib/
│       ├── api.ts               # API client
│       └── workflow-config.ts   # Visualizer config
│
├── python/
│   ├── api/                     # FastAPI service
│   │   └── main.py              # Trigger endpoints
│   └── workflows/               # Render Workflow
│       ├── main.py              # Task definitions
│       ├── sharding.py          # Hash-based routing
│       └── enrichment.py        # Score calculations
│
├── typescript/
│   ├── api/                     # Fastify service
│   │   └── src/index.ts         # Trigger endpoints
│   └── workflows/               # Render Workflow
│       └── src/
│           ├── main.ts          # Task definitions
│           ├── sharding.ts      # Hash-based routing
│           └── enrichment.ts    # Score calculations
│
├── sample_data/                 # Generated CSVs
├── scripts/
│   └── generate_data.py         # Data generator
│
├── render.yaml                  # Blueprint (frontend + APIs)
└── README.md
```

## Sample Data Schema

### Input CSVs

**crm.csv**
```csv
customer_id,email,company_name,industry,employee_count,deal_stage,deal_value,sales_owner,last_contact
```

**billing.csv**
```csv
customer_id,email,plan,mrr,payment_status,subscription_start,last_payment
```

**product.csv**
```csv
customer_id,email,signup_date,last_active,total_sessions,features_used,usage_pct,account_status
```

**support.csv**
```csv
customer_id,email,total_tickets,open_tickets,avg_resolution_hrs,last_ticket_date,nps_score,csat_score
```

### Output: Enriched Profile

All fields merged, plus calculated fields:

- `health_score`: 0-100 based on usage, payments, NPS, support tickets
- `churn_risk`: LOW / MEDIUM / HIGH
- `expansion_potential`: LOW / MEDIUM / HIGH

## Performance

With 100K rows per source (400K total records):

| Metric | Value |
|--------|-------|
| Total records | 400,000 |
| Shards | 10 |
| Parallel tasks | 10 |
| Runtime | Measure from the deployed task-run timings |
| Sequential comparison | Sum of the 10 child-task durations |
| Parallel comparison | Longest child-task duration |

Runtime varies with the selected Workflow task plan and current infrastructure.
Use the UI and Render Dashboard timings for recording-safe measurements instead
of quoting an estimate.

## Customization

### Change shard count

Edit `NUM_SHARDS` in:
- `python/workflows/sharding.py`
- `typescript/workflows/src/sharding.ts`

### Modify enrichment logic

Edit the calculation functions in:
- `python/workflows/enrichment.py`
- `typescript/workflows/src/enrichment.ts`

### Generate different data sizes

```bash
python scripts/generate_data.py --rows 10000    # 10K rows
python scripts/generate_data.py --rows 1000000  # 1M rows
```

## Troubleshooting

### Workflow not found

- Check `WORKFLOW_SLUG` matches the workflow service name in the Dashboard
- Ensure workflow deployed successfully in Dashboard

### API key errors

- Verify `RENDER_API_KEY` is set correctly
- API key needs Workflows permissions

### CSV not found

- Check `DATA_DIR` environment variable
- Ensure CSVs are accessible from workflow runtime

## Learn More

- [Render Workflows Documentation](https://render.com/docs/workflows)
- [Render Workflows SDK (Python)](https://render.com/docs/workflows-sdk-python)
- [Render Workflows SDK (TypeScript)](https://github.com/render-oss/sdk/tree/main/typescript)
