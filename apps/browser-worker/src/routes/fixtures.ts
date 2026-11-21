import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { FastifyInstance } from "fastify";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".log": "text/plain",
};

/**
 * Serves the built-in fixture applications (GWT-like, React-like, login page)
 * so the platform's browser automation can be demonstrated and tested without
 * access to the real KAP application. These are synthetic test targets by
 * design (master prompt §20) — results against them are real browser results.
 */
export async function fixtureRoutes(app: FastifyInstance): Promise<void> {
  const fixturesDir = resolve(
    import.meta.dirname ?? ".",
    process.env.WORKER_FIXTURES_DIR ?? "../../fixtures",
  );

  app.get("/fixtures/:file", async (request, reply) => {
    const { file } = request.params as { file: string };
    if (!/^[\w.-]+\.html$/.test(file)) {
      return await reply.code(404).send({ error: "Fixture not found" });
    }
    try {
      const content = await readFile(join(fixturesDir, file));
      return await reply
        .code(200)
        .header("Content-Type", CONTENT_TYPES[".html"])
        .send(content);
    } catch {
      return await reply.code(404).send({ error: "Fixture not found" });
    }
  });
}
