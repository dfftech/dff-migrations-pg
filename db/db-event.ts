import { Client } from "pg";
import { APP_SCHEMA, CORE_URL } from "./db-url";
import { getCorePool, syncTenantPools } from "./db-pool";

const CHANNEL = "tenant_change";
const TRIGGER_NAME = "tenants_notify_trigger";
const FUNCTION_NAME = "notify_tenant_change";

let listenClient: Client | null = null;
let started = false;

function quoteIdent(name: string): string {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/** Log-safe notify summary — never includes db URL. */
function safeNotifySummary(payload?: string): string {
  if (!payload) return "(no payload)";
  try {
    const p = JSON.parse(payload) as { op?: string; id?: string; active?: boolean };
    return JSON.stringify({ op: p.op, id: p.id, active: p.active });
  } catch {
    return "(unparsed)";
  }
}

/** True when the tenants notify trigger already exists on {APP_SCHEMA}.tenants. */
async function triggerExists(): Promise<boolean> {
  const pool = getCorePool();
  const res = await pool.query({
    text: `
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1
        AND c.relname = 'tenants'
        AND t.tgname = $2
        AND NOT t.tgisinternal
      LIMIT 1
    `,
    values: [APP_SCHEMA, TRIGGER_NAME],
  });
  return (res.rowCount ?? 0) > 0;
}

/**
 * Ensure notify function + AFTER INSERT/UPDATE/DELETE trigger on tenants.
 * Payload never includes db URL (sync reloads from table).
 */
export async function ensureTenantChangeTrigger(): Promise<void> {
  const schema = quoteIdent(APP_SCHEMA);
  const fn = `${schema}.${quoteIdent(FUNCTION_NAME)}`;
  const table = `${schema}.${quoteIdent("tenants")}`;
  const pool = getCorePool();

  // Always replace function so payload stays free of connection URLs
  await pool.query(`
    CREATE OR REPLACE FUNCTION ${fn}()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
    DECLARE
      payload text;
    BEGIN
      IF TG_OP = 'DELETE' THEN
        payload := json_build_object('op', TG_OP, 'id', OLD.id)::text;
      ELSE
        payload := json_build_object(
          'op', TG_OP,
          'id', NEW.id,
          'active', NEW.active
        )::text;
      END IF;
      PERFORM pg_notify('${CHANNEL}', payload);
      RETURN COALESCE(NEW, OLD);
    END;
    $fn$;
  `);

  if (await triggerExists()) {
    console.log(`[db-event] trigger "${TRIGGER_NAME}" already exists on ${APP_SCHEMA}.tenants`);
    return;
  }

  console.log(`[db-event] creating trigger "${TRIGGER_NAME}" on ${APP_SCHEMA}.tenants`);

  await pool.query(`
    CREATE TRIGGER ${quoteIdent(TRIGGER_NAME)}
    AFTER INSERT OR UPDATE OR DELETE ON ${table}
    FOR EACH ROW
    EXECUTE PROCEDURE ${fn}();
  `);

  console.log(`[db-event] trigger "${TRIGGER_NAME}" created`);
}

/** Dedicated LISTEN client — pool clients cannot keep LISTEN open. */
async function startTenantChangeListener(): Promise<void> {
  if (listenClient) return;
  if (!CORE_URL) {
    throw new Error("DB_URL is not set (set DATABASE_URL)");
  }

  const client = new Client({ connectionString: CORE_URL });
  await client.connect();
  await client.query(`LISTEN ${CHANNEL}`);

  client.on("notification", (msg) => {
    if (msg.channel !== CHANNEL) return;
    console.log("[db-event] tenants table changed:", safeNotifySummary(msg.payload));
    void syncTenantPools().catch((err) => {
      console.error("[db-event] syncTenantPools failed:", err);
    });
  });

  client.on("error", (err) => {
    console.error("[db-event] listen client error:", err.message);
  });

  listenClient = client;
  console.log(`[db-event] listening on channel "${CHANNEL}"`);
}

export async function stopTenantEvents(): Promise<void> {
  if (!listenClient) {
    started = false;
    return;
  }
  try {
    await listenClient.query(`UNLISTEN ${CHANNEL}`);
  } catch {
    // client may already be closed
  }
  await listenClient.end().catch(() => {});
  listenClient = null;
  started = false;
  console.log("[db-event] listener stopped");
}

/**
 * If IS_TENANT: ensure trigger exists, then LISTEN for tenant changes
 * and sync pool + map on every notify.
 */
export async function initTenantEvents(): Promise<void> {
  if (started) return;
  await ensureTenantChangeTrigger();
  await startTenantChangeListener();
  started = true;
}
