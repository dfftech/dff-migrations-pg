import { env } from "./app-util";

const MASK = "xxx-xxx-xxxx";
const DEFAULT_MASK_KEYS =
  "email,mobile,tel_code,telcode,phone,password,token,authorization,pic,secret";

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, "");
}

function maskKeySet(): Set<string> {
  const raw = env("LOG_MASK_KEYS") || DEFAULT_MASK_KEYS;
  const keys = new Set<string>();
  for (const part of raw.split(/[,|\s]+/)) {
    const n = normalizeKey(part.trim());
    if (n) keys.add(n);
  }
  return keys;
}

function keyTokens(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .split(/[-_]+/)
    .map((t) => t.toLowerCase())
    .filter(Boolean);
}

function shouldMaskKey(key: string, keys: Set<string>): boolean {
  const n = normalizeKey(key);
  if (keys.has(n)) return true;
  for (const token of keyTokens(key)) {
    if (keys.has(token)) return true;
  }
  for (const k of keys) {
    if (k && n.includes(k)) return true;
  }
  return false;
}

function walk(value: unknown, keys: Set<string>, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (seen.has(value as object)) return MASK;
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => walk(item, keys, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (shouldMaskKey(k, keys) && (v === null || typeof v !== "object")) {
      out[k] = v === null || v === undefined || v === "" ? v : MASK;
      continue;
    }
    out[k] = walk(v, keys, seen);
  }
  return out;
}

/** Clone log payload and mask values whose keys are in LOG_MASK_KEYS (env). */
export function maskLogData<T>(data: T): T {
  if (data === null || data === undefined || typeof data !== "object") return data;
  return walk(data, maskKeySet(), new WeakSet()) as T;
}
