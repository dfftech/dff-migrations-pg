import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MIGRATION_DIR } from "../utils/clone-repo";

export type MigrationAction = "promote" | "rollback";
export const Z_ORDER = "z-order";

/** True when the path/version refers to top-level .migration/z-order.yaml, not a version folder. */
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

export function listVersions(): string[] {
  try {
    return readdirSync(MIGRATION_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .filter((d) => {
        try {
          const kids = readdirSync(join(MIGRATION_DIR, d.name));
          return kids.includes("promote") || kids.includes("rollback");
        } catch {
          return false;
        }
      })
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

/** Top-level .migration/z-order.yaml — version folder order. */
export function loadTopVersionOrder(action: MigrationAction): string[] {
  const path = join(MIGRATION_DIR, "z-order.yaml");
  if (!existsSync(path)) {
    throw new Error(`[migration] missing top-level ${path}`);
  }

  const versions = readYamlList(path).map(assertVersion);
  const missing = versions.filter(
    (v) => !existsSync(join(MIGRATION_DIR, v, action, "z-order.yaml"))
  );
  if (missing.length) {
    throw new Error(
      `[migration] top z-order.yaml lists versions with no ${action}/z-order.yaml: ${missing.join(", ")}`
    );
  }
  return versions;
}

export function versionActionDir(version: string, action: MigrationAction): string {
  return join(MIGRATION_DIR, assertVersion(version), action);
}

/** Per-version .migration/{version}/{action}/z-order.yaml — SQL file order. */
export function loadSqlOrder(version: string, action: MigrationAction): string[] {
  const dir = versionActionDir(version, action);
  const orderPath = join(dir, "z-order.yaml");
  try {
    return readYamlList(orderPath);
  } catch {
    const available = listVersions();
    throw new Error(
      `[migration] missing ${orderPath}` +
        (available.length ? ` (versions: ${available.join(", ")})` : "")
    );
  }
}

export function readSqlFile(
  version: string,
  action: MigrationAction,
  name: string
): string {
  const path = join(versionActionDir(version, action), `${name}.sql`);
  try {
    return readFileSync(path, "utf8");
  } catch {
    throw new Error(`[migration] missing file: ${path}`);
  }
}
