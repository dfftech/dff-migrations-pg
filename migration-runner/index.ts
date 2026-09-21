import {
  IS_TENANT,
  APP_SCHEMA,
  ensure_tenants_db_init,
  get_core_db,
  get_tenant_db,
  tentant_ids,
} from "../db/db-connection";
import { pull_repo } from "../utils/clone-repo";
import { Z_ORDER, isZOrderRef, type MigrationAction, loadTopVersionOrder } from "./order";
import { runVersionsOnPool } from "./runner";

type Target = {
  pool: ReturnType<typeof get_core_db>;
  label: string;
  tenant: string;
  schema?: string;
};

async function ready(): Promise<void> {
  await ensure_tenants_db_init();
  await pull_repo();
}

async function poolForTarget(id: string): Promise<Target> {
  const name = id.trim();
  if (!name) throw new Error(IS_TENANT ? "tenant is required" : "schema is required");
  if (!IS_TENANT) {
    return {
      pool: get_core_db(),
      label: `schema:${name}`,
      tenant: name,
      schema: name,
    };
  }
  return { pool: await get_tenant_db(name), label: `tenant:${name}`, tenant: name };
}

async function allTargets(): Promise<Target[]> {
  if (!IS_TENANT) {
    return [
      {
        pool: get_core_db(),
        label: `schema:${APP_SCHEMA}`,
        tenant: APP_SCHEMA,
        schema: APP_SCHEMA,
      },
    ];
  }
  const ids = tentant_ids();
  if (ids.length === 0) {
    throw new Error("[migration] no tenants to run against");
  }
  const out: Target[] = [];
  for (const id of ids) {
    out.push(await poolForTarget(id));
  }
  return out;
}

function versionsFor(action: MigrationAction, version: string): string[] {
  const folder = version.trim();
  if (!folder) throw new Error("version is required");
  if (!isZOrderRef(folder)) return [assertSingleVersion(folder)];
  const versions = loadTopVersionOrder(action);
  return action === "rollback" ? [...versions].reverse() : versions;
}

function assertSingleVersion(folder: string): string {
  if (isZOrderRef(folder)) {
    throw new Error("z-order is not a version folder");
  }
  return folder;
}

async function run(
  action: MigrationAction,
  version: string,
  tenant?: string
) {
  await ready();
  const folder = version.trim();
  if (isZOrderRef(folder) && !tenant?.trim()) {
    throw new Error(
      IS_TENANT
        ? `tenant is required for z-order (GET /migration/${action}/z-order/:tenant)`
        : `schema is required for z-order (GET /migration/${action}/z-order/:schema)`
    );
  }

  const versions = versionsFor(action, folder);
  const targets = tenant?.trim()
    ? [await poolForTarget(tenant)]
    : await allTargets();

  const results = [];
  for (const t of targets) {
    const ran = await runVersionsOnPool(
      t.pool,
      versions,
      action,
      t.label,
      t.schema
    );
    results.push({ tenant: t.tenant, schema: t.schema, versions: ran });
  }

  return {
    action,
    version: folder,
    versions,
    tenants: results.map((r) => r.tenant),
    results,
  };
}

export async function promote(version: string, tenant?: string) {
  return run("promote", version, tenant);
}

export async function rollback(version: string, tenant?: string) {
  return run("rollback", version, tenant);
}

/** New tenant: run every version in top .migration/z-order.yaml (promote). */
export async function promoteZOrder(tenant: string) {
  return promote(Z_ORDER, tenant);
}

export { runMigrationOnPool } from "./runner";
export {
  listVersions,
  loadSqlOrder,
  loadTopVersionOrder,
  isZOrderRef,
  Z_ORDER,
} from "./order";
