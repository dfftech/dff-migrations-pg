import type { ResponseType } from 'dff-util';
import { tentant_ids } from '../../db/db-connection';
import {
  ADMIN_TRACK,
  TENANTS_TRACK,
  catalogForFolder,
  catalogForTrack,
  listExtraFolders,
  promote,
  rollback,
  type MigrationTrack
} from '../../migration-runner';
import { merr, mlog } from '../../migration-runner/log';
import { session_meta } from '../../utils/app-util';
import { pull_repo, reclone_repo } from '../../utils/clone-repo';

const ALL_TENANTS = 'all';
const CORE_ALIAS = 'core';

type MigrationAction = 'promote' | 'rollback';

/**
 * Resolves the raw `:track` path segment into an actual track + tenant.
 *  - "core"    → admin track (core DB only). e.g. /migration/core/0000/promote
 *  - "tenants" → tenants track. Tenant is required — no implicit "all":
 *      - tenant="all" → every tenant
 *        e.g. /migration/tenants/0000/promote/all
 *      - tenant="local"/"abcd"/... → that single tenant
 *        e.g. /migration/tenants/0000/promote/local
 *  - anything else → tenants track, the segment itself is the tenant id
 *    (e.g. GET /migration/local/0000/promote targets only tenant "local").
 */
export function resolveTrack(
  rawTrack: string,
  tenant: string | undefined
): { track: MigrationTrack; tenant: string | undefined } {
  const normalized = String(rawTrack ?? '')
    .trim()
    .toLowerCase();
  if (normalized === CORE_ALIAS || normalized === ADMIN_TRACK) {
    return { track: ADMIN_TRACK, tenant };
  }
  if (normalized === TENANTS_TRACK) {
    const trimmedTenant = tenant?.trim();
    if (!trimmedTenant) {
      throw new Error(
        'tenant is required for the tenants track: pass "all" for every tenant (e.g. /migration/tenants/:version/:action/all) or a specific tenant id'
      );
    }
    const resolvedTenant = trimmedTenant.toLowerCase() === ALL_TENANTS ? undefined : trimmedTenant;
    return { track: TENANTS_TRACK, tenant: resolvedTenant };
  }

  const shortcutTenant = String(rawTrack ?? '').trim();
  if (!shortcutTenant) {
    throw new Error('track/tenant is required');
  }
  if (tenant?.trim() && tenant.trim().toLowerCase() !== shortcutTenant.toLowerCase()) {
    throw new Error(
      `conflicting tenant: path "${shortcutTenant}" already identifies a tenant (got tenant="${tenant}")`
    );
  }
  return { track: TENANTS_TRACK, tenant: shortcutTenant };
}

function line(
  action: MigrationAction,
  version: string,
  tenant: string | undefined,
  track: string,
  phase: 'begin' | 'end' | 'fail'
) {
  mlog({ action, version, tenant, schema: tenant, track, phase });
}

function fail(err: unknown, requestId: string): ResponseType {
  return {
    status: 500,
    error: { message: err instanceof Error ? err.message : String(err) },
    meta: { requestId, timestamp: new Date().toISOString() },
  };
}

async function run(
  action: MigrationAction,
  rawTrack: string,
  version: string,
  tenant: string | undefined
): Promise<ResponseType> {
  const { track: t, tenant: resolvedTenant } = resolveTrack(rawTrack, tenant);
  const label = action === 'promote' ? 'Promote' : 'Rollback';
  const run = action === 'promote' ? promote : rollback;

  line(action, version, resolvedTenant, t, 'begin');
  const { logger, request_id } = session_meta();
  await logger.info(`Processing migration ${action}`, { track: t, version, tenant: resolvedTenant });
  try {
    const result = await run(version, resolvedTenant, t);
    line(action, version, resolvedTenant, t, 'end');
    return {
      status: 200,
      data: { message: `${label} completed`, ...result },
      meta: { requestId: request_id, timestamp: new Date().toISOString() },
    };
  } catch (err) {
    merr({ action, version, tenant: resolvedTenant, track: t, phase: 'fail' }, '', err);
    return fail(err, request_id);
  }
}

export function runPromote(track: string, version: string, tenant?: string): Promise<ResponseType> {
  return run('promote', track, version, tenant);
}

export function runRollback(track: string, version: string, tenant?: string): Promise<ResponseType> {
  return run('rollback', track, version, tenant);
}

/**
 * Folder-driven catalog of everything the migration repo currently supports:
 * pulls the repo fresh, then reports {track, versions, actions} for "tenants"
 * (shared folder, used for every tenant — includes the known tenant id list),
 * "core", and one entry per per-tenant override folder found on disk (e.g.
 * "local", "botnbolt", "dtf" — folders that aren't "core"/"tenants").
 */
export async function getMigrationCatalog(): Promise<ResponseType> {
  const { request_id } = session_meta();
  try {
    await pull_repo();

    const tenantIds = tentant_ids();
    const extraFolders = listExtraFolders();

    const data = [
      { track: 'tenants', ...catalogForTrack(TENANTS_TRACK), list: ['all', ...tenantIds] },
      { track: 'core', ...catalogForTrack(ADMIN_TRACK) },
      ...extraFolders.map((folder) => ({ track: folder, ...catalogForFolder(folder) })),
    ];

    return {
      status: 200,
      data,
      meta: { requestId: request_id, timestamp: new Date().toISOString() },
    };
  } catch (err) {
    merr({ phase: 'fail' }, '', err);
    return fail(err, request_id);
  }
}

/** Deletes the local .migration clone entirely and clones REPO_URL fresh. */
export async function resyncMigrationRepo(): Promise<ResponseType> {
  const { request_id } = session_meta();
  try {
    await reclone_repo();
    return {
      status: 200,
      data: { message: 'Migration repo re-cloned' },
      meta: { requestId: request_id, timestamp: new Date().toISOString() },
    };
  } catch (err) {
    merr({ phase: 'fail' }, '', err);
    return fail(err, request_id);
  }
}
