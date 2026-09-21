import { api } from "encore.dev/api";
import { ResponseType } from "../../utils/app-types";
import { session_meta } from "../../utils/app-util";
import { isZOrderRef, promote, rollback } from "../../migration-runner";
import { merr, mlog } from "../../migration-runner/log";

export type MigrationVersionParams = {
  version: string;
};

export type MigrationParams = {
  version: string;
  tenant: string;
};

export type MigrationTenantParams = {
  tenant: string;
};

function rejectZOrderAsVersion(version: string, action: "promote" | "rollback") {
  if (!isZOrderRef(version)) return;
  throw new Error(
    `z-order requires a target (GET /migration/${action}/z-order/:tenant or /:schema)`
  );
}

function line(
  action: "promote" | "rollback",
  version: string,
  tenant: string | undefined,
  phase: "begin" | "end" | "fail"
) {
  mlog({ action, version, tenant, schema: tenant, phase });
}

export const PromoteZOrder = api<MigrationTenantParams, ResponseType>(
  {
    expose: true,
    method: "GET",
    path: "/migration/promote/z-order/:tenant",
  },
  async ({ tenant }) => {
    line("promote", "z-order", tenant, "begin");
    const { logger } = session_meta();
    await logger.info("Processing migration promote z-order", { tenant });
    try {
      const result = await promote("z-order", tenant);
      line("promote", "z-order", tenant, "end");
      return {
        status: 200,
        data: { message: "Promote z-order completed", ...result },
      };
    } catch (err) {
      merr({ action: "promote", version: "z-order", tenant, schema: tenant, phase: "fail" }, "", err);
      throw err;
    }
  }
);

export const RollbackZOrder = api<MigrationTenantParams, ResponseType>(
  {
    expose: true,
    method: "GET",
    path: "/migration/rollback/z-order/:tenant",
  },
  async ({ tenant }) => {
    line("rollback", "z-order", tenant, "begin");
    const { logger } = session_meta();
    await logger.info("Processing migration rollback z-order", { tenant });
    try {
      const result = await rollback("z-order", tenant);
      line("rollback", "z-order", tenant, "end");
      return {
        status: 200,
        data: { message: "Rollback z-order completed", ...result },
      };
    } catch (err) {
      merr({ action: "rollback", version: "z-order", tenant, schema: tenant, phase: "fail" }, "", err);
      throw err;
    }
  }
);

export const PromoteAll = api<MigrationVersionParams, ResponseType>(
  {
    expose: true,
    method: "GET",
    path: "/migration/promote/:version",
  },
  async ({ version }) => {
    line("promote", version, undefined, "begin");
    rejectZOrderAsVersion(version, "promote");
    const { logger } = session_meta();
    await logger.info("Processing migration promote (all)", { version });
    try {
      const result = await promote(version);
      line("promote", version, undefined, "end");
      return {
        status: 200,
        data: { message: "Promote completed", ...result },
      };
    } catch (err) {
      merr({ action: "promote", version, phase: "fail" }, "", err);
      throw err;
    }
  }
);

export const Promote = api<MigrationParams, ResponseType>(
  {
    expose: true,
    method: "GET",
    path: "/migration/promote/:version/:tenant",
  },
  async ({ version, tenant }) => {
    line("promote", version, tenant, "begin");
    const { logger } = session_meta();
    await logger.info("Processing migration promote", { version, tenant });
    try {
      const result = await promote(version, tenant);
      line("promote", version, tenant, "end");
      return {
        status: 200,
        data: { message: "Promote completed", ...result },
      };
    } catch (err) {
      merr({ action: "promote", version, tenant, schema: tenant, phase: "fail" }, "", err);
      throw err;
    }
  }
);

export const RollbackAll = api<MigrationVersionParams, ResponseType>(
  {
    expose: true,
    method: "GET",
    path: "/migration/rollback/:version",
  },
  async ({ version }) => {
    line("rollback", version, undefined, "begin");
    rejectZOrderAsVersion(version, "rollback");
    const { logger } = session_meta();
    await logger.info("Processing migration rollback (all)", { version });
    try {
      const result = await rollback(version);
      line("rollback", version, undefined, "end");
      return {
        status: 200,
        data: { message: "Rollback completed", ...result },
      };
    } catch (err) {
      merr({ action: "rollback", version, phase: "fail" }, "", err);
      throw err;
    }
  }
);

export const Rollback = api<MigrationParams, ResponseType>(
  {
    expose: true,
    method: "GET",
    path: "/migration/rollback/:version/:tenant",
  },
  async ({ version, tenant }) => {
    line("rollback", version, tenant, "begin");
    const { logger } = session_meta();
    await logger.info("Processing migration rollback", { version, tenant });
    try {
      const result = await rollback(version, tenant);
      line("rollback", version, tenant, "end");
      return {
        status: 200,
        data: { message: "Rollback completed", ...result },
      };
    } catch (err) {
      merr({ action: "rollback", version, tenant, schema: tenant, phase: "fail" }, "", err);
      throw err;
    }
  }
);
