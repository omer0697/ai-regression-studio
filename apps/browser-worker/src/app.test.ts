import { beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import { WORKER_CAPABILITIES } from "./capabilities.js";
import type { DiscoverJobRunner } from "./runner.js";
import type { WorkerConfig } from "./config.js";

interface RunnerCall {
  job: { executionId: number; jobType: string };
}

function makeTestConfig(): WorkerConfig {
  return {
    port: 9100,
    host: "127.0.0.1",
    headless: true,
    apiBaseUrl: "http://127.0.0.1:1",
    internalToken: "test-token",
    credentialsFile: "fixtures/credentials.example.json",
  };
}

const validDiscoverJob = {
  jobType: "discover",
  executionId: 42,
  projectId: 7,
  screenCode: "KPY68",
  screenName: "KPY68 – Parametre Tanımları",
  mode: "DISCOVERY",
  legacyApp: {
    projectId: 7,
    appType: "LEGACY_GWT",
    displayName: "KAP GWT (TEST)",
    baseUrl: "http://127.0.0.1:9100/fixtures/gwt-kpy68.html",
    environmentLabel: "TEST",
    authMethod: "NONE",
    allowedDomains: ["127.0.0.1"],
    allowedActions: ["safe-exploration"],
    prohibitedActions: ["submit", "delete"],
    browserTimeoutMs: 30000,
    screenshotEnabled: true,
  },
  reactApp: null,
} as const;

describe("browser worker job intake", () => {
  // A no-op runner keeps this suite fast: no browser is launched here.
  const noopRunner = { run: async () => undefined } as unknown as DiscoverJobRunner;
  const app = buildApp({ config: makeTestConfig(), runner: noopRunner });

  beforeAll(async () => {
    await app.ready();
  });

  it("GET /api/health reports live browser automation capabilities", async () => {
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.status).toBe("ok");
    expect(body.ready).toBe(true);
    expect(body.capabilities).toEqual(WORKER_CAPABILITIES);
    expect(body.capabilities.browserAutomation).toBe(true);
    expect(body.plannedComparisonPhase).toBe(5);
  });

  it("POST /api/jobs with a valid discover job returns 202", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/jobs",
      headers: { "content-type": "application/json" },
      payload: validDiscoverJob,
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ accepted: true, executionId: 42 });
  });

  it("POST /api/jobs with an execute job returns structured 501 (Phase 5)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/jobs",
      headers: { "content-type": "application/json" },
      payload: {
        jobType: "execute",
        executionId: 43,
        projectId: 7,
        screenCode: "KPY68",
        plan: {
          scenarioName: "Dependent field activation",
          screen: "KPY68",
          steps: [
            { action: "selectOption", target: "business-field-a", value: "OPTION_X" },
            { action: "assertEnabled", target: "business-field-b" },
          ],
        },
      },
    });

    expect(response.statusCode).toBe(501);
    const body = response.json();
    expect(body.error.code).toBe("CAPABILITY_NOT_IMPLEMENTED");
    expect(body.error.capability).toBe("scenario-execution");
    expect(body.error.plannedPhase).toBe(5);
  });

  it("POST /api/jobs with an invalid payload returns 400", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/jobs",
      headers: { "content-type": "application/json" },
      payload: { jobType: "discover" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_JOB");
  });

  it("POST /api/jobs with a dangerous action plan returns 400", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/jobs",
      headers: { "content-type": "application/json" },
      payload: {
        jobType: "execute",
        executionId: 44,
        projectId: 7,
        screenCode: "KPY68",
        plan: {
          scenarioName: "Malicious plan",
          screen: "KPY68",
          steps: [{ action: "deleteRecord", target: "row-1" }],
        },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_JOB");
  });

  it("serves built-in fixtures for local demonstration", async () => {
    const response = await app.inject({ method: "GET", url: "/fixtures/gwt-kpy68.html" });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("KPY68");

    const missing = await app.inject({ method: "GET", url: "/fixtures/nope.html" });
    expect(missing.statusCode).toBe(404);
  });
});

/** Shared stub type used by the duplicate-dispatch test below. */
class RecordingRunner {
  calls: RunnerCall[] = [];
  gate: Promise<void> = Promise.resolve();
  gateRelease: (() => void) | null = null;

  async run(job: { executionId: number; jobType: string }): Promise<void> {
    this.calls.push({ job });
    if (this.gateRelease) {
      await new Promise<void>((resolve) => {
        this.gateRelease = () => resolve();
      });
    }
  }
}

describe("duplicate dispatch guard", () => {
  it("refuses a second job while the same execution is active", async () => {
    const runner = new RecordingRunner();
    const app = buildApp({ config: makeTestConfig(), runner: runner as unknown as DiscoverJobRunner });
    await app.ready();

    let release!: () => void;
    runner.gateRelease = () => {};

    // Wire the gate so the first job stays in-flight until released.
    runner.run = async (job: { executionId: number; jobType: string }) => {
      runner.calls.push({ job });
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    };

    const first = await app.inject({
      method: "POST",
      url: "/api/jobs",
      headers: { "content-type": "application/json" },
      payload: validDiscoverJob,
    });
    expect(first.statusCode).toBe(202);

    // Give the queue a tick to start the first job.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/jobs",
      headers: { "content-type": "application/json" },
      payload: validDiscoverJob,
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe("EXECUTION_ALREADY_ACTIVE");

    release();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
});
