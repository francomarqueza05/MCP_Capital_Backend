// One small database interface over two engines: real Postgres when DATABASE_URL is set
// (Neon, Supabase, any host), and PGlite, an embedded Postgres, otherwise. Same SQL, same
// migrations, so what runs locally and in tests is what runs deployed.
import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import { config } from "../config";
import { MIGRATIONS } from "./migrations";

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
  readonly kind: "postgres" | "pglite";
}

function fromPostgres(url: string): Db {
  const sql = postgres(url, { max: 5, idle_timeout: 20, onnotice: () => {} });
  return {
    kind: "postgres",
    query: async <T,>(q: string, params: unknown[] = []) => (await sql.unsafe(q, params as never[])) as unknown as T[],
    close: () => sql.end(),
  };
}

function fromPglite(dir: string): Db {
  if (dir !== "memory") mkdirSync(dir, { recursive: true });
  const db = new PGlite(dir === "memory" ? undefined : dir);
  return {
    kind: "pglite",
    query: async <T,>(q: string, params: unknown[] = []) => (await db.query<T>(q, params)).rows,
    close: () => db.close(),
  };
}

async function migrate(db: Db) {
  await db.query(`create table if not exists schema_migrations (version int primary key, applied_at timestamptz not null default now())`);
  const done = new Set((await db.query<{ version: number }>(`select version from schema_migrations`)).map((r) => r.version));
  for (const [i, sql] of MIGRATIONS.entries()) {
    const version = i + 1;
    if (done.has(version)) continue;
    for (const statement of sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await db.query(statement);
    await db.query(`insert into schema_migrations (version) values ($1)`, [version]);
  }
}

export async function openDb(opts: { url?: string | null; dir?: string } = {}): Promise<Db> {
  const url = opts.url === undefined ? config.databaseUrl : opts.url;
  const db = url ? fromPostgres(url) : fromPglite(opts.dir ?? config.pgliteDir);
  await migrate(db);
  return db;
}
