import pg from "pg";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (error) => {
  console.error("Unexpected idle database client error", error.message);
});

export interface StoredRunStatus {
  runId: string;
  status: string;
  startedAt: Date;
  completedAt: Date;
  elapsedMs?: number;
  profilesGenerated?: number;
  recordsProcessed?: number;
  shardsProcessed?: number;
  sampleProfile?: Record<string, unknown>;
  shardTimings?: unknown[];
  totalSequentialMs?: number;
  maxParallelMs?: number;
  error?: string;
}

export interface RecentRun {
  runId: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  elapsedMs?: number;
  profilesGenerated?: number;
  recordsProcessed?: number;
  shardsProcessed?: number;
  error?: string;
}

interface RecentRunRow {
  run_id: string;
  status: string;
  started_at: Date;
  completed_at: Date | null;
  elapsed_ms: string | null;
  profiles_generated: number | null;
  records_processed: number | null;
  shards_processed: number | null;
  error: string | null;
}

export async function initializeDatabase(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workflow_runs (
      run_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ,
      elapsed_ms BIGINT,
      profiles_generated INTEGER,
      records_processed INTEGER,
      shards_processed INTEGER,
      sample_profile JSONB,
      shard_timings JSONB,
      total_sequential_ms BIGINT,
      max_parallel_ms BIGINT,
      error TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS workflow_runs_started_at_idx
    ON workflow_runs (started_at DESC)
  `);
}

export async function checkDatabaseConnection(): Promise<void> {
  await pool.query("SELECT 1");
}

export async function insertPendingRun(
  runId: string,
  startedAt: Date
): Promise<void> {
  await pool.query(
    `
      INSERT INTO workflow_runs (run_id, status, started_at)
      VALUES ($1, $2, $3)
      ON CONFLICT (run_id) DO NOTHING
    `,
    [runId, "pending", startedAt]
  );
}

export async function getRunStartedAt(
  runId: string
): Promise<Date | undefined> {
  const result = await pool.query<{ started_at: Date }>(
    "SELECT started_at FROM workflow_runs WHERE run_id = $1",
    [runId]
  );

  return result.rows[0]?.started_at;
}

export async function persistTerminalRun(
  run: StoredRunStatus
): Promise<void> {
  await pool.query(
    `
      INSERT INTO workflow_runs (
        run_id,
        status,
        started_at,
        completed_at,
        elapsed_ms,
        profiles_generated,
        records_processed,
        shards_processed,
        sample_profile,
        shard_timings,
        total_sequential_ms,
        max_parallel_ms,
        error,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW()
      )
      ON CONFLICT (run_id) DO UPDATE SET
        status = EXCLUDED.status,
        completed_at = COALESCE(workflow_runs.completed_at, EXCLUDED.completed_at),
        elapsed_ms = EXCLUDED.elapsed_ms,
        profiles_generated = COALESCE(EXCLUDED.profiles_generated, workflow_runs.profiles_generated),
        records_processed = COALESCE(EXCLUDED.records_processed, workflow_runs.records_processed),
        shards_processed = COALESCE(EXCLUDED.shards_processed, workflow_runs.shards_processed),
        sample_profile = COALESCE(EXCLUDED.sample_profile, workflow_runs.sample_profile),
        shard_timings = COALESCE(EXCLUDED.shard_timings, workflow_runs.shard_timings),
        total_sequential_ms = COALESCE(EXCLUDED.total_sequential_ms, workflow_runs.total_sequential_ms),
        max_parallel_ms = COALESCE(EXCLUDED.max_parallel_ms, workflow_runs.max_parallel_ms),
        error = EXCLUDED.error,
        updated_at = NOW()
    `,
    [
      run.runId,
      run.status,
      run.startedAt,
      run.completedAt,
      run.elapsedMs ?? null,
      run.profilesGenerated ?? null,
      run.recordsProcessed ?? null,
      run.shardsProcessed ?? null,
      run.sampleProfile ? JSON.stringify(run.sampleProfile) : null,
      run.shardTimings ? JSON.stringify(run.shardTimings) : null,
      run.totalSequentialMs ?? null,
      run.maxParallelMs ?? null,
      run.error ?? null,
    ]
  );
}

export async function listRecentRuns(limit: number): Promise<RecentRun[]> {
  const result = await pool.query<RecentRunRow>(
    `
      SELECT
        run_id,
        status,
        started_at,
        completed_at,
        elapsed_ms,
        profiles_generated,
        records_processed,
        shards_processed,
        error
      FROM workflow_runs
      ORDER BY started_at DESC
      LIMIT $1
    `,
    [limit]
  );

  return result.rows.map((row) => ({
    runId: row.run_id,
    status: row.status,
    startedAt: row.started_at.toISOString(),
    ...(row.completed_at
      ? { completedAt: row.completed_at.toISOString() }
      : {}),
    ...(row.elapsed_ms !== null ? { elapsedMs: Number(row.elapsed_ms) } : {}),
    ...(row.profiles_generated !== null
      ? { profilesGenerated: row.profiles_generated }
      : {}),
    ...(row.records_processed !== null
      ? { recordsProcessed: row.records_processed }
      : {}),
    ...(row.shards_processed !== null
      ? { shardsProcessed: row.shards_processed }
      : {}),
    ...(row.error !== null ? { error: row.error } : {}),
  }));
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
