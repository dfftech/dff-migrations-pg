import { api } from "encore.dev/api";
import { ResponseType } from "../../utils/app-types";
import { session_meta } from "../../utils/app-util";
import { isZOrderRef, promote, rollback } from "../../migration-runner";

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
    `tenant is required for z-order (GET /migration/${action}/z-order/:tenant)`
  );
}

export const PromoteZOrder = api<MigrationTenantParams, ResponseType>(
  {
    expose: true,
    method: "GET",
    path: "/migration/promote/z-order/:tenant",
  },
  async ({ tenant }) => {
    const { logger } = session_meta();
    await logger.info("Processing migration promote z-order", { tenant });
    const result = await promote("z-order", tenant);
    return {
      status: 200,
      data: { message: "Promote z-order completed", ...result },
    };
  }
);

export const RollbackZOrder = api<MigrationTenantParams, ResponseType>(
  {
    expose: true,
    method: "GET",
    path: "/migration/rollback/z-order/:tenant",
  },
  async ({ tenant }) => {
    const { logger } = session_meta();
    await logger.info("Processing migration rollback z-order", { tenant });
    const result = await rollback("z-order", tenant);
    return {
      status: 200,
      data: { message: "Rollback z-order completed", ...result },
    };
  }
);

export const PromoteAll = api<MigrationVersionParams, ResponseType>(
  {
    expose: true,
    method: "GET",
    path: "/migration/promote/:version",
  },
  async ({ version }) => {
    rejectZOrderAsVersion(version, "promote");
    const { logger } = session_meta();
    await logger.info("Processing migration promote (all tenants)", { version });
    const result = await promote(version);
    return {
      status: 200,
      data: { message: "Promote completed", ...result },
    };
  }
);

export const Promote = api<MigrationParams, ResponseType>(
  {
    expose: true,
    method: "GET",
    path: "/migration/promote/:version/:tenant",
  },
  async ({ version, tenant }) => {
    const { logger } = session_meta();
    await logger.info("Processing migration promote", { version, tenant });
    const result = await promote(version, tenant);
    return {
      status: 200,
      data: { message: "Promote completed", ...result },
    };
  }
);

export const RollbackAll = api<MigrationVersionParams, ResponseType>(
  {
    expose: true,
    method: "GET",
    path: "/migration/rollback/:version",
  },
  async ({ version }) => {
    rejectZOrderAsVersion(version, "rollback");
    const { logger } = session_meta();
    await logger.info("Processing migration rollback (all tenants)", { version });
    const result = await rollback(version);
    return {
      status: 200,
      data: { message: "Rollback completed", ...result },
    };
  }
);

export const Rollback = api<MigrationParams, ResponseType>(
  {
    expose: true,
    method: "GET",
    path: "/migration/rollback/:version/:tenant",
  },
  async ({ version, tenant }) => {
    const { logger } = session_meta();
    await logger.info("Processing migration rollback", { version, tenant });
    const result = await rollback(version, tenant);
    return {
      status: 200,
      data: { message: "Rollback completed", ...result },
    };
  }
);
