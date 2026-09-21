import log from "encore.dev/log";
import {
  connectKafkaProducer,
  kafkaPublish
} from "../utils/kafka-util";
import { env } from "../utils/app-util";
import { maskLogData } from "../utils/log-mask";

const KAFKA_LOG_TOPIC = env("KAFKA_LOG_TOPIC") || "app-logs";
const KAFKA_LOG_SEND = env("KAFKA_LOG_SEND") || "false";

let isKafkaConnected = false;

export async function initKafkaProducer() {
  try {
    if (KAFKA_LOG_SEND === "false") return;
    await connectKafkaProducer();
    isKafkaConnected = true;
    log.info("Kafka producer connected");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("Kafka connection failed", { error: message });
    isKafkaConnected = false;
  }
}

export function createKafkaLogger(
  requestId: string,
  traceId?: string,
  sessionUserId?: string,
  tenantId?: string
) {
  const baseContext = {
    request_id: requestId,
    trace_id: traceId,
    session_user_id: sessionUserId,
    tenant_id: tenantId,
    timestamp: new Date().toISOString(),
  };

  const fallbackLogger = log.with({
    request_id: requestId,
    trace_id: traceId,
    tenant_id: tenantId,
    session_user_id: sessionUserId,
  });

  async function sendToKafka(level: string, message: string, data: any) {
    if (!isKafkaConnected) return false;

    try {
      await kafkaPublish(KAFKA_LOG_TOPIC, null, {
        level,
        message,
        ...baseContext,
        ...data,
      });
      return true;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      fallbackLogger.error("Failed to send log to Kafka", {
        error: msg,
      });
      return false;
    }
  }

  function createMethod(level: "info" | "error" | "warn" | "debug") {
    return async (message: string, data: Record<string, any> = {}) => {
      const safe = maskLogData(data) as Record<string, any>;
      const context = { ...baseContext, ...safe };
      fallbackLogger[level](message, context);
      await sendToKafka(level, message, safe);
    };
  }

  return {
    info: createMethod("info"),
    error: createMethod("error"),
    warn: createMethod("warn"),
    debug: createMethod("debug"),
  };
}
