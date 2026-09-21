import { env } from "../utils/app-util";

/**
 * Parse connection URL: strip options= (node-pg doesn't support it) and extract
 * search_path from options='-c search_path=SCHEMA'.
 * If options / search_path is missing, defaults to public.
 */
export function parseConnectionUrl(raw: string): {
  url: string;
  searchPath: string;
} {
  if (!raw?.trim()) return { url: raw ?? "", searchPath: "public" };

  const trimmed = raw.trim();
  let searchPath: string | undefined;

  const optionsMatch = trimmed.match(/[?&]options=([^&]*)/i);
  if (optionsMatch) {
    const opts = decodeURIComponent(optionsMatch[1].replace(/^['"]|['"]$/g, "").trim());
    const spMatch = opts.match(/search_path\s*=\s*([^\s&'"]+)/i);
    if (spMatch) searchPath = spMatch[1];
  }

  // No options → treat as search_path=public
  if (!searchPath) searchPath = "public";

  let url = trimmed
    .replace(/[?&]options=[^&]*/gi, (m) => (m.startsWith("?") ? "?" : ""))
    .replace(/\?&/, "?")
    .replace(/\?$/, "");

  // Match current pg SSL behavior and silence the sslmode warning
  url = url.replace(/\bsslmode=(require|prefer|verify-ca)\b/gi, "sslmode=verify-full");

  return { url, searchPath };
}

const DB_URL = env("DB_URL") || "";
const parsed = parseConnectionUrl(DB_URL);

/** Clean connection string from DB_URL (options stripped; search_path applied via pool). */
export const CORE_URL = parsed.url;

/**
 * App schema from DB_URL options search_path.
 * When options is absent, defaults to public.
 */
export const APP_SCHEMA = parsed.searchPath;
