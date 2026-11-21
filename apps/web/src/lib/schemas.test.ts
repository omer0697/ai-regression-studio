import { describe, expect, it } from "vitest";

import {
  environmentFormSchema,
  environmentFormToPayload,
  executionStartSchema,
  projectFormSchema,
  screenFormSchema,
} from "./schemas";

const validEnvironment = {
  appType: "LEGACY_GWT",
  displayName: "KAP GWT (TEST)",
  baseUrl: "https://gwt.kap-test.example.com",
  environmentLabel: "TEST",
  authMethod: "NONE",
  credentialReference: "",
  loginUrl: "",
  usernameSelector: "",
  passwordSelector: "",
  submitSelector: "",
  allowedDomains: "gwt.kap-test.example.com",
  prohibitedActions: "submit, delete",
  browserTimeoutMs: 30000,
  screenshotEnabled: true,
} as const;

describe("projectFormSchema", () => {
  it("accepts a valid project", () => {
    const result = projectFormSchema.safeParse({
      name: "KAP Migration",
      environmentName: "TEST",
      description: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a project name that is too short", () => {
    const result = projectFormSchema.safeParse({ name: "K", environmentName: "TEST" });
    expect(result.success).toBe(false);
  });

  it("requires an environment name", () => {
    const result = projectFormSchema.safeParse({ name: "KAP Migration", environmentName: "" });
    expect(result.success).toBe(false);
  });
});

describe("environmentFormSchema", () => {
  it("accepts a valid environment", () => {
    const result = environmentFormSchema.safeParse(validEnvironment);
    expect(result.success).toBe(true);
  });

  it("rejects a malformed base URL", () => {
    const result = environmentFormSchema.safeParse({
      ...validEnvironment,
      baseUrl: "gwt-kap-test",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a timeout below the minimum", () => {
    const result = environmentFormSchema.safeParse({
      ...validEnvironment,
      browserTimeoutMs: 500,
    });
    expect(result.success).toBe(false);
  });

  it("converts comma separated lists in the payload and trims items", () => {
    const parsed = environmentFormSchema.parse(validEnvironment);
    const payload = environmentFormToPayload(parsed);
    expect(payload.allowedDomains).toEqual(["gwt.kap-test.example.com"]);
    expect(payload.prohibitedActions).toEqual(["submit", "delete"]);
    expect(payload.credentialReference).toBeUndefined();
  });
});

describe("screenFormSchema", () => {
  it("accepts KPY68-style screen codes", () => {
    const result = screenFormSchema.safeParse({ screenCode: "KPY68", name: "Parametre" });
    expect(result.success).toBe(true);
  });

  it("rejects lowercase or selector-like screen codes", () => {
    expect(screenFormSchema.safeParse({ screenCode: "kpy68", name: "X" }).success).toBe(false);
    expect(
      screenFormSchema.safeParse({ screenCode: "../etc", name: "X" }).success,
    ).toBe(false);
  });
});

describe("executionStartSchema", () => {
  it("requires a screen and a mode", () => {
    expect(executionStartSchema.safeParse({ screenId: 5, mode: "DISCOVERY" }).success).toBe(true);
    expect(executionStartSchema.safeParse({ screenId: 0, mode: "DISCOVERY" }).success).toBe(false);
    expect(executionStartSchema.safeParse({ screenId: 5, mode: "HACK" }).success).toBe(false);
  });
});
