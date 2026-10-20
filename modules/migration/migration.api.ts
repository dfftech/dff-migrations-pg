import type { ResponseType } from 'dff-util';
import { api } from 'encore.dev/api';
import { getMigrationCatalog, resyncMigrationRepo, runPromote, runRollback } from './migration.service';
import type { MigrationParams, MigrationVersionParams } from './types';

export const PromoteAll = api<MigrationVersionParams, ResponseType>(
  {
    expose: true,
    method: 'GET',
    path: '/migration/:track/:version/promote',
  },
  async ({ track, version }) => runPromote(track, version)
);

export const Promote = api<MigrationParams, ResponseType>(
  {
    expose: true,
    method: 'GET',
    path: '/migration/:track/:version/promote/:tenant',
  },
  async ({ track, version, tenant }) => runPromote(track, version, tenant)
);

export const RollbackAll = api<MigrationVersionParams, ResponseType>(
  {
    expose: true,
    method: 'GET',
    path: '/migration/:track/:version/rollback',
  },
  async ({ track, version }) => runRollback(track, version)
);

export const Rollback = api<MigrationParams, ResponseType>(
  {
    expose: true,
    method: 'GET',
    path: '/migration/:track/:version/rollback/:tenant',
  },
  async ({ track, version, tenant }) => runRollback(track, version, tenant)
);

export const Catalog = api<void, ResponseType>(
  {
    expose: true,
    method: 'GET',
    path: '/migration/catalog',
  },
  async () => getMigrationCatalog()
);

export const Resync = api<void, ResponseType>(
  {
    expose: true,
    method: 'GET',
    path: '/migration/resync',
  },
  async () => resyncMigrationRepo()
);
