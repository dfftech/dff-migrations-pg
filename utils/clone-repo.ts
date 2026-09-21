import fs from "node:fs";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import git from "isomorphic-git";
import gitHttp from "isomorphic-git/http/node";
import { env } from "./app-util";

const BRANCH = "main";
const HTTP_TIMEOUT_MS = 10 * 60 * 1000;
/** Hidden so Encore's watcher skips it (IgnoreFolder: names starting with '.'). */
export const MIGRATION_DIR = join(process.cwd(), ".migration");
const LEGACY_MIGRATION_DIR = join(process.cwd(), "migration");
const SESSION_STAMP = join(MIGRATION_DIR, ".server-session");

const http = {
  request: (req: Parameters<typeof gitHttp.request>[0]) =>
    gitHttp.request({
      ...req,
      fetchOptions: { timeout: HTTP_TIMEOUT_MS, ...req.fetchOptions },
    }),
};

function publicRepoUrl(repoUrl: string): string {
  try {
    const parsed = new URL(repoUrl);
    parsed.username = "";
    parsed.password = "";
    return parsed.toString();
  } catch {
    return repoUrl;
  }
}

function onAuth(repoUrl: string, token: string) {
  const host = new URL(repoUrl).hostname;
  if (host.includes("gitlab")) return { username: "oauth2", password: token };
  if (host.includes("bitbucket")) return { username: "x-token-auth", password: token };
  return { username: "x-access-token", password: token };
}

async function pathExists(dir: string): Promise<boolean> {
  try {
    await access(dir);
    return true;
  } catch {
    return false;
  }
}

/**
 * Stable for one `encore run` (including hot reloads).
 * Changes when you stop and start the server again.
 */
function serverSessionId(): string | undefined {
  return process.env.ENCORE_RUNTIME_CONFIG_PATH || process.env.ENCORE_APP_META_PATH;
}

let clonePromise: Promise<void> | null = null;
let pullPromise: Promise<void> | null = null;

function repoAuth() {
  const repoUrl = env("REPO_URL")?.trim();
  const token = env("REPO_TOKEN")?.trim();
  if (!repoUrl) return null;
  if (!token) throw new Error("REPO_TOKEN is not set");
  return { repoUrl, token };
}

async function overwriteFromRemote(repoUrl: string, token: string): Promise<void> {
  console.log("[migration] fetch --force", publicRepoUrl(repoUrl), `branch=${BRANCH}`);
  await git.fetch({
    fs,
    http,
    dir: MIGRATION_DIR,
    url: repoUrl,
    remote: "origin",
    ref: BRANCH,
    singleBranch: true,
    depth: 1,
    onAuth: () => onAuth(repoUrl, token),
  });

  const remoteRef = `refs/remotes/origin/${BRANCH}`;
  const oid = await git.resolveRef({ fs, dir: MIGRATION_DIR, ref: remoteRef });
  await git.writeRef({
    fs,
    dir: MIGRATION_DIR,
    ref: `refs/heads/${BRANCH}`,
    value: oid,
    force: true,
  });
  await git.checkout({
    fs,
    dir: MIGRATION_DIR,
    ref: BRANCH,
    force: true,
  });
  console.log("[migration] reset --hard origin/" + BRANCH, oid.slice(0, 8));
}

/** Fetch origin and overwrite local .migration with remote HEAD. */
export function pull_repo(): Promise<void> {
  if (pullPromise) return pullPromise;

  pullPromise = (async () => {
    await clone_repo();
    const auth = repoAuth();
    if (!auth) return;
    if (!(await pathExists(join(MIGRATION_DIR, ".git")))) {
      console.warn("[migration] skip pull: clone missing");
      return;
    }
    await overwriteFromRemote(auth.repoUrl, auth.token);
  })().finally(() => {
    pullPromise = null;
  });

  return pullPromise;
}

/** Clone REPO_URL (main) into ./.migration using REPO_TOKEN via isomorphic-git. */
export function clone_repo(): Promise<void> {
  if (clonePromise) return clonePromise;

  clonePromise = (async () => {
    const auth = repoAuth();
    if (!auth) {
      console.warn("[migration] skip clone: REPO_URL not set");
      return;
    }
    const { repoUrl, token } = auth;

    if (await pathExists(LEGACY_MIGRATION_DIR)) {
      await rm(LEGACY_MIGRATION_DIR, { recursive: true, force: true });
    }

    const sessionId = serverSessionId();
    const cloned = await pathExists(join(MIGRATION_DIR, ".git"));
    if (sessionId && cloned) {
      try {
        const prev = fs.readFileSync(SESSION_STAMP, "utf8").trim();
        if (prev === sessionId) {
          console.log("[migration] hot reload, keep existing clone");
          return;
        }
      } catch {
        // no stamp → treat as a new server start
      }
    }

    if (await pathExists(MIGRATION_DIR)) {
      console.log("[migration] server start, deleting existing clone");
      await rm(MIGRATION_DIR, { recursive: true, force: true });
    }

    console.log(
      "[migration] cloning",
      publicRepoUrl(repoUrl),
      `branch=${BRANCH}`,
      "into",
      MIGRATION_DIR
    );

    await mkdir(MIGRATION_DIR, { recursive: true });

    let lastPhase = "";
    await git.clone({
      fs,
      http,
      dir: MIGRATION_DIR,
      url: repoUrl,
      ref: BRANCH,
      singleBranch: true,
      depth: 1,
      onAuth: () => onAuth(repoUrl, token),
      onProgress: ({ phase }) => {
        if (phase === lastPhase) return;
        lastPhase = phase;
        console.log(`[migration] ${phase}`);
      },
    });

    if (sessionId) {
      await writeFile(SESSION_STAMP, sessionId, "utf8");
    }

    console.log("[migration] clone completed");
  })();

  return clonePromise;
}
