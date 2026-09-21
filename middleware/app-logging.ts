import { APIError, ErrCode, middleware } from "encore.dev/api";
import { JwtDecode, type SessionInfo } from "dff-util";
import { createKafkaLogger, initKafkaProducer } from "./kafka-logger";
initKafkaProducer();
export const LoggingMiddleware = middleware(async (req, next) => {
  const startTime = Date.now();
  const callMeta = req.requestMeta as any;
  const tenantId = callMeta?.headers?.["x-tenant-id"];
  const requestId = callMeta?.headers?.["request-id"] || crypto.randomUUID();
  const traceId = callMeta?.headers?.["x-encore-trace-id"];
  let sessionUser: SessionInfo;

  try {
    const token = (callMeta?.headers?.["authorization"] as string)
      ?.replace(/bearer|jwt/i, "")
      .trim();
    sessionUser = token
      ? (JwtDecode(token) as SessionInfo)
      : ({ id: "unknown" } as SessionInfo);
    req.data.token = token;
  } catch {
    sessionUser = { id: "unknown" } as SessionInfo;
  }

  sessionUser.requestId = requestId;

  const logger = createKafkaLogger(
    requestId,
    traceId,
    sessionUser.id,
    tenantId
  );
  req.data.tenant_id = tenantId;
  req.data.session_user = sessionUser;
  req.data.request_id = requestId;
  req.data.logger = logger;

  await logger.info("Request started", {
    method: callMeta?.method,
    path: callMeta?.path,
  });

  try {
    const response = await next(req);
    response.header.set("request-id", requestId);
    response.header.set("session-user-id", sessionUser.id);

    if (traceId) {
      response.header.set("X-Encore-Trace-Id", traceId);
    }

    await logger.info("Request completed", response);
    await logger.info(
      "Completed request duration(sec): "+ ((Date.now() - startTime) / 1000)
    );
    return response;
  } catch (err: any) {
     err = err.error || err;
    await logger.error("Request failed", {
      error_message: err.message,
      error_stack: err.stack,
    });

    await logger.info(
      "Completed request duration(sec): " + ((Date.now() - startTime) / 1000)
    );
    throw APIError.unknown(err.message || err);
  }
});
