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
import { merr, mlog } from "./log";

type Target = {
  pool: ReturnType<typeof get_core_db>;
  tenant: string;
  schema?: string;
};

async function ready(action: MigrationAction, version: string, target?: string): Promise<void> {
  mlog({ action, version, tenant: target }, "ready begin");
  await ensure_tenants_db_init();
  await pull_repo();
  mlog(
    { action, version, tenant: target, schema: IS_TENANT ? undefined : APP_SCHEMA },
    IS_TENANT ? "ready end mode=multi_tenant" : "ready end mode=single_db"
  );
}

async function poolForTarget(id: string, action: MigrationAction, version: string): Promise<Target> {
  const name = id.trim();
  if (!name) throw new Error(IS_TENANT ? "tenant is required" : "schema is required");
  if (!IS_TENANT) {
    mlog({ action, version, schema: name }, "target single_db");
    return { pool: get_core_db(), tenant: name, schema: name };
  }
  mlog({ action, version, tenant: name }, "target tenant");
  return { pool: await get_tenant_db(name), tenant: name };
}

async function allTargets(action: MigrationAction, version: string): Promise<Target[]> {
  if (!IS_TENANT) {
    mlog({ action, version, schema: APP_SCHEMA }, "all targets single_db");
    return [{ pool: get_core_db(), tenant: APP_SCHEMA, schema: APP_SCHEMA }];
  }
  const ids = tentant_ids();
  if (ids.length === 0) {
    throw new Error("[migration] no tenants to run against");
  }
  mlog({ action, version }, `all targets tenants=${ids.join(",")}`);
  const out: Target[] = [];
  for (const id of ids) {
    out.push(await poolForTarget(id, action, version));
  }
  return out;
}

function versionsFor(
  action: MigrationAction,
  version: string,
  tenant?: string,
  schema?: string
): string[] {
  const folder = version.trim();
  if (!folder) throw new Error("version is required");
  if (!isZOrderRef(folder)) return [assertSingleVersion(folder)];
  const versions = loadTopVersionOrder(action, { tenant, schema });
  const ordered = action === "rollback" ? [...versions].reverse() : versions;
  mlog({ action, tenant, schema }, `z-order ${ordered.join(" → ")}`);
  return ordered;
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
  const folder = version.trim();
  await ready(action, folder, tenant);
  mlog(
    { action, version: folder, tenant },
    tenant ? "start" : "start target=all"
  );

  if (isZOrderRef(folder) && !tenant?.trim()) {
    throw new Error(
      IS_TENANT
        ? `tenant is required for z-order (GET /migration/${action}/z-order/:tenant)`
        : `schema is required for z-order (GET /migration/${action}/z-order/:schema)`
    );
  }

  const targets = tenant?.trim()
    ? [await poolForTarget(tenant, action, folder)]
    : await allTargets(action, folder);
  const versions = versionsFor(
    action,
    folder,
    targets[0]?.tenant,
    targets[0]?.schema
  );

  const results = [];
  try {
    for (const t of targets) {
      mlog(
        { action, version: folder, tenant: t.tenant, schema: t.schema },
        `run begin versions=${versions.join(",")}`
      );
      const ran = await runVersionsOnPool(
        t.pool,
        versions,
        action,
        t.tenant,
        t.schema
      );
      mlog(
        { action, version: folder, tenant: t.tenant, schema: t.schema },
        "run end"
      );
      results.push({ tenant: t.tenant, schema: t.schema, versions: ran });
    }
  } catch (err) {
    merr({ action, version: folder, tenant }, "failed", err);
    throw err;
  }

  mlog(
    { action, version: folder, tenant },
    `completed targets=${results.map((r) => r.schema || r.tenant).join(",")}`
  );

  return {
    action,
    version: folder,
    versions,
    tenants: results.map((r) => r.tenant),
    results,
  };
}

export async function promote(version: string, tenant?: string) {
  mlog({ action: "promote", version, tenant }, "promote begin");
  const result = await run("promote", version, tenant);
  mlog({ action: "promote", version, tenant }, "promote end");
  return result;
}

export async function rollback(version: string, tenant?: string) {
  mlog({ action: "rollback", version, tenant }, "rollback begin");
  const result = await run("rollback", version, tenant);
  mlog({ action: "rollback", version, tenant }, "rollback end");
  return result;
}

/** New tenant: run every version in top .migration/z-order.yaml (promote). */
export async function promoteZOrder(tenant: string) {
  mlog({ action: "promote", version: Z_ORDER, tenant }, "new tenant z-order begin");
  const result = await promote(Z_ORDER, tenant);
  mlog({ action: "promote", version: Z_ORDER, tenant }, "new tenant z-order end");
  return result;
}

export { runMigrationOnPool } from "./runner";
export {
  listVersions,
  loadSqlOrder,
  loadTopVersionOrder,
  isZOrderRef,
  Z_ORDER,
} from "./order";
