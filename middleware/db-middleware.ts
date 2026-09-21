import { middleware } from "encore.dev/api";
import {
  IS_TENANT,
  get_core_db,
  get_tenant_db,
} from "../db/db-connection";

/** Health uses path /health/:id where :id is the tenant. */
function tenantFromHealthPath(pathAndQuery?: string): string | undefined {
  if (!pathAndQuery) return undefined;
  const path = pathAndQuery.split("?")[0] ?? "";
  const match = path.match(/^\/health\/([^/]+)$/);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

/**
 * Attaches pg Pools as session_db (and core_db when multi-tenant).
 * IS_TENANT is set once at load time in encore.service via init_tenants_db().
 * Tenant source: x-tenant-id header, or /health/:id path param for health only.
 */
export const TenantMiddleware = middleware(async (req, next) => {
  if (IS_TENANT) {
    const callMeta = req.requestMeta as {
      headers?: Record<string, string>;
      pathAndQuery?: string;
    };
    const tenant =
      callMeta?.headers?.["x-tenant-id"] ||
      tenantFromHealthPath(callMeta?.pathAndQuery);

    if (!tenant) throw new Error("Missing tenant header (x-tenant-id)");

    req.data.tenant_id = tenant;
    req.data.core_db = get_core_db();
    req.data.session_db = await get_tenant_db(tenant);
    req.data.get_db = async (key: string) => get_tenant_db(key);
  } else {
    req.data.core_db = get_core_db();
    req.data.session_db = get_core_db();
    req.data.get_db = async (_key: string) => get_core_db();
  }

  return next(req);
});
