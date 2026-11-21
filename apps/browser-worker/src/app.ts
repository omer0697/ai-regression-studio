import Fastify, { type FastifyInstance } from "fastify";

import { healthRoutes } from "./routes/health.js";
import { jobRoutes } from "./routes/jobs.js";

export interface BuildAppOptions {
  /** CORS origins allowed to call this worker directly (optional). */
  allowedOrigins?: string[];
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  if (options.allowedOrigins && options.allowedOrigins.length > 0) {
    app.addHook("onRequest", async (request, reply) => {
      const origin = request.headers.origin;
      if (origin && options.allowedOrigins?.includes(origin)) {
        reply.header("access-control-allow-origin", origin);
        reply.header("access-control-allow-credentials", "true");
        reply.header("access-control-allow-headers", "content-type");
        reply.header("access-control-allow-methods", "GET,POST,OPTIONS");
        if (request.method === "OPTIONS") {
          return reply.code(204).send();
        }
      }
    });
  }

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    const maybeStatus = (error as { statusCode?: unknown }).statusCode;
    const statusCode = typeof maybeStatus === "number" ? maybeStatus : 500;
    return reply.code(statusCode).send({
      error: {
        code: "WORKER_INTERNAL_ERROR",
        message: "Unexpected worker error.",
      },
    });
  });

  void app.register(healthRoutes);
  void app.register(jobRoutes);

  return app;
}
