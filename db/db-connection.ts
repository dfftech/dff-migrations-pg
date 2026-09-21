import { APP_SCHEMA, CORE_URL } from "./db-url";
import { initTenantEvents, stopTenantEvents } from "./db-event";
import { setMigrationLogKind } from "../migration-runner/log";
import {
  closeAllPools,
  getCorePool,
  getOrCreateTenantPool,
  refreshTenantPools,
  tenantIds,
} from "./db-pool";

/**
 * Set once during init_tenants_db().
 * true  → {APP_SCHEMA}.tenants exists (multi-tenant)
 * false → no tenants table (single-tenant)
 */
export let IS_TENANT = false;

/** pg Pool for the primary DB (registry / single-tenant DB). */
export function get_core_db() {
  return getCorePool();
}

/** pg Pool for a tenant (multi-tenant only). */
export async function get_tenant_db(tenantId: string) {
  return getOrCreateTenantPool(tenantId);
}

/** Raw pg Pool for a tenant (multi-tenant only). */
export async function get_tenant_pool(tenantId: string) {
  return getOrCreateTenantPool(tenantId);
}

export async function refresh_tenant_pools() {
  if (!IS_TENANT) {
    console.log("[db] single-tenant: skip tenant pool refresh");
    return;
  }
  await refreshTenantPools();
}

async function detectMultiTenant(): Promise<boolean> {
  const pool = getCorePool();
  const res = await pool.query({
    text: `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = 'tenants'
      LIMIT 1
    `,
    values: [APP_SCHEMA],
  });

  const multi = (res.rowCount ?? 0) > 0;
  console.log(
    `[db] architecture: ${multi ? "multi_tenant" : "single_tenant"} ` +
      `(schema="${APP_SCHEMA}", tenants table ${multi ? "found" : "not found"})`
  );
  return multi;
}

async function pingCoreDb(): Promise<void> {
  console.log("[db] pinging core DB...");
  const pool = getCorePool();
  const start = Date.now();
  const res = await pool.query({ text: "SELECT 1 AS ok", values: [] });
  const ms = Date.now() - start;
  const ok = res.rows?.[0]?.ok === 1;
  console.log("[db] core DB ping:", ok ? "ok" : "unexpected", "in", ms, "ms");
  if (!ok) throw new Error("core DB ping failed: expected row with ok=1");
}

let initPromise: Promise<void> | null = null;

/**
 * Connect, set IS_TENANT once, warm tenant pools when multi-tenant,
 * and start tenants-table change listener (trigger + LISTEN).
 */
export function init_tenants_db(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (!CORE_URL) {
      console.warn("DB init skip: DB_URL not set (set DATABASE_URL)");
      return;
    }

    try {
      console.log("[db] init_tenants_db running, schema:", APP_SCHEMA);
      getCorePool();
      await pingCoreDb();

      IS_TENANT = await detectMultiTenant();
      setMigrationLogKind(IS_TENANT ? "tenant" : "schema");

      if (IS_TENANT) {
        await refreshTenantPools();
        await initTenantEvents();
      }

      console.log("[db] init_tenants_db completed (IS_TENANT=", IS_TENANT, ")");
      console.log(":---------DB initialization completed---------:");
    } catch (err) {
      console.error(":---------DB initialization failed---------:", err);
      throw err;
    }
  })();

  return initPromise;
}

export function ensure_tenants_db_init(): Promise<void> {
  return init_tenants_db();
}

export async function close_db_pools() {
  await stopTenantEvents();
  await closeAllPools();
  IS_TENANT = false;
}

export function tentant_ids(): string[] {
  return tenantIds();
}

export { getCorePool } from "./db-pool";
export { APP_SCHEMA } from "./db-url";
