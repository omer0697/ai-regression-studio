import type { FastifyInstance } from "fastify";

import { PLANNED_COMPARISON_PHASE, WORKER_CAPABILITIES } from "../capabilities.js";
import { hasBrowserAutomation } from "../capabilities.js";
import { workerVersion } from "../version.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/health", async () => {
    const browserAutomation = hasBrowserAutomation();
    return {
      status: "ok",
      service: "ars-browser-worker",
      version: workerVersion(),
      ready: browserAutomation,
      capabilities: WORKER_CAPABILITIES,
      plannedComparisonPhase: PLANNED_COMPARISON_PHASE,
    };
  });
}
