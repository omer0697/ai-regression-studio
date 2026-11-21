import { buildApp } from "./app.js";

const port = Number(process.env.WORKER_PORT ?? 9100);
const host = process.env.WORKER_HOST ?? "0.0.0.0";

const app = buildApp();

try {
  await app.listen({ port, host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
