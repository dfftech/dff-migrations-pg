import type { RequestByIdType, ResponseType } from 'dff-util';
import { api } from 'encore.dev/api';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { session_meta } from '../../utils/app-util';

function appVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

const version = appVersion();

export const HealthCheck = api<RequestByIdType, ResponseType>(
  {
    expose: true,
    method: 'GET',
    path: '/health/:id',
  },
  async (params: RequestByIdType) => {
    const { logger, request_id } = session_meta();
    try {
      const tenant = String(params.id);
      await logger.info('Processing health request', {
        tenant,
        version,
      });
      return {
        status: 200,
        data: {
          message: 'Health Check Pass',
          tenant,
          version,
        },
        meta: { requestId: request_id, timestamp: new Date().toISOString() },
      };
    } catch (err) {
      return {
        status: 500,
        error: { message: err instanceof Error ? err.message : String(err) },
        meta: { requestId: request_id, timestamp: new Date().toISOString() },
      };
    }
  }
);
