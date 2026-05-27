import { Queue } from "bullmq";
import { Redis } from "ioredis";

export type PlutusQueueName = "webhooks" | "notifications" | "reconciliation";

export function createRedisConnection(): Redis {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error("REDIS_URL is required for worker queues.");
  }

  return new Redis(redisUrl, {
    maxRetriesPerRequest: null
  });
}

export function createQueue(name: PlutusQueueName, connection = createRedisConnection()): Queue {
  return new Queue(name, {
    connection,
    defaultJobOptions: {
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 5000
      },
      removeOnComplete: 1000,
      removeOnFail: 5000
    }
  });
}
