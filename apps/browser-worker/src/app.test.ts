import { beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import { WORKER_CAPABILITIES } from "./capabilities.js";

describe("browser worker skeleton", () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  it("GET /api/health reports honest capabilities", async () => {
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("ars-browser-worker");
    expect(body.ready).toBe(false);
    expect(body.capabilities).toEqual(WORKER_CAPABILITIES);
    expect(body.capabilities.browserAutomation).toBe(false);
    expect(body.plannedAutomationPhase).toBe(2);
  });

  it("POST /api/jobs with a valid discover job returns structured 501", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/jobs",
      headers: { "content-type": "application/json" },
      payload: {
        jobType: "discover",
        executionId: 42,
        projectId: 7,
        screenCode: "KPY68",
        screenName: "KPY68",
        mode: "DISCOVERY",
        legacyApp: {
          projectId: 7,
          appType: "LEGACY_GWT",
          displayName: "KAP GWT (TEST)",
          baseUrl: "https://gwt.kap-test.example.com",
          environmentLabel: "TEST",
          authMethod: "NONE",
          allowedDomains: ["gwt.kap-test.example.com"],
          allowedActions: ["safe-exploration"],
          prohibitedActions: ["submit", "delete"],
          browserTimeoutMs: 30000,
          screenshotEnabled: true,
        },
        reactApp: null,
      },
    });

    expect(response.statusCode).toBe(501);
    const body = response.json();
    expect(body.error.code).toBe("CAPABILITY_NOT_IMPLEMENTED");
    expect(body.error.capability).toBe("browser-automation");
    expect(body.error.plannedPhase).toBe(2);
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

  it("POST /api/jobs rejects a job with a dangerous action plan", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/jobs",
      headers: { "content-type": "application/json" },
      payload: {
        jobType: "execute",
        executionId: 42,
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

  it("POST /api/jobs rejects unknown routes with a worker error envelope", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/jobs",
      headers: { "content-type": "application/json" },
      payload: { jobType: "shell" },
    });

    expect(response.statusCode).toBe(400);
  });
});
