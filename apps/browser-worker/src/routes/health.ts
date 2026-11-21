import type { FastifyInstance } from "fastify";

import { PLANNED_AUTOMATION_PHASE, WORKER_CAPABILITIES } from "../capabilities.js";
import { capabilityError } from "../errors.js";
import { workerVersion } from "../version.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/health", async () => {
    const browserAutomation = WORKER_CAPABILITIES.browserAutomation;
    return {
      status: "ok",
      service: "ars-browser-worker",
      version: workerVersion(),
      ready: browserAutomation,
      capabilities: WORKER_CAPABILITIES,
      plannedAutomationPhase: PLANNED_AUTOMATION_PHASE,
    };
  });
}
