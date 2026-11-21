import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { hasBrowserAutomation } from "../capabilities.js";
import { DiscoverJobRunner } from "../runner.js";
import { ExecutionReporter } from "../reporter.js";
import type { BrowserLifecycle } from "../browser/lifecycle.js";
import type { CredentialStore } from "../credentials.js";
import type { WorkerConfig } from "../config.js";
import { workerJobSchema } from "@ars/test-schemas";

export function createJobRoutes(
  config: WorkerConfig,
  browser: BrowserLifecycle,
  credentials: CredentialStore,
  runner: DiscoverJobRunner,
) {
  return async function jobRoutes(app: FastifyInstance): Promise<void> {
    /** Executions currently processed by this worker instance. */
    const activeExecutions = new Set<number>();

    /** A single-flight sequential queue; Phase 3+ raises concurrency. */
    let queueChain: Promise<void> = Promise.resolve();

    app.post("/api/jobs", async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = workerJobSchema.safeParse(request.body);
      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0];
        return await reply
          .code(400)
          .send({
            error: {
              code: "INVALID_JOB",
              message: firstIssue
                ? `${firstIssue.path.join(".")}: ${firstIssue.message}`
                : "Invalid job payload.",
            },
          });
      }

      const job = parsed.data;

      if (job.jobType === "execute") {
        // Scenario execution and comparison land in Phase 5.
        return await reply
          .code(501)
          .send({
            error: {
              code: "CAPABILITY_NOT_IMPLEMENTED",
              capability: "scenario-execution",
              plannedPhase: 5,
              message: `Execute jobs (execution #${job.executionId}) are planned for Phase 5 with the differential comparison engine.`,
            },
          });
      }

      if (job.mode === "COMPARISON") {
        // GWT↔React behavioral comparison is the Phase 5 differential engine.
        return await reply
          .code(501)
          .send({
            error: {
              code: "CAPABILITY_NOT_IMPLEMENTED",
              capability: "differential-comparison",
              plannedPhase: 5,
              message: `Comparison execution #${job.executionId} requires the differential engine planned for Phase 5; no partial result is produced.`,
            },
          });
      }

      if (!hasBrowserAutomation()) {
        return await reply
          .code(501)
          .send({
            error: {
              code: "CAPABILITY_NOT_IMPLEMENTED",
              capability: "browser-automation",
              plannedPhase: 2,
              message: "Browser automation is not available in this build.",
            },
          });
      }

      if (activeExecutions.has(job.executionId)) {
        return await reply
          .code(409)
          .send({
            error: {
              code: "EXECUTION_ALREADY_ACTIVE",
              message: `Execution #${job.executionId} is already being processed.`,
            },
          });
      }

      activeExecutions.add(job.executionId);
      queueChain = queueChain
        .then(async () => {
          const reporter = new ExecutionReporter(
            config.apiBaseUrl,
            config.internalToken,
            job.executionId,
          );
          await runner.run(job, reporter);
        })
        .catch((error) => {
          console.error("[jobs] runner crashed:", error);
        })
        .finally(() => {
          activeExecutions.delete(job.executionId);
        });

      return await reply.code(202).send({ accepted: true, executionId: job.executionId });
    });
  };
}
