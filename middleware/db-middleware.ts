import { middleware } from "encore.dev/api";
import { get_core_db, get_tenant_db } from "../db/db-connection";

function tenantFromPath(pathAndQuery?: string): string | undefined {
  if (!pathAndQuery) return undefined;
  const path = pathAndQuery.split("?")[0] ?? "";

  const health = path.match(/^\/health\/([^/]+)$/);
  if (health?.[1]) return decodeURIComponent(health[1]);

  const zOrder = path.match(/^\/migration\/(?:promote|rollback)\/z-order\/([^/]+)$/);
  if (zOrder?.[1]) return decodeURIComponent(zOrder[1]);

  const versionTenant = path.match(
    /^\/migration\/(?:promote|rollback)\/[^/]+\/([^/]+)$/
  );
  if (versionTenant?.[1]) return decodeURIComponent(versionTenant[1]);

  return undefined;
}

async function dbFor(tenant?: string) {
  if (!tenant) return get_core_db();
  try {
    return await get_tenant_db(tenant);
  } catch {
    return get_core_db();
  }
}

/**
 * Attaches pg Pools. Does not require x-tenant-id or IS_TENANT.
 * Tenant is taken from the URL when present (/health/:id or /migration/.../:tenant).
 */
export const TenantMiddleware = middleware(async (req, next) => {
  const callMeta = req.requestMeta as { pathAndQuery?: string };
  const tenant = tenantFromPath(callMeta?.pathAndQuery);

  req.data.core_db = get_core_db();
  req.data.get_db = async (key: string) => dbFor(key);
  if (tenant) req.data.tenant_id = tenant;
  req.data.session_db = await dbFor(tenant);

  return next(req);
});
