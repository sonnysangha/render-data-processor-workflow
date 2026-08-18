# TypeScript deployment runbook

This is the exact Render setup for the official Customer Data Merge demo.

The Blueprint (`render.yaml`) defines one Render project,
`customer-data-merge`, with two environments:

| Environment   | Branch        | Frontend                      | API                                 | Postgres                      |
| ------------- | ------------- | ----------------------------- | ----------------------------------- | ----------------------------- |
| `production`  | `main`        | `customer-merge-frontend`     | `customer-merge-api-typescript`     | `customer-merge-postgres`     |
| `development` | `development` | `customer-merge-frontend-dev` | `customer-merge-api-typescript-dev` | `customer-merge-postgres-dev` |

Render reads `render.yaml` from `main` only. Pushing to `development`
redeploys the dev services but does not change the Blueprint. The
`development` branch must exist before Render can sync the Blueprint:

```bash
git push origin main:development
```

Each environment also gets a Workflow service, created with
`render workflows create` after the Blueprint. Production deploys four
resources:

1. `data-processor-workflows-ts` — Render Workflow
2. `customer-merge-api-typescript` — Fastify web service
3. `customer-merge-frontend` — Next.js static site
4. `customer-merge-postgres` — private Render Postgres run history

Development mirrors this with `-dev` names, `DEMO_MODE=false`, and either its
own `data-processor-workflows-ts-dev` Workflow (created from the `development`
branch) or the production `WORKFLOW_SLUG` if you want to share one Workflow.
The steps below show production; repeat them with the `-dev` names for
development.

## 1. Validate locally

```bash
cd typescript/workflows
pnpm install --frozen-lockfile
pnpm run build

cd ../../typescript/api
pnpm install --frozen-lockfile
pnpm run build
pnpm audit

cd ../../frontend
pnpm install --frozen-lockfile
pnpm run check
pnpm run build

cd ..
render blueprints validate render.yaml
```

## 2. Create the Workflow

Run this from any directory. Intentionally omit `--root-directory` so
`sample_data/` is included in the deployed repository:

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

The only Workflow environment variable is set in **Workflow → Environment**:

```dotenv
DATA_DIR=../../sample_data
```

## 3. Deploy Postgres, the API, and the frontend

In Render, create a Blueprint from this repository's `render.yaml`. Both
environments are created from the same Blueprint. If Render finds matching
services that already exist, choose **Associate existing services** rather
than creating duplicates. Render prompts for the variables marked
`sync: false`; each environment has its own set. `RENDER_API_KEY` and
`WORKFLOW_SLUG` (from step 2) can be entered at the prompt. `FRONTEND_ORIGIN`
and `NEXT_PUBLIC_API_URL` are the public `https://...onrender.com` URLs Render
generates during this step, so leave them blank and set them once the services
exist:

**API service → Environment**

```dotenv
RENDER_API_KEY=<server-side Render API key>
WORKFLOW_SLUG=<generated Workflow Slug from render workflows list>
FRONTEND_ORIGIN=<frontend public https://...onrender.com URL>
```

Render can append a suffix to the Workflow Slug even when the service name is
`data-processor-workflows-ts`. Copy the exact `slug` value returned by:

```bash
render workflows list -o json
```

The Blueprint sets these non-secret API values itself (`DEMO_MODE=false` and
`customer-merge-postgres-dev` in development):

```dotenv
DEMO_MODE=true
DATABASE_URL=<private connection string from customer-merge-postgres>
```

`DATABASE_URL` is injected with `fromDatabase`; never copy it into the
frontend. The database uses the paid `basic-256mb` type with 1 GB of storage in
Frankfurt. The API remains on the Free web-service plan. Its empty
`ipAllowList` disables public database connections.

**Static site → Environment**

```dotenv
NEXT_PUBLIC_API_URL=<API public https://...onrender.com URL>
```

`NEXT_PUBLIC_API_URL` is a browser-visible build variable, so changing it
requires rebuilding the static site. `RENDER_API_KEY` is server-only and must
never be added to the frontend.

## 4. Verify production

```bash
render workflows list
render workflows versions list <workflow-id>
render pg list -o json

curl --fail --silent --show-error \
  https://<api-host>.onrender.com/health

render workflows start \
  <generated-workflow-slug>/merge_customer_data \
  --input='[]'

curl --fail --silent --show-error \
  https://<frontend-host>.onrender.com
```

Then trigger one run from the frontend and confirm:

- the root task completes;
- exactly 10 `process_shard` child tasks complete;
- `profiles_generated` is `100000`;
- `records_processed` is `400000`;
- the API returns one timing row per child task;
- `/runs` returns the completed run after a page refresh;
- the row exists in Postgres:

  ```bash
  render psql customer-merge-postgres \
    --command "SELECT run_id, status, profiles_generated, records_processed FROM workflow_runs ORDER BY started_at DESC LIMIT 5;" \
    --output text
  ```
