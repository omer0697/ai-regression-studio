import Fastify, { type FastifyInstance } from "fastify";

import { BrowserLifecycle } from "./browser/lifecycle.js";
import { SessionManager } from "./browser/session-manager.js";
import { loadConfig, type WorkerConfig } from "./config.js";
import { loadCredentialStore, type CredentialStore } from "./credentials.js";
import { ComparisonRunner } from "./comparison/comparison.js";
import { CombinationRunner } from "./comparison/combination.js";
import { healthRoutes } from "./routes/health.js";
import { fixtureRoutes } from "./routes/fixtures.js";
import { createJobRoutes } from "./routes/jobs.js";
import { createSessionRoutes } from "./routes/sessions.js";
import { DiscoverJobRunner } from "./runner.js";

export interface BuildAppOptions {
  /** CORS origins allowed to call this worker directly (optional). */
  allowedOrigins?: string[];
  /** Injected for tests; defaults come from the environment. */
  config?: WorkerConfig;
  browser?: BrowserLifecycle;
  credentials?: CredentialStore;
  sessions?: SessionManager;
  runner?: DiscoverJobRunner;
  comparisonRunner?: ComparisonRunner;
  combinationRunner?: CombinationRunner;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const config = options.config ?? loadConfig();
  const browser = options.browser ?? new BrowserLifecycle(config);
  const credentials = options.credentials ?? loadCredentialStore(config);
  const sessions = options.sessions ?? new SessionManager(browser);
  const runner = options.runner ?? new DiscoverJobRunner(browser, credentials, sessions);
  const comparisonRunner =
      options.comparisonRunner ?? new ComparisonRunner(browser, credentials, sessions);
  const combinationRunner =
      options.combinationRunner ?? new CombinationRunner(browser, credentials, sessions);

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    const isAllowed =
      origin &&
      ((options.allowedOrigins && options.allowedOrigins.includes(origin)) ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin));
    if (isAllowed) {
      reply.header("access-control-allow-origin", origin);
      reply.header("access-control-allow-credentials", "true");
      reply.header("access-control-allow-headers", "content-type");
      reply.header("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
      if (request.method === "OPTIONS") {
        return reply.code(204).send();
      }
    }
  });

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
  void app.register(fixtureRoutes);
  void app.register(createSessionRoutes(sessions));
  void app.register(
    createJobRoutes(config, browser, credentials, runner, comparisonRunner, combinationRunner),
  );

  return app;
}
