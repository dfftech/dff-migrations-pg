import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { IS_TENANT, is_core_tenant } from "../db/db-connection";
import { MIGRATION_DIR } from "../utils/clone-repo";
import { mlog, type MigrationLog } from "./log";

export type MigrationAction = "promote" | "rollback";
export const Z_ORDER = "z-order";

/** Repo layout: .migration/admin/{version} and .migration/tenants/{version}. */
export type MigrationTrack = "admin" | "tenants";
export const ADMIN_TRACK: MigrationTrack = "admin";
export const TENANTS_TRACK: MigrationTrack = "tenants";

/**
 * admin → core / single-db (DB_URL).
 * tenant → every other tenant id (registry pools).
 */
export function trackForTarget(tenant?: string): MigrationTrack {
  if (!IS_TENANT) return ADMIN_TRACK;
  if (tenant?.trim() && is_core_tenant(tenant)) return ADMIN_TRACK;
  return TENANTS_TRACK;
}

export function parseTrack(raw: string): MigrationTrack {
  const t = String(raw ?? "").trim().toLowerCase();
  if (t === ADMIN_TRACK || t === TENANTS_TRACK) return t;
  throw new Error(`Invalid migration track "${raw}" (use admin or tenants)`);
}

/** True when the path/version refers to top-level z-order.yaml, not a version folder. */
export function isZOrderRef(version: string): boolean {
  return version.trim().toLowerCase().replace(/_/g, "-") === Z_ORDER;
}

function parseYamlNameList(raw: string, path: string): string[] {
  const names: string[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^-\s+(.+)$/);
    if (match) names.push(match[1].trim());
  }
  if (names.length === 0) {
    throw new Error(`[migration] ${path} has no entries`);
  }
  return names;
}

function readYamlList(path: string): string[] {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(`[migration] missing ${path}`);
  }
  return parseYamlNameList(raw, path);
}

function assertVersion(version: string): string {
  const name = version.trim();
  if (!/^[0-9A-Za-z._-]+$/.test(name)) {
    throw new Error(`Invalid migration version: ${version}`);
  }
  return name;
}

function trackDir(track: MigrationTrack): string {
  return join(MIGRATION_DIR, track);
}

function hasActionDir(dir: string, action?: MigrationAction): boolean {
  try {
    const kids = readdirSync(dir);
    if (action) return kids.includes(action);
    return kids.includes("promote") || kids.includes("rollback");
  } catch {
    return false;
  }
}

export function listVersions(track: MigrationTrack): string[] {
  try {
    return readdirSync(trackDir(track), { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .filter((d) => hasActionDir(join(trackDir(track), d.name)))
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

function versionHasAction(
  track: MigrationTrack,
  version: string,
  action: MigrationAction
): boolean {
  return existsSync(join(trackDir(track), version, action, "z-order.yaml"));
}

/** Track (or root) z-order.yaml — version folder order for that track. */
export function loadTopVersionOrder(
  track: MigrationTrack,
  action: MigrationAction,
  ctx?: MigrationLog
): string[] {
  const trackPath = join(trackDir(track), "z-order.yaml");
  const rootPath = join(MIGRATION_DIR, "z-order.yaml");

  let versions: string[] | undefined;
  let source = "";

  if (existsSync(trackPath)) {
    versions = readYamlList(trackPath).map(assertVersion);
    source = trackPath;
  } else if (existsSync(rootPath)) {
    const listed = readYamlList(rootPath).map(assertVersion);
    const inTrack = listed.filter((v) => versionHasAction(track, v, action));
    if (inTrack.length) {
      versions = inTrack;
      source = rootPath;
    }
  }

  if (!versions) {
    versions = listVersions(track).filter((v) => versionHasAction(track, v, action));
    source = `${trackDir(track)} (scan)`;
  }

  if (versions.length === 0) {
    throw new Error(`[migration] no ${action} versions under ${trackDir(track)}`);
  }

  mlog({ action, ...ctx, track }, `top z-order.yaml ${source} ${versions.join(" → ")}`);
  const missing = versions.filter((v) => !versionHasAction(track, v, action));
  if (missing.length) {
    throw new Error(
      `[migration] ${action} z-order lists versions with no ${track}/{version}/${action}/z-order.yaml: ${missing.join(", ")}`
    );
  }
  return versions;
}

export function versionActionDir(
  track: MigrationTrack,
  version: string,
  action: MigrationAction
): string {
  return join(trackDir(track), assertVersion(version), action);
}

/** Per-version .migration/{track}/{version}/{action}/z-order.yaml — SQL file order. */
export function loadSqlOrder(
  track: MigrationTrack,
  version: string,
  action: MigrationAction,
  ctx?: MigrationLog
): string[] {
  const dir = versionActionDir(track, version, action);
  const orderPath = join(dir, "z-order.yaml");
  try {
    const names = readYamlList(orderPath);
    mlog(
      { ...ctx, action, version, track },
      `file order ${names.join(" → ")}`
    );
    return names;
  } catch {
    const available = listVersions(track);
    throw new Error(
      `[migration] ${action} track=${track} version=${version} missing ${orderPath}` +
        (available.length ? ` (versions: ${available.join(", ")})` : "")
    );
  }
}

export function readSqlFile(
  track: MigrationTrack,
  version: string,
  action: MigrationAction,
  name: string
): string {
  const path = join(versionActionDir(track, version, action), `${name}.sql`);
  try {
    return readFileSync(path, "utf8");
  } catch {
    throw new Error(`[migration] missing file: ${path}`);
  }
}
