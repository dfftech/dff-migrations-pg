import { api } from "encore.dev/api";
import type { ResponseType } from "dff-util";
import { session_meta } from "../../utils/app-util";
import {
  isZOrderRef,
  parseTrack,
  promote,
  rollback,
  type MigrationTrack,
} from "../../migration-runner";
import { merr, mlog } from "../../migration-runner/log";
import type {
  MigrationParams,
  MigrationTenantParams,
  MigrationVersionParams,
} from "./types";

function trackOf(raw: string): MigrationTrack {
  return parseTrack(raw);
}

function rejectZOrderAsVersion(
  track: string,
  version: string,
  action: "promote" | "rollback"
) {
  if (!isZOrderRef(version)) return;
  throw new Error(
    `z-order requires a target (GET /migration/${track}/${action}/z-order/:tenant)`
  );
}

function line(
  action: "promote" | "rollback",
  version: string,
  tenant: string | undefined,
  track: string,
  phase: "begin" | "end" | "fail"
) {
  mlog({ action, version, tenant, schema: tenant, track, phase });
}

function fail(err: unknown, requestId: string): ResponseType {
  return {
    status: 500,
    error: { message: err instanceof Error ? err.message : String(err) },
    meta: { requestId, timestamp: new Date().toISOString() },
  };
}

export const PromoteZOrder = api<MigrationTenantParams, ResponseType>(
  {
    expose: true,
    method: "GET",
    path: "/migration/:track/promote/z-order/:tenant",
  },
  async ({ track, tenant }) => {
    const t = trackOf(track);
    line("promote", "z-order", tenant, t, "begin");
    const { logger, request_id } = session_meta();
    await logger.info("Processing migration promote z-order", { track: t, tenant });
    try {
      const result = await promote("z-order", tenant, t);
      line("promote", "z-order", tenant, t, "end");
      return {
        status: 200,
        data: { message: "Promote z-order completed", ...result },
        meta: { requestId: request_id, timestamp: new Date().toISOString() },
      };
    } catch (err) {
      merr({ action: "promote", version: "z-order", tenant, track: t, phase: "fail" }, "", err);
      return fail(err, request_id);
    }
  }
);

export const RollbackZOrder = api<MigrationTenantParams, ResponseType>(
  {
    expose: true,
    method: "GET",
    path: "/migration/:track/rollback/z-order/:tenant",
  },
  async ({ track, tenant }) => {
    const t = trackOf(track);
    line("rollback", "z-order", tenant, t, "begin");
    const { logger, request_id } = session_meta();
    await logger.info("Processing migration rollback z-order", { track: t, tenant });
    try {
      const result = await rollback("z-order", tenant, t);
      line("rollback", "z-order", tenant, t, "end");
      return {
        status: 200,
        data: { message: "Rollback z-order completed", ...result },
        meta: { requestId: request_id, timestamp: new Date().toISOString() },
      };
    } catch (err) {
      merr({ action: "rollback", version: "z-order", tenant, track: t, phase: "fail" }, "", err);
      return fail(err, request_id);
    }
  }
);

export const PromoteAll = api<MigrationVersionParams, ResponseType>(
  {
    expose: true,
    method: "GET",
    path: "/migration/:track/promote/:version",
  },
  async ({ track, version }) => {
    const t = trackOf(track);
    line("promote", version, undefined, t, "begin");
    rejectZOrderAsVersion(t, version, "promote");
    const { logger, request_id } = session_meta();
    await logger.info("Processing migration promote (all)", { track: t, version });
    try {
      const result = await promote(version, undefined, t);
      line("promote", version, undefined, t, "end");
      return {
        status: 200,
        data: { message: "Promote completed", ...result },
        meta: { requestId: request_id, timestamp: new Date().toISOString() },
      };
    } catch (err) {
      merr({ action: "promote", version, track: t, phase: "fail" }, "", err);
      return fail(err, request_id);
    }
  }
);

export const Promote = api<MigrationParams, ResponseType>(
  {
    expose: true,
    method: "GET",
    path: "/migration/:track/promote/:version/:tenant",
  },
  async ({ track, version, tenant }) => {
    const t = trackOf(track);
    line("promote", version, tenant, t, "begin");
    const { logger, request_id } = session_meta();
    await logger.info("Processing migration promote", { track: t, version, tenant });
    try {
      const result = await promote(version, tenant, t);
      line("promote", version, tenant, t, "end");
      return {
        status: 200,
        data: { message: "Promote completed", ...result },
        meta: { requestId: request_id, timestamp: new Date().toISOString() },
      };
    } catch (err) {
      merr({ action: "promote", version, tenant, track: t, phase: "fail" }, "", err);
      return fail(err, request_id);
    }
  }
);

export const RollbackAll = api<MigrationVersionParams, ResponseType>(
  {
    expose: true,
    method: "GET",
    path: "/migration/:track/rollback/:version",
  },
  async ({ track, version }) => {
    const t = trackOf(track);
    line("rollback", version, undefined, t, "begin");
    rejectZOrderAsVersion(t, version, "rollback");
    const { logger, request_id } = session_meta();
    await logger.info("Processing migration rollback (all)", { track: t, version });
    try {
      const result = await rollback(version, undefined, t);
      line("rollback", version, undefined, t, "end");
      return {
        status: 200,
        data: { message: "Rollback completed", ...result },
        meta: { requestId: request_id, timestamp: new Date().toISOString() },
      };
    } catch (err) {
      merr({ action: "rollback", version, track: t, phase: "fail" }, "", err);
      return fail(err, request_id);
    }
  }
);

export const Rollback = api<MigrationParams, ResponseType>(
  {
    expose: true,
    method: "GET",
    path: "/migration/:track/rollback/:version/:tenant",
  },
  async ({ track, version, tenant }) => {
    const t = trackOf(track);
    line("rollback", version, tenant, t, "begin");
    const { logger, request_id } = session_meta();
    await logger.info("Processing migration rollback", { track: t, version, tenant });
    try {
      const result = await rollback(version, tenant, t);
      line("rollback", version, tenant, t, "end");
      return {
        status: 200,
        data: { message: "Rollback completed", ...result },
        meta: { requestId: request_id, timestamp: new Date().toISOString() },
      };
    } catch (err) {
      merr({ action: "rollback", version, tenant, track: t, phase: "fail" }, "", err);
      return fail(err, request_id);
    }
  }
);
