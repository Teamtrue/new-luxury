import { Worker } from "bullmq";
import { createRedisConnection } from "./queues.js";

const connection = createRedisConnection();

const workers = [
  new Worker(
    "webhooks",
    async (job) => {
      console.log("[worker:webhooks]", job.name, job.id);
    },
    { connection }
  ),
  new Worker(
    "notifications",
    async (job) => {
      console.log("[worker:notifications]", job.name, job.id);
    },
    { connection }
  ),
  new Worker(
    "reconciliation",
    async (job) => {
      console.log("[worker:reconciliation]", job.name, job.id);
    },
    { connection }
  )
];

for (const worker of workers) {
  worker.on("failed", (job, error) => {
    console.error("[worker:failed]", job?.queueName, job?.id, error);
  });
}

console.log("PlutusClub workers started.");
