import log from "encore.dev/log";
import { Publisher } from 'encore.dev/pubsub';
import { Kafka, type Producer } from "kafkajs";
import { PubSubEventType } from './app-types';
import { env } from './app-util';

const KAFKA_BROKERS = process.env.DFF_KAFKA_BROKERS || "192.168.1.2:29094";
const KAFKA_USERNAME = process.env.DFF_KAFKA_USERNAME || "admin";
const KAFKA_PASSWORD = process.env.DFF_KAFKA_PASSWORD || "DffAdmin224";

let kafkaSingleton: Kafka | null = null;
let sharedProducer: Producer | null = null;
let producerConnected = false;

export function getKafkaClient(): Kafka {
  if (!kafkaSingleton) {
    kafkaSingleton = new Kafka({
      clientId: process.env.DFF_KAFKA_CLIENT_ID || "encore-app",
      brokers: [KAFKA_BROKERS],
      ssl: false,
      sasl: {
        mechanism: "plain",
        username: KAFKA_USERNAME,
        password: KAFKA_PASSWORD,
      },
    });
  }
  return kafkaSingleton;
}

export async function connectKafkaProducer(): Promise<Producer> {
  if (!sharedProducer) {
    sharedProducer = getKafkaClient().producer();
  }
  if (!producerConnected) {
    await sharedProducer.connect();
    producerConnected = true;
    log.info("Kafka utils: shared producer connected");
  }
  return sharedProducer;
}

export async function disconnectKafkaUtilsProducer(): Promise<void> {
  if (!sharedProducer || !producerConnected) return;
  try {
    await sharedProducer.disconnect();
    producerConnected = false;
    sharedProducer = null;
    log.info("Kafka utils: shared producer disconnected");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("Kafka utils: producer disconnect failed", { error: message });
  }
}


export async function kafkaPublish(
  topic: string,
  key: string | null,
  message: unknown
): Promise<void> {
  const producer = await connectKafkaProducer();
  const value =
    typeof message === "string" ? message : JSON.stringify(message);
  await producer.send({
    topic,
    messages: [
      {
        ...(key != null && key !== "" ? { key } : {}),
        value,
      },
    ],
  });
}


export async function runKafkaConsumer(
  topic: string,
  groupId: string,
  ref: Publisher<PubSubEventType>,
  fromBeginning = false
): Promise<void> {
  const consumer = getKafkaClient().consumer({ groupId });
  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning });
  await consumer.run({
    eachMessage: async ({ message: m }) => {
      const raw = m.value?.toString() ?? null;
      await ref.publish({ name: topic, raw });
    },
  });
}
