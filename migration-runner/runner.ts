import type { Pool } from "pg";
import {
  type MigrationAction,
  loadSqlOrder,
  readSqlFile,
  versionActionDir,
} from "./order";

function quoteIdent(name: string): string {
  return `"${String(name).replace(/"/g, '""')}"`;
}

async function ensureSearchPathSchema(
  pool: Pool,
  label: string,
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
    console.log(`[migration] ${label}: ensure schema ${schema}`);
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoted}`);
    await client.query(`SET search_path TO ${quoted}`);
    return schema;
  } finally {
    client.release();
  }
}

export async function runMigrationOnPool(
  pool: Pool,
  version: string,
  action: MigrationAction,
  label: string,
  schema?: string
): Promise<{ version: string; action: MigrationAction; files: string[] }> {
  const order = loadSqlOrder(version, action);
  const dir = versionActionDir(version, action);
  console.log(
    `[migration] ${label}: ${action} ${version} (${order.length} files) from ${dir}`
  );

  const resolved = await ensureSearchPathSchema(pool, label, schema);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET search_path TO ${quoteIdent(resolved)}`);
    for (const name of order) {
      const sql = readSqlFile(version, action, name);
      if (!sql.trim()) {
        console.log(`[migration] ${label}: skip empty ${name}.sql`);
        continue;
      }
      console.log(`[migration] ${label}: ${action} ${name}.sql`);
      await client.query(sql);
    }
    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    throw err;
  } finally {
    client.release();
  }

  console.log(`[migration] ${label}: ${action} ${version} completed`);
  return { version, action, files: order };
}

export async function runVersionsOnPool(
  pool: Pool,
  versions: string[],
  action: MigrationAction,
  label: string,
  schema?: string
) {
  const results = [];
  for (const version of versions) {
    results.push(await runMigrationOnPool(pool, version, action, label, schema));
  }
  return results;
}
