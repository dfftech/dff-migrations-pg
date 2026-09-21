import { Pool } from "pg";
import { APP_SCHEMA, CORE_URL, parseConnectionUrl } from "./db-url";

const DEFAULT_POOL_SIZE = 10;
const DEFAULT_IDLE_TIMEOUT_MS = 20_000;
const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;

/** Primary / registry pool (from DB_URL). */
let corePool: Pool | null = null;

/** Per-tenant pool cache: tenantId → Pool. */
export const tenantPools: Map<string, Pool> = new Map();

/** Cached tenantId → raw DB URL (used to detect URL changes). */
export const tenantUrlMap: Map<string, string> = new Map();

export function createPool(
  connectionString: string,
  label: string,
  setSearchPath?: string
): Pool {
  const pool = new Pool({
    connectionString,
    max: DEFAULT_POOL_SIZE,
    idleTimeoutMillis: DEFAULT_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: DEFAULT_CONNECT_TIMEOUT_MS,
    allowExitOnIdle: true,
  });

  pool.on("error", (err) => console.error(`[db pool ${label}]`, err.message));

  if (setSearchPath) {
    const quoted = `"${String(setSearchPath).replace(/"/g, '""')}"`;
    const connect = pool.connect.bind(pool);
    type ConnectCb = (
      err: Error | undefined,
      client: import("pg").PoolClient | undefined,
      done: () => void
    ) => void;

    const connectWithSearchPath = function (
      this: Pool,
      cb?: ConnectCb
    ): Promise<import("pg").PoolClient> | void {
      const run = async (): Promise<import("pg").PoolClient> => {
        console.log(`[db] ${label} pool acquiring connection`);
        const client = await (connect as () => Promise<import("pg").PoolClient>)();
        await client.query({ text: `SET search_path = ${quoted}`, values: [] });
        return client;
      };

      if (typeof cb === "function") {
        run()
          .then((client) => cb(undefined, client, () => client.release()))
          .catch((err) => cb(err as Error, undefined, () => {}));
        return;
      }
      return run();
    };

    (pool as Pool).connect = connectWithSearchPath as Pool["connect"];
  }

  return pool;
}

function requireCoreUrl(): string {
  if (!CORE_URL) {
    throw new Error("DB_URL is not set (set DATABASE_URL)");
  }
  return CORE_URL;
}

export function getCorePool(): Pool {
  requireCoreUrl();
  if (!corePool) {
    corePool = createPool(CORE_URL, "core", APP_SCHEMA);
    console.log("[db] core pool created, schema:", APP_SCHEMA);
  }
  return corePool;
}

/** Load active tenantId → db URL from the tenants registry table. */
export async function loadTenantMap(): Promise<Record<string, string>> {
  console.log(`[db] querying ${APP_SCHEMA}.tenants...`);

  // Raw SQL — works for public (no pgSchema) and any other search_path
  const res = await getCorePool().query<{ id: string; db: string }>({
    text: `SELECT id, db FROM tenants WHERE active = true`,
    values: [],
  });

  console.log(`[db] ${APP_SCHEMA}.tenants rows:`, res.rowCount ?? 0);

  const map: Record<string, string> = {};
  for (const row of res.rows) {
    map[row.id] = row.db;
  }
  return map;
}

async function createAndCacheTenantPool(
  tenantId: string,
  rawConnectionUrl: string
): Promise<Pool> {
  const { url: connectionUrl, searchPath: tenantSearchPath } =
    parseConnectionUrl(rawConnectionUrl);
  const pool = createPool(connectionUrl, `tenant:${tenantId}`, tenantSearchPath);
  tenantPools.set(tenantId, pool);
  tenantUrlMap.set(tenantId, rawConnectionUrl);
  console.log(
    "[db] tenant pool created, tenant:",
    tenantId,
    "schema:",
    tenantSearchPath ?? "(none)"
  );
  return pool;
}

async function removeTenantPool(tenantId: string): Promise<void> {
  const pool = tenantPools.get(tenantId);
  if (!pool) {
    tenantUrlMap.delete(tenantId);
    return;
  }
  await pool.end();
  tenantPools.delete(tenantId);
  tenantUrlMap.delete(tenantId);
  console.log("[db] tenant pool removed, tenant:", tenantId);
}

/** Return cached tenant pool, or create and cache one from the registry. */
export async function getOrCreateTenantPool(tenantId: string): Promise<Pool> {
  const cached = tenantPools.get(tenantId);
  if (cached) return cached;

  requireCoreUrl();

  const tenantMap = await loadTenantMap();
  const rawConnectionUrl = tenantMap[tenantId];
  if (!rawConnectionUrl) {
    throw new Error(`No PostgreSQL URL found for tenant: ${tenantId}`);
  }

  return createAndCacheTenantPool(tenantId, rawConnectionUrl);
}

/**
 * Reload tenants table and sync pool + URL map:
 * - add new active tenants
 * - recreate pool when db URL changed
 * - remove pools for inactive / deleted tenants
 */
export async function syncTenantPools(): Promise<void> {
  console.log("[db] syncing tenant pools from registry...");

  let nextMap: Record<string, string>;
  try {
    nextMap = await loadTenantMap();
  } catch (err) {
    console.error("[db] loadTenantMap failed:", err);
    throw err;
  }

  const nextIds = new Set(Object.keys(nextMap));

  for (const tenantId of Array.from(tenantPools.keys())) {
    if (!nextIds.has(tenantId)) {
      await removeTenantPool(tenantId);
    }
  }

  for (const [tenantId, rawConnectionUrl] of Object.entries(nextMap)) {
    const prevUrl = tenantUrlMap.get(tenantId);
    if (prevUrl === rawConnectionUrl && tenantPools.has(tenantId)) continue;

    if (tenantPools.has(tenantId)) {
      await removeTenantPool(tenantId);
    }
    await createAndCacheTenantPool(tenantId, rawConnectionUrl);
  }

  console.log(
    "[db] tenant sync done, count:",
    tenantPools.size,
    "ids:",
    tenantPools.size ? Array.from(tenantPools.keys()).join(", ") : "(none)"
  );
}

/** Warm all tenant pools from the registry (same as sync). */
export async function refreshTenantPools(): Promise<void> {
  await syncTenantPools();
}

export async function closeAllPools(): Promise<void> {
  const all = [corePool, ...tenantPools.values()].filter(Boolean) as Pool[];
  await Promise.all(all.map((p) => p.end()));
  corePool = null;
  tenantPools.clear();
  tenantUrlMap.clear();
}

export function tenantIds(): string[] {
  return Array.from(tenantPools.keys());
}
