import { describe, expect, it } from "vitest";

import {
  actionStepSchema,
  scenarioPlanSchema,
  workerJobSchema,
} from "./index.js";

const validPlan = {
  scenarioName: "Dependent field activation",
  screen: "KPY68",
  steps: [
    { action: "selectOption", target: "business-field-a", value: "OPTION_X" },
    { action: "assertEnabled", target: "business-field-b" },
  ],
};

describe("scenarioPlanSchema", () => {
  it("accepts a valid plan", () => {
    const result = scenarioPlanSchema.safeParse(validPlan);
    expect(result.success).toBe(true);
  });

  it("rejects an empty step list", () => {
    const result = scenarioPlanSchema.safeParse({ ...validPlan, steps: [] });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields (no prompt-injection extras)", () => {
    const result = scenarioPlanSchema.safeParse({
      ...validPlan,
      shellCommand: "rm -rf /",
    });
    expect(result.success).toBe(false);
  });
});

describe("actionStepSchema policy boundary", () => {
  it("rejects actions outside the closed vocabulary (e.g. deleteRecord)", () => {
    const result = actionStepSchema.safeParse({ action: "deleteRecord", target: "row-1" });
    expect(result.success).toBe(false);
  });

  it("rejects arbitrary JavaScript execution", () => {
    const result = actionStepSchema.safeParse({
      action: "evaluateJs",
      target: "page",
      value: "document.body.innerHTML = ''",
    });
    expect(result.success).toBe(false);
  });

  it("rejects destructive business operations proposed as actions", () => {
    for (const action of ["submit", "approve", "publish", "delete", "sign", "send"]) {
      const result = actionStepSchema.safeParse({ action, target: "record-1" });
      expect(result.success, `action '${action}' must be rejected`).toBe(false);
    }
  });

  it("requires a target for targeted actions", () => {
    const result = actionStepSchema.safeParse({ action: "click" });
    expect(result.success).toBe(false);
  });

  it("requires a value for fill/selectOption", () => {
    const fill = actionStepSchema.safeParse({ action: "fill", target: "name" });
    expect(fill.success).toBe(false);

    const select = actionStepSchema.safeParse({ action: "selectOption", target: "type" });
    expect(select.success).toBe(false);
  });

  it("rejects selector-like targets (business identifiers only)", () => {
    const result = actionStepSchema.safeParse({ action: "click", target: "../..//script" });
    expect(result.success).toBe(false);
  });

  it("rejects a value on actions that do not take one", () => {
    const result = actionStepSchema.safeParse({
      action: "assertEnabled",
      target: "field-b",
      value: "anything",
    });
    expect(result.success).toBe(false);
  });
});

describe("workerJobSchema", () => {
  const validJob = {
    jobType: "discover",
    executionId: 1,
    projectId: 1,
    screenCode: "KPY68",
    screenName: "KPY68 – Parametre Tanımları",
    mode: "DISCOVERY",
    legacyApp: {
      projectId: 1,
      appType: "LEGACY_GWT",
      displayName: "KAP GWT (TEST)",
      baseUrl: "https://gwt.kap-test.example.com",
      environmentLabel: "TEST",
      authMethod: "TEST_ACCOUNT_FORM",
      credentialReference: "kap-gwt-test-user",
      loginUrl: "https://gwt.kap-test.example.com/login",
      usernameSelector: "[name=username]",
      passwordSelector: "[name=password]",
      submitSelector: "[type=submit]",
      allowedDomains: ["gwt.kap-test.example.com"],
      allowedActions: ["safe-exploration"],
      prohibitedActions: ["submit", "delete", "approve", "sign", "send"],
      browserTimeoutMs: 30_000,
      screenshotEnabled: true,
    },
    reactApp: null,
  };

  it("accepts a valid discover job", () => {
    const result = workerJobSchema.safeParse(validJob);
    expect(result.success).toBe(true);
  });

  it("rejects a job without a valid base URL", () => {
    const result = workerJobSchema.safeParse({
      ...validJob,
      legacyApp: { ...validJob.legacyApp, baseUrl: "not-a-url" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a job that smuggles a secret into credentialReference", () => {
    const result = workerJobSchema.safeParse({
      ...validJob,
      legacyApp: {
        ...validJob.legacyApp,
        credentialReference: "user:password@host",
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown job type", () => {
    const result = workerJobSchema.safeParse({ ...validJob, jobType: "shell" });
    expect(result.success).toBe(false);
  });
});
