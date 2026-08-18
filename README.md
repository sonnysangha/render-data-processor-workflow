# Customer Data Merge - Render Workflows Demo

Merge customer data from multiple sources into enriched profiles using parallel Render Workflows.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://dashboard.render.com/blueprint/new?repo=https://github.com/sonnysangha/render-data-processor-workflow)

This demo showcases:

- **Parallel processing**: 10 shards processed simultaneously
- **Multi-source merge**: CRM + Billing + Product + Support → Enriched profiles
- **High throughput**: 400K input records split across 10 parallel tasks
- **Durable history**: completed run summaries persist in Render Postgres
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

The deployed TypeScript API also writes compact Workflow summaries to a
private Render Postgres database. The frontend reads those rows through the API
to show durable history; database credentials never reach the browser.

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

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://dashboard.render.com/blueprint/new?repo=https://github.com/sonnysangha/render-data-processor-workflow)

One click deploys the Blueprint to your Render workspace. See
[Deploy to Render](#deploy-to-render) for the full steps, or continue below to
run everything locally.

### Prerequisites

- Python 3.11+
- Node.js 20+
- PostgreSQL 16+ for TypeScript API local development
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
   DATABASE_URL=postgresql://localhost/customer_merge \
     RENDER_USE_LOCAL_DEV=true \
     RENDER_API_KEY=local \
     npm run dev
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
| `WORKFLOW_SLUG` | Workflow service slug returned by `render workflows list` | API services |
| `DATABASE_URL` | Render Postgres private connection string | TypeScript API |
| `DATA_DIR` | `../../sample_data` | Workflow services |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8001` | Frontend |

## Deploy to Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://dashboard.render.com/blueprint/new?repo=https://github.com/sonnysangha/render-data-processor-workflow)

Deploying is three steps: create the Workflow, deploy the Blueprint, then set
the two public URLs. Follow them below, or hand the whole thing to your coding
agent with the prompt in [Deploy with an AI agent](#deploy-with-an-ai-agent).

### 1. Create the Workflow

Start with the Workflow service that runs the merge tasks, so its slug is
ready when the Blueprint asks for `WORKFLOW_SLUG`. Create one per environment,
or let the development API share the production Workflow by pointing its
`WORKFLOW_SLUG` at the production slug.

Always create Workflows from the repository root so the tasks can read
`sample_data/`. Do **not** set a Root Directory: Render excludes files outside
a configured root directory, so `sample_data/` would be missing even with
`DATA_DIR=../../sample_data`. Put the `cd` in the build and run commands
instead.

#### TypeScript Workflow

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

#### Python Workflow

```bash
render workflows create \
  --name data-processor-workflows-py \
  --repo https://github.com/sonnysangha/render-data-processor-workflow \
  --branch main \
  --runtime python \
  --region frankfurt \
  --build-command "cd python/workflows && pip install -r requirements.txt" \
  --run-command "cd python/workflows && python main.py" \
  --env-var DATA_DIR=../../sample_data \
  --auto-deploy-trigger commit
```

Or in the Dashboard: **New** → **Workflow**, connect the repo, leave
**Root Directory** empty, and use the same build/start commands.

#### Development Workflow

For the `development` environment, create a second Workflow from the
`development` branch with a `-dev` name, for example:

```bash
render workflows create \
  --name data-processor-workflows-ts-dev \
  --repo https://github.com/sonnysangha/render-data-processor-workflow \
  --branch development \
  --runtime node \
  --region frankfurt \
  --build-command "cd typescript/workflows && npm ci && npm run build" \
  --run-command "cd typescript/workflows && npm start" \
  --env-var DATA_DIR=../../sample_data \
  --auto-deploy-trigger commit
```

Once created, note each Workflow's generated slug. Render appends a suffix
(for example `data-processor-workflows-ts-liap`), so copy the exact value:

```bash
render workflows list -o json
```

### 2. Deploy Frontend, API, and Postgres (Blueprint)

The Blueprint (`render.yaml`) deploys the frontend, the **TypeScript API**, and
a private Render Postgres database, wired together, in one step.

It defines two environments under one Render project:

| Environment | Branch | Resources |
|-------------|--------|-----------|
| `production` | `main` | `customer-merge-frontend`, `customer-merge-api-typescript`, `customer-merge-postgres` |
| `development` | `development` | `customer-merge-frontend-dev`, `customer-merge-api-typescript-dev`, `customer-merge-postgres-dev` |

Both environments have the same shape. Development turns `DEMO_MODE` off so the
trigger endpoint is not rate-limited while testing. Render reads `render.yaml`
from `main` only; pushing to `development` redeploys the dev services but does
not change the Blueprint itself.

The `development` branch must exist before Render can sync the Blueprint:

```bash
git push origin main:development
```

Each environment needs its own `sync: false` values (`RENDER_API_KEY`,
`WORKFLOW_SLUG`, `FRONTEND_ORIGIN`, `NEXT_PUBLIC_API_URL`), and its own
Workflow created from the matching branch (or point the dev API's
`WORKFLOW_SLUG` at the production Workflow to share it).

Click the **Deploy to Render** button above, or manually:

1. Push this repo to GitHub/GitLab
2. In Render Dashboard: **New** → **Blueprint**
3. Connect your repo (branch `main`) and review the plan

On the review page:

- If Render finds matching services that already exist, choose
  **Associate existing services** to adopt them. **Create all as new services**
  makes a second copy of everything (including a second Postgres).
- Paste the Workflow slug from step 1 into `WORKFLOW_SLUG`.
- Leave `FRONTEND_ORIGIN` and `NEXT_PUBLIC_API_URL` blank for now. Both are
  public `https://...onrender.com` URLs that Render generates during this
  step, so they are set afterwards in step 3.
- Enter your `RENDER_API_KEY`.

### 3. Configure Environment Variables

After the Blueprint finishes, Render has generated the public URLs for the
frontend and API. Set the remaining values in **each** environment (production
and development); `sync: false` values are never shared between environments.

On each API service (`customer-merge-api-typescript`, `customer-merge-api-typescript-dev`), set:

- `RENDER_API_KEY`: Your Render API key (create at Dashboard → Account → API Keys)
- `WORKFLOW_SLUG`: the exact Workflow Slug returned by `render workflows list -o json` (Render can append a suffix). Use that environment's Workflow, or the production slug to share it.
- `FRONTEND_ORIGIN`: that environment's frontend public `https://...onrender.com` URL

The Blueprint sets `DEMO_MODE` itself (`true` in production, `false` in
development) and injects `DATABASE_URL` from that environment's Postgres
(`customer-merge-postgres` or `customer-merge-postgres-dev`) using its private
connection string. Do not paste this value into a frontend variable.

On each frontend static site (`customer-merge-frontend`, `customer-merge-frontend-dev`), set:

- `NEXT_PUBLIC_API_URL`: that environment's API public `https://...onrender.com` URL

`NEXT_PUBLIC_API_URL` is baked in at build time. Changing it requires a
frontend rebuild (trigger a manual deploy after updating it).

On the Workflow service, set:

- `DATA_DIR`: `../../sample_data`

Never expose `RENDER_API_KEY` through a `NEXT_PUBLIC_*` variable or commit it to
the repository. See [DEPLOYMENT.md](./DEPLOYMENT.md) for the exact TypeScript
deployment and verification commands.


### Deploy with an AI agent

Render ships skills and an MCP server for AI coding tools
([render.com/docs/llm-support](https://render.com/docs/llm-support)). With
those installed, an agent can run every step above except one click: deploying
the Blueprint happens in the Render Dashboard, and you paste `RENDER_API_KEY`
there yourself. Everything else (branch, Workflow, slugs, URLs, env vars,
redeploys, verification) is CLI/MCP work the agent can do.

Install the Render plugin (Claude Code shown; the same skills work in Cursor,
Codex, and OpenCode via `render skills install`):

```bash
claude plugin marketplace add render-oss/skills
claude plugin install render@render-plugins
```

Log the Render CLI in (`render login`) and export `RENDER_API_KEY` so the MCP
server can reach your workspace. Then paste this prompt:

```text
Deploy this repo to Render using the installed Render skills (render-workflows,
render-blueprints, render-env-vars) and the Render MCP/CLI. Work in this exact
order, show me each command before running it, and stop to ask before anything
that creates a paid resource.

1. Branch. Make sure a `development` branch exists on origin; if not, run
   `git push origin main:development`. Render reads render.yaml from `main`
   and deploys the dev services from `development`.

2. Workflow first. Create the production Workflow with `render workflows
   create` using the exact TypeScript command in README "1. Create the
   Workflow": from the repo root with NO root directory, runtime node, region
   frankfurt, build `cd typescript/workflows && npm ci && npm run build`, run
   `cd typescript/workflows && npm start`, env DATA_DIR=../../sample_data,
   auto-deploy on commit. Then create data-processor-workflows-ts-dev the same
   way from the `development` branch (or tell me if you want dev to share the
   production Workflow). Read both generated slugs from
   `render workflows list -o json`; Render appends a suffix, so use the exact
   slug values.

3. Blueprint. Run `render blueprints validate render.yaml`. Then give me the
   link to deploy it (New → Blueprint, this repo, branch main). Tell me to
   choose "Associate existing services" if Render finds matching services,
   to paste the production and dev Workflow slugs into WORKFLOW_SLUG, to
   enter RENDER_API_KEY myself, and to leave FRONTEND_ORIGIN and
   NEXT_PUBLIC_API_URL blank. Wait for me to confirm it finished.

4. URLs. Read the generated public https URLs of all four web services
   (production and dev frontend + API) with `render services list -o json`
   or the Render MCP. Then, per environment:
   - set FRONTEND_ORIGIN on the API to that environment's frontend URL;
   - set NEXT_PUBLIC_API_URL on the frontend to that environment's API URL,
     then trigger a frontend redeploy (it is a build-time variable).
   DEMO_MODE and DATABASE_URL are set by the Blueprint; do not touch them.
   Never put RENDER_API_KEY in a NEXT_PUBLIC_* variable, never print it,
   never commit it.

5. Verify production, then development: GET <api>/health returns 200 with
   database "connected"; open the frontend, click Run Workflow, confirm the
   run completes with 10 process_shard child tasks; GET <api>/runs shows the
   persisted row.

Report the four public URLs and both Workflow slugs when done. Do not edit
render.yaml, do not commit anything, and keep the API on the free plan.
```

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
│   │   ├── ResultsSummary.tsx   # Stats and shard timings
│   │   └── RecentRuns.tsx       # Durable Postgres run history
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
│   ├── api/src/db.ts            # Postgres schema and run persistence
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

- Check `WORKFLOW_SLUG` matches the exact Workflow Slug, not only the service name
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
