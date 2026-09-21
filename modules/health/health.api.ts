import { readFileSync } from "node:fs";
import { join } from "node:path";
import { api } from "encore.dev/api";
import { RequestQueryType, ResponseType } from "../../utils/app-types";
import { session_meta } from "../../utils/app-util";

function appVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8")
    ) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

const version = appVersion();


export const HealthCheck = api<RequestQueryType, ResponseType>(
  {
    expose: true,
    method: "GET",
    path: "/health/:id",
  },
  async (params: RequestQueryType) => {
    const tenant = String(params.id);
    const { logger } = session_meta();
    await logger.info("Processing health request", {
      tenant,
      version,
      query: params.query,
    });
    return {
      status: 200,
      data: {
        message: "Health Check Pass",
        tenant,
        version,
        query: params.query ? { query: params.query } : undefined,
      },
    };
  }
);
