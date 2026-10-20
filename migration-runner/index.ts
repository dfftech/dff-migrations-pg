import {
  APP_SCHEMA,
  CORE_TENANT_ID,
  IS_TENANT,
  ensure_tenants_db_init,
  get_core_db,
  get_tenant_db,
  is_core_tenant,
  tentant_ids,
} from '../db/db-connection';
import { pull_repo } from '../utils/clone-repo';
import { merr, mlog } from './log';
import {
  ADMIN_TRACK,
  TENANTS_TRACK,
  Z_ORDER,
  isZOrderRef,
  loadTopVersionOrder,
  type MigrationAction,
  type MigrationTrack,
} from './order';
import { runVersionsOnPool } from './runner';

type Target = {
  pool: ReturnType<typeof get_core_db>;
  tenant: string;
  schema?: string;
};

async function ready(action: MigrationAction, version: string, target?: string): Promise<void> {
  mlog({ action, version, tenant: target }, 'ready begin');
  await ensure_tenants_db_init();
  await pull_repo();
  mlog(
    { action, version, tenant: target, schema: IS_TENANT ? undefined : APP_SCHEMA },
    IS_TENANT ? 'ready end mode=multi_tenant' : 'ready end mode=single_db'
  );
}

function adminTarget(tenant?: string): Target {
  const name = tenant?.trim() || CORE_TENANT_ID;
  return { pool: get_core_db(), tenant: name };
}

async function poolForTarget(id: string, action: MigrationAction, version: string): Promise<Target> {
  const name = id.trim();
  if (!name) throw new Error('tenant is required');
  if (is_core_tenant(name)) {
    throw new Error('use /migration/core/... for the core database');
  }
  mlog({ action, version, tenant: name, track: TENANTS_TRACK }, 'target tenant');
  return { pool: await get_tenant_db(name), tenant: name };
}

async function allTenantTargets(action: MigrationAction, version: string): Promise<Target[]> {
  if (!IS_TENANT) {
    throw new Error('tenant migrations require a tenants table');
  }
  const ids = tentant_ids();
  if (ids.length === 0) {
    throw new Error('[migration] no tenants to run against');
  }
  mlog({ action, version, track: TENANTS_TRACK }, `all targets tenants=${ids.join(',')}`);
  const out: Target[] = [];
  for (const id of ids) {
    out.push(await poolForTarget(id, action, version));
  }
  return out;
}

function versionsFor(
  action: MigrationAction,
  version: string,
  track: MigrationTrack,
  tenant?: string,
  schema?: string
): string[] {
  const folder = version.trim();
  if (!folder) throw new Error('version is required');
  if (!isZOrderRef(folder)) return [assertSingleVersion(folder)];
  const versions = loadTopVersionOrder(track, action, { tenant, schema, track });
  const ordered = action === 'rollback' ? [...versions].reverse() : versions;
  mlog({ action, tenant, schema, track }, `z-order ${ordered.join(' → ')}`);
  return ordered;
}

function assertSingleVersion(folder: string): string {
  if (isZOrderRef(folder)) {
    throw new Error('z-order is not a version folder');
  }
  return folder;
}

async function targetsFor(
  action: MigrationAction,
  version: string,
  track: MigrationTrack,
  tenant?: string
): Promise<Target[]> {
  if (track === ADMIN_TRACK) {
    mlog({ action, version, tenant, track }, 'target admin core db');
    return [adminTarget(tenant)];
  }
  return tenant?.trim() ? [await poolForTarget(tenant, action, version)] : await allTenantTargets(action, version);
}

async function run(action: MigrationAction, version: string, tenant: string | undefined, track: MigrationTrack) {
  const folder = version.trim();
  await ready(action, folder, tenant);
  mlog({ action, version: folder, tenant, track }, tenant ? 'start' : 'start target=all');

  if (track === ADMIN_TRACK && isZOrderRef(folder) && tenant?.trim() && !is_core_tenant(tenant)) {
    throw new Error(`core z-order only targets core (GET /migration/core/z-order/${action})`);
  }

  const targets = await targetsFor(action, folder, track, tenant);
  const versions = versionsFor(action, folder, track, targets[0]?.tenant, targets[0]?.schema);

  const results = [];
  try {
    for (const t of targets) {
      mlog(
        { action, version: folder, tenant: t.tenant, schema: t.schema, track },
        `run begin versions=${versions.join(',')}`
      );
      const ran = await runVersionsOnPool(t.pool, versions, action, t.tenant, t.schema, track);
      mlog({ action, version: folder, tenant: t.tenant, schema: t.schema, track }, 'run end');
      results.push({ tenant: t.tenant, schema: t.schema, versions: ran });
    }
  } catch (err) {
    merr({ action, version: folder, tenant, track }, 'failed', err);
    throw err;
  }

  mlog(
    { action, version: folder, tenant, track },
    `completed targets=${results.map((r) => r.schema || r.tenant).join(',')}`
  );

  return {
    action,
    version: folder,
    track,
    versions,
    tenants: results.map((r) => r.tenant),
    results,
  };
}

export async function promote(version: string, tenant: string | undefined, track: MigrationTrack) {
  mlog({ action: 'promote', version, tenant, track }, 'promote begin');
  const result = await run('promote', version, tenant, track);
  mlog({ action: 'promote', version, tenant, track }, 'promote end');
  return result;
}

export async function rollback(version: string, tenant: string | undefined, track: MigrationTrack) {
  mlog({ action: 'rollback', version, tenant, track }, 'rollback begin');
  const result = await run('rollback', version, tenant, track);
  mlog({ action: 'rollback', version, tenant, track }, 'rollback end');
  return result;
}

/** New tenant: run every version in .migration/tenants z-order (promote). */
export async function promoteZOrder(tenant: string) {
  mlog({ action: 'promote', version: Z_ORDER, tenant, track: TENANTS_TRACK }, 'new tenant z-order begin');
  const result = await promote(Z_ORDER, tenant, TENANTS_TRACK);
  mlog({ action: 'promote', version: Z_ORDER, tenant, track: TENANTS_TRACK }, 'new tenant z-order end');
  return result;
}

export {
  ADMIN_TRACK,
  TENANTS_TRACK,
  Z_ORDER,
  catalogForFolder,
  catalogForTrack,
  isZOrderRef,
  listExtraFolders,
  listVersions,
  loadSqlOrder,
  loadTopVersionOrder,
  parseTrack,
  trackForTarget,
} from './order';
export type { MigrationTrack } from './order';
export { runMigrationOnPool } from './runner';
