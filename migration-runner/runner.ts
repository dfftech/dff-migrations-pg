import type { Pool } from "pg";
import {
  type MigrationAction,
  loadSqlOrder,
  readSqlFile,
  versionActionDir,
} from "./order";
import { merr, mlog } from "./log";

function quoteIdent(name: string): string {
  return `"${String(name).replace(/"/g, '""')}"`;
}

export type RunCtx = {
  action: MigrationAction;
  version?: string;
  tenant?: string;
  schema?: string;
};

async function ensureSearchPathSchema(
  pool: Pool,
  ctx: RunCtx,
  schemaName?: string
): Promise<string> {
  const client = await pool.connect();
  try {
    let schema = schemaName?.trim();
    if (!schema) {
      const res = await client.query<{ search_path: string }>("SHOW search_path");
      const raw = String(res.rows[0]?.search_path ?? "public");
      schema = raw.split(",")[0]?.trim().replace(/^"|"$/g, "") || "public";
    }
    if (schema === "$user") schema = "public";

    const quoted = quoteIdent(schema);
    mlog({ ...ctx, schema }, "ensure schema begin");
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoted}`);
    await client.query(`SET search_path TO ${quoted}`);
    mlog({ ...ctx, schema }, "ensure schema end");
    return schema;
  } finally {
    client.release();
  }
}

export async function runMigrationOnPool(
  pool: Pool,
  version: string,
  action: MigrationAction,
  tenant?: string,
  schema?: string
): Promise<{ version: string; action: MigrationAction; files: string[] }> {
  const ctx: RunCtx = { action, version, tenant, schema };
  const order = loadSqlOrder(version, action, ctx);
  const dir = versionActionDir(version, action);
  mlog(ctx, `version begin files=${order.length} dir=${dir}`);

  const resolved = await ensureSearchPathSchema(pool, ctx, schema);
  ctx.schema = resolved;

  const client = await pool.connect();
  let currentFile = "";
  try {
    await client.query("BEGIN");
    await client.query(`SET search_path TO ${quoteIdent(resolved)}`);
    for (const name of order) {
      currentFile = `${name}.sql`;
      const sql = readSqlFile(version, action, name);
      if (!sql.trim()) {
        mlog({ ...ctx, file: currentFile, phase: "skip" }, "empty");
        continue;
      }
      mlog({ ...ctx, file: currentFile, phase: "begin" });
      await client.query(sql);
      mlog({ ...ctx, file: currentFile, phase: "end" });
    }
    await client.query("COMMIT");
    mlog(ctx, "version committed");
  } catch (err) {
    merr(
      { ...ctx, file: currentFile || undefined, phase: "fail" },
      "version failed",
      err
    );
    try {
      await client.query("ROLLBACK");
      mlog(ctx, "version rolled back");
    } catch (rbErr) {
      merr(ctx, "rollback failed", rbErr);
    }
    throw err;
  } finally {
    client.release();
  }

  mlog(ctx, "version end");
  return { version, action, files: order };
}

export async function runVersionsOnPool(
  pool: Pool,
  versions: string[],
  action: MigrationAction,
  tenant?: string,
  schema?: string
) {
  const ctx: RunCtx = { action, tenant, schema };
  mlog(ctx, `versions begin ${versions.join(" → ")}`);
  const results = [];
  for (const version of versions) {
    results.push(
      await runMigrationOnPool(pool, version, action, tenant, schema)
    );
  }
  mlog(ctx, "versions end");
  return results;
}
