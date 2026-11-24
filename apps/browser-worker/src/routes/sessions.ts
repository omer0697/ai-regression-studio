import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { SessionManager } from "../browser/session-manager.js";

export function createSessionRoutes(sessionManager: SessionManager) {
  return async function sessionRoutes(app: FastifyInstance): Promise<void> {
    app.get("/api/sessions", async (_request: FastifyRequest, reply: FastifyReply) => {
      const sessions = await sessionManager.listSessions();
      const pendingExecutions = sessionManager.listPendingExecutions();
      return await reply.code(200).send({
        sessions,
        pendingExecutions,
      });
    });

    app.post("/api/sessions/open", async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body ?? {}) as { profileKey?: string; targetUrl?: string };
      if (!body.targetUrl || !/^https?:\/\//i.test(body.targetUrl.trim())) {
        return await reply.code(400).send({
          error: {
            code: "INVALID_TARGET_URL",
            message: "Geçerli bir http/https hedef URL giriniz.",
          },
        });
      }
      try {
        const meta = await sessionManager.openLoginWindow(body.profileKey, body.targetUrl.trim());
        return await reply.code(200).send(meta);
      } catch (error) {
        return await reply.code(500).send({
          error: {
            code: "SESSION_WINDOW_FAILED",
            message: error instanceof Error ? error.message : String(error),
          },
        });
      }
    });

    app.post("/api/sessions/save", async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body ?? {}) as { profileKey?: string; closeWindow?: boolean };
      if (!body.profileKey || !body.profileKey.trim()) {
        return await reply.code(400).send({
          error: {
            code: "PROFILE_KEY_REQUIRED",
            message: "Kaydedilecek oturum anahtarı (profileKey) zorunludur.",
          },
        });
      }
      try {
        const meta = await sessionManager.saveLoginWindow(
          body.profileKey.trim(),
          body.closeWindow ?? true,
        );
        return await reply.code(200).send(meta);
      } catch (error) {
        return await reply.code(400).send({
          error: {
            code: "SESSION_SAVE_FAILED",
            message: error instanceof Error ? error.message : String(error),
          },
        });
      }
    });

    app.post(
      "/api/sessions/executions/:executionId/continue",
      async (request: FastifyRequest, reply: FastifyReply) => {
        const params = request.params as { executionId?: string };
        const executionId = Number(params.executionId);
        const body = (request.body ?? {}) as { skipNavigation?: boolean };
        if (!Number.isInteger(executionId) || executionId <= 0) {
          return await reply.code(400).send({
            error: {
              code: "INVALID_EXECUTION_ID",
              message: "Geçerli bir executionId gereklidir.",
            },
          });
        }
        const resumed = sessionManager.continueExecution(executionId, {
          skipNavigation: body.skipNavigation,
        });
        return await reply.code(200).send({
          resumed,
          executionId,
        });
      },
    );

    app.delete(
      "/api/sessions/:profileKey",
      async (request: FastifyRequest, reply: FastifyReply) => {
        const { profileKey } = request.params as { profileKey: string };
        await sessionManager.deleteSession(profileKey);
        return await reply.code(204).send();
      },
    );
  };
}
