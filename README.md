# Customer Data Merge - Render Workflows Demo

Merge customer data from multiple sources into enriched profiles using parallel Render Workflows.

## Before you start

Everything in this repo runs on [Render](https://render.com). Do these two
steps first; the rest of the README assumes you have.

1. **Create your Render account** using this link:
   **[dashboard.render.com/register](https://dashboard.render.com/register?utm_source=youtube&utm_medium=other&utm_campaign=2026_partnership_sonny)**
2. **Claim your $50 in free Render credits** (viewers of this project) here:
   **[credits-portal-mmdm.onrender.com/claim/sonny-youtube](https://credits-portal-mmdm.onrender.com/claim/sonny-youtube)**
   Sign in with the account from step 1 before claiming.

The credits cover the paid pieces of this demo (the two `basic-256mb` Postgres
databases and Workflow compute); the frontends and the API run on free plans.

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

- Node.js 20+
- [pnpm](https://pnpm.io/) 11+
- [Docker](https://www.docker.com/) (runs the local Postgres for the TypeScript API)
- [Render CLI](https://render.com/docs/cli) 2.11.0+ (`brew install render` on macOS), logged in with `render login`
- Python 3.11+ only if you use the Python workflow or API

### Local Development

Fastest path (TypeScript workflow + API + frontend, all in one terminal):

```bash
pnpm run bootstrap && pnpm run dev
```

`pnpm run dev` starts local Postgres in Docker, the Render local task server on
`:8120`, the TypeScript API on `:8002`, and the frontend on `:3000`, then
prefixes every log line with `[workflow]`, `[api]`, or `[web]`. Open
http://localhost:3000 and click **Run Workflow**. Runs go to the local task
server (`RENDER_USE_LOCAL_DEV=true`), so nothing touches your Render account.
`Ctrl-C` stops everything; `pnpm run down` removes the Postgres container.

The workflow processes however many customers are currently in `sample_data/`.
Choose any profile count with `pnpm run data --rows 10000`. The generator
writes that many rows to each of the four CSVs, so 10K profiles means 40K input
records. `pnpm run data:small` is the 1K shortcut and `pnpm run data:full`
restores 100K. These commands rewrite tracked CSVs, so do not commit the result
unless you intentionally want to change the demo dataset.

You can also drive the workflow without the API or frontend: with
`pnpm run dev:workflow` running, `render workflows tasks list --local` opens an
interactive menu to run `merge_customer_data` with input `[]`, stream its logs,
and view results.

#### Manual setup (one process per terminal)

Use this if you prefer separate terminals or want the Python implementation.

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
   pnpm install --frozen-lockfile
   render workflows dev -- pnpm exec tsx src/main.ts
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

   TypeScript (runs on http://localhost:8002; needs Postgres, e.g.
   `docker compose up -d` from the repo root):

   ```bash
   cd typescript/api
   pnpm install --frozen-lockfile
   DATABASE_URL=postgresql://customer_merge:customer_merge@localhost:5432/customer_merge \
     RENDER_USE_LOCAL_DEV=true \
     RENDER_API_KEY=local \
     pnpm run dev
   ```

   If using the TypeScript API, also set `NEXT_PUBLIC_API_URL=http://localhost:8002` before starting the frontend.

4. **Start the frontend**:

   ```bash
   cd frontend
   pnpm install --frozen-lockfile
   pnpm run dev
   # Runs on http://localhost:3000
   ```

5. Open http://localhost:3000 and click **Run Workflow**.

### Environment Variables

| Variable               | Default                                                     | Used by                                 |
| ---------------------- | ----------------------------------------------------------- | --------------------------------------- |
| `RENDER_API_KEY`       | (required for deployed services; use `local` for local dev) | API services                            |
| `RENDER_USE_LOCAL_DEV` | `false`                                                     | API services (set `true` for local dev) |
| `WORKFLOW_SLUG`        | Workflow service slug returned by `render workflows list`   | API services                            |
| `DATABASE_URL`         | Render Postgres private connection string                   | TypeScript API                          |
| `DATA_DIR`             | `../../sample_data`                                         | Workflow services                       |
| `NEXT_PUBLIC_API_URL`  | `http://localhost:8001`                                     | Frontend                                |

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
  --build-command "cd typescript/workflows && pnpm install --frozen-lockfile && pnpm run build" \
  --run-command "cd typescript/workflows && pnpm run start" \
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
  --build-command "cd typescript/workflows && pnpm install --frozen-lockfile && pnpm run build" \
  --run-command "cd typescript/workflows && pnpm run start" \
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

| Environment   | Branch        | Resources                                                                                         |
| ------------- | ------------- | ------------------------------------------------------------------------------------------------- |
| `production`  | `main`        | `customer-merge-frontend`, `customer-merge-api-typescript`, `customer-merge-postgres`             |
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

New to Render? You can have an AI coding agent (Claude Code, Cursor, Codex,
OpenCode) walk you through the whole deployment. Render publishes skills and an
MCP server for exactly this ([render.com/docs/llm-support](https://render.com/docs/llm-support)).
The agent does the terminal work and tells you, in plain language, what to
click when a step needs a human (deploying the Blueprint and typing in your API
key are the two things only you can do).

#### 1. Install the tools (one time)

You need three things: a Render account (see [Before you start](#before-you-start)
for the sign-up and free-credits links), the Render CLI, and the Render skills.

```bash
# Render CLI (macOS). Other platforms: https://render.com/docs/cli
brew install render
render login          # opens the browser; sign in and come back
```

Then the skills. Claude Code (this also installs Render's MCP server):

```bash
claude plugin marketplace add render-oss/skills
claude plugin install render@render-plugins
```

Cursor, Codex, or OpenCode:

```bash
render skills install
```

#### 2. Give the agent an API key (one time)

The agent needs a Render API key to change settings on your behalf. Create one
in the Render Dashboard: click your avatar → **Account Settings** → **API Keys**
→ **Create API Key**. Copy it, then run this in your terminal (replace the
`rnd_...` part with your key):

```bash
echo 'export RENDER_API_KEY="rnd_..."' >> ~/.zshrc
```

That puts the key where the agent's terminal can read it. You never paste the
key into the chat. Restart your coding tool once so it sees the new variable.

#### 3. Paste this prompt into your agent

```text
I'm new to Render. Please walk me through deploying this repo, step by step,
using the installed Render skills (render-workflows, render-blueprints,
render-env-vars, render-cli), the Render CLI, and the Render REST API
(https://api.render.com/v1 with the Bearer token in $RENDER_API_KEY from my
shell). Treat me as a beginner:

- Before each step, tell me in one or two plain sentences what we're about to
  do and why. Avoid jargon; if you must use a term (Blueprint, Workflow,
  environment variable), define it the first time.
- Show me every command before you run it. Stop and ask before anything that
  costs money.
- When a step needs me to click in the Render Dashboard, give me the exact
  page, button labels, and values to type, then wait for me to say "done".
- Never print, log, or commit my API key. Never put it in a NEXT_PUBLIC_*
  variable.
- After each step, confirm it worked and tell me what changed.

Here is the plan. Do it in this order.

STEP 0 - Check my setup. Confirm `render whoami` works, `$RENDER_API_KEY` is
set (check that it is non-empty; do not display it), Docker is not needed for
deployment, and this repo has a git remote on GitHub. If anything is missing,
tell me how to fix it and stop.

STEP 1 - Branch. This project deploys two copies of the app: "production"
from the `main` branch and "development" from a `development` branch. Check
whether `development` exists on origin; if not, create it from main with
`git push origin main:development`. Explain that Render reads render.yaml
from `main` only, and pushing to `development` updates the dev copy.

STEP 2 - Create the two Workflows. Explain that a Workflow is the background
service that runs the data-merge tasks, and that we create it first so we
have its ID for the next step. Use the exact TypeScript command from README
"1. Create the Workflow": run from the repo root with NO root directory,
runtime node, region frankfurt, build `cd typescript/workflows && pnpm
install --frozen-lockfile && pnpm run build`, run `cd typescript/workflows &&
pnpm run start`, env DATA_DIR=../../sample_data, auto-deploy on commit. Then
create `data-processor-workflows-ts-dev` the same way from the `development`
branch. Read both generated slugs from `render workflows list -o json` (Render
may add a suffix; the exact slug matters) and show them to me clearly labelled
"production slug" and "development slug". Wait for both to finish building
(`render workflows versions list <id>` shows "ready") before moving on.

STEP 3 - Deploy the Blueprint (my click). Explain that render.yaml is a
single file describing the frontend, the API, and the database for both
environments, and that Render creates all six from it in one go. Run
`render blueprints validate render.yaml` first and show me it says valid.
Then give me this link to open (fill in my repo's GitHub URL from
`git remote get-url origin`):
https://dashboard.render.com/blueprint/new?repo=<my repo URL>
and walk me through the page:
  - Blueprint Name: type customer-data-merge. Branch: main. Leave Blueprint
    Path empty.
  - Under "Review Blueprint configurations" I will see six things being
    created: an environment called development, two databases, two static
    sites (the frontends), and two web services (the APIs). Some have empty
    boxes next to them asking for values. This is the only time Render asks
    for these, so here is what goes in each:
      * customer-merge-api-typescript -> WORKFLOW_SLUG: the production slug
        from STEP 2. RENDER_API_KEY: my API key (I type it; you never see it).
      * customer-merge-api-typescript-dev -> WORKFLOW_SLUG: the development
        slug from STEP 2. RENDER_API_KEY: my API key again.
      * FRONTEND_ORIGIN (on both APIs) and NEXT_PUBLIC_API_URL (on both
        frontends): leave EMPTY. Explain why: these are the public web
        addresses of the frontend and API, and Render only invents those
        addresses when I click Deploy, so we fill them in during STEP 4.
  - Click "Deploy Blueprint". It takes a few minutes; wait until every
    resource shows as live/available.
Then wait for me to say "done" and confirm from your side with
`render projects list` and `render environments <projectId>` that the project
now has both `production` and `development`, and with
`render services list -o json` that four web services and two databases exist.
Show me that list with the public URLs.

STEP 4 - Connect the frontend and API in each environment. Explain that the
frontend needs to know the API's address (build-time), and the API needs to
know the frontend's address (so browsers are allowed to call it). Read the
four public https URLs from `render services list -o json`. For each
environment, using the single-key endpoint
PUT /v1/services/{serviceId}/env-vars/{KEY} (never the bulk PUT, which wipes
every other variable):
  - set FRONTEND_ORIGIN on the API to that environment's frontend URL, then
    `render deploys create <api-id> --wait`;
  - set NEXT_PUBLIC_API_URL on the frontend to that environment's API URL,
    then `render deploys create <frontend-id> --clear-cache --wait`.
Do not touch DEMO_MODE or DATABASE_URL; the Blueprint manages those.

STEP 5 - Tidy the Dashboard. Explain that the project page groups resources
by environment and that Workflows have to be added to it. Add each Workflow
to its environment with POST /v1/environments/{envId}/resources and body
{"resourceIds":["<workflow id>"]} (env IDs from `render environments
<projectId>`). Ask me to open the project page and confirm each environment
lists its Workflow; if not, tell me where to add it by hand.

STEP 6 - Prove it works. For each environment: GET <api>/health returns 200
with database "connected"; a request with header
`Origin: <that environment's frontend URL>` gets back an
Access-Control-Allow-Origin header; POST <api>/trigger (with that Origin
header) returns a runId; poll <api>/status/<runId> until completed and show
me profiles, records, and the 10 shard timings; GET <api>/runs shows the
saved run. Then tell me to open the production frontend URL and click
"Run Workflow" myself.

Finish with a short summary I can keep: the four public URLs, both Workflow
slugs, and the one-line explanation of what each environment is for. Do not
edit render.yaml, do not commit anything, and keep the API on the free plan.
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
├── render.yaml                  # Blueprint (frontend + API + Postgres, two environments)
├── docker-compose.yml           # Local Postgres for `pnpm run dev`
├── package.json                 # Root dev runner: `pnpm run bootstrap && pnpm run dev`
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

| Metric                | Value                                      |
| --------------------- | ------------------------------------------ |
| Total records         | 400,000                                    |
| Shards                | 10                                         |
| Parallel tasks        | 10                                         |
| Runtime               | Measure from the deployed task-run timings |
| Sequential comparison | Sum of the 10 child-task durations         |
| Parallel comparison   | Longest child-task duration                |

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
