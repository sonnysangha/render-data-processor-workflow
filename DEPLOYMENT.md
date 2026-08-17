# TypeScript deployment runbook

This is the exact Render setup for the official Customer Data Merge demo. It
deploys three resources and no database:

1. `data-processor-workflows-ts` — Render Workflow
2. `customer-merge-api-typescript` — Fastify web service
3. `customer-merge-frontend` — Next.js static site

## 1. Validate locally

```bash
cd typescript/workflows
npm ci
npm run build

cd ../../typescript/api
npm ci
npm run build
npm audit

cd ../../frontend
npm ci
npm run check
npm run build

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
  --build-command "cd typescript/workflows && npm ci && npm run build" \
  --run-command "cd typescript/workflows && npm start" \
  --env-var DATA_DIR=../../sample_data \
  --auto-deploy-trigger commit
```

The only Workflow environment variable is set in **Workflow → Environment**:

```dotenv
DATA_DIR=../../sample_data
```

## 3. Deploy the API and frontend

In Render, create a Blueprint from this repository's `render.yaml`. Enter the
following values when Render prompts for variables marked `sync: false`:

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

The Blueprint sets these non-secret API values itself:

```dotenv
DEMO_MODE=true
```

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
render workflows versions list data-processor-workflows-ts

curl --fail --silent --show-error \
  https://<api-host>.onrender.com/health

render workflows start \
  data-processor-workflows-ts/merge_customer_data \
  --input='[]'

curl --fail --silent --show-error \
  https://<frontend-host>.onrender.com
```

Then trigger one run from the frontend and confirm:

- the root task completes;
- exactly 10 `process_shard` child tasks complete;
- `profiles_generated` is `100000`;
- `records_processed` is `400000`;
- the API returns one timing row per child task.
