import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { hasBrowserAutomation, PLANNED_AUTOMATION_PHASE } from "../capabilities.js";
import { capabilityError, invalidJobError } from "../errors.js";
import { workerJobSchema } from "@ars/test-schemas";

/**
 * Job intake endpoint.
 *
 * Phase 1: validates the job against the strict schema, then — because
 * browser automation is not implemented yet — responds with a structured
 * 501 error. The API layer records this honestly as NOT_SUPPORTED.
 */
export async function jobRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/jobs", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = workerJobSchema.safeParse(request.body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return await reply
        .code(400)
        .send(invalidJobError(firstIssue ? `${firstIssue.path.join(".")}: ${firstIssue.message}` : "Invalid job payload"));
    }

    if (!hasBrowserAutomation()) {
      return await reply
        .code(501)
        .send(
          capabilityError(
            "browser-automation",
            PLANNED_AUTOMATION_PHASE,
            `Job ${parsed.data.jobType} for execution #${parsed.data.executionId} was understood, but browser automation is not implemented yet (planned for Phase ${PLANNED_AUTOMATION_PHASE}). No browser session was started and no test result was produced.`,
          ),
        );
    }

    // Phase 2: enqueue the job for the Playwright runner.
    return await reply.code(202).send({ accepted: true });
  });
}
