import { pathToFileURL } from "node:url";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BrowserLifecycle } from "./browser/lifecycle.js";
import { loadCredentialStore } from "./credentials.js";
import type { WorkerConfig } from "./config.js";
import { DiscoverJobRunner } from "./runner.js";
import type { ExecutionReporter, StatusUpdate } from "./reporter.js";
import type { DiscoverJob } from "@ars/test-schemas";

const fixturesDir = resolve(import.meta.dirname ?? ".", "../fixtures");

/** In-memory reporter: captures the exact stream the Spring API would receive. */
class RecordingReporter {
  events: Array<{ type: string; message: string; payload?: Record<string, unknown> }> = [];
  statuses: StatusUpdate[] = [];
  artifacts: Array<{ type: string; name: string; bytes: number }> = [];
  elementBatches: Array<Array<Record<string, unknown>>> = [];
  observationBatches: Array<Array<Record<string, unknown>>> = [];

  async event(type: string, message: string, payload?: Record<string, unknown>) {
    this.events.push({ type, message, payload });
  }

  async status(update: StatusUpdate) {
    this.statuses.push(update);
  }

  async artifact(type: string, name: string, _mime: string, bytes: Uint8Array) {
    this.artifacts.push({ type, name, bytes: bytes.byteLength });
  }

  async elements(records: Array<Record<string, unknown>>) {
    this.elementBatches.push(records);
  }

  async observations(records: Array<Record<string, unknown>>) {
    this.observationBatches.push(records);
  }
}

describe("DiscoverJobRunner — real Chromium end to end", () => {
  const config: WorkerConfig = {
    port: 9100,
    host: "127.0.0.1",
    headless: true,
    apiBaseUrl: "http://127.0.0.1:1",
    internalToken: "test",
    credentialsFile: join(fixturesDir, "credentials.example.json"),
  };

  let browser: BrowserLifecycle;

  beforeEach(() => {
    browser = new BrowserLifecycle(config);
  });

  afterEach(async () => {
    await browser.shutdown();
  });

  function jobFor(overrides: Partial<DiscoverJob["legacyApp"]> = {}): DiscoverJob {
    return {
      jobType: "discover",
      executionId: 101,
      projectId: 7,
      screenCode: "KPY68",
      screenName: "KPY68 – Parametre Tanımları",
      mode: "DISCOVERY",
      legacyApp: {
        projectId: 7,
        appType: "LEGACY_GWT",
        displayName: "KAP GWT (TEST)",
        baseUrl: pathToFileURL(join(fixturesDir, "gwt-kpy68.html")).toString(),
        environmentLabel: "TEST",
        authMethod: "NONE",
        allowedDomains: [],
        allowedActions: ["safe-exploration"],
        prohibitedActions: ["submit", "delete"],
        browserTimeoutMs: 15_000,
        screenshotEnabled: true,
        ...overrides,
      },
      reactApp: null,
    } as DiscoverJob;
  }

  it("discovers elements, explores safely and completes honestly", async () => {
    const credentials = loadCredentialStore(config);
    const runner = new DiscoverJobRunner(browser, credentials);
    const reporter = new RecordingReporter();

    await runner.run(jobFor(), reporter as unknown as ExecutionReporter);

    // Terminal status first, RUNNING at start.
    expect(reporter.statuses.at(0)?.status).toBe("RUNNING");
    const final = reporter.statuses.at(-1);
    expect(final?.status).toBe("COMPLETED");
    // 15 passive elements (the form-layout table itself is e1, DOM order) +
    // 4 bounded interactions (2 select options, 1 checkbox toggle, 1 radio).
    expect(final?.totalSteps).toBe(19);
    expect(final?.passedSteps).toBe(17);
    expect(final?.failedSteps).toBe(0);
    // Hidden elements are reported as skipped, never as failures:
    // the hidden input and the initially-hidden conditional section.
    expect(final?.skippedSteps).toBe(2);

    // Evidence: passive screenshot + interaction screenshots + trace.
    const screenshot = reporter.artifacts.find((artifact) => artifact.type === "SCREENSHOT");
    expect(screenshot?.bytes).toBeGreaterThan(10_000);
    const trace = reporter.artifacts.find((artifact) => artifact.type === "TRACE");
    expect(trace?.bytes).toBeGreaterThan(1_000);

    // Elements were reported for persistence.
    expect(reporter.elementBatches.at(0)?.length).toBe(15);

    // Safe exploration ran and every step was reverted afterwards.
    const messages = reporter.events.map((event) => event.message).join("\n");
    expect(messages).toContain("Application is ready.");
    expect(messages).toContain("Exploration plan: 4 bounded interaction(s)");
    expect(messages).toContain("the screen was reverted after each step");
    expect(messages).toContain("Discovery completed");
  }, 120_000);

  it("performs configured form login and then discovers the screen", async () => {
    const credentials = loadCredentialStore(config);
    const runner = new DiscoverJobRunner(browser, credentials);
    const reporter = new RecordingReporter();

    const job = jobFor({
      authMethod: "TEST_ACCOUNT_FORM",
      loginUrl: pathToFileURL(join(fixturesDir, "login.html")).toString(),
      usernameSelector: "input[name='username']",
      passwordSelector: "input[name='password']",
      submitSelector: "button[type='submit']",
      credentialReference: "kap-gwt-test-user",
    });

    await runner.run(job, reporter as unknown as ExecutionReporter);

    const messages = reporter.events.map((event) => event.message).join("\n");
    expect(messages).toContain("Test-account login accepted by the application.");
    expect(reporter.statuses.at(-1)?.status).toBe("COMPLETED");
  }, 120_000);

  it("fails honestly when credentials are missing for the reference", async () => {
    const runner = new DiscoverJobRunner(browser, new Map());
    const reporter = new RecordingReporter();

    const job = jobFor({
      authMethod: "TEST_ACCOUNT_FORM",
      loginUrl: pathToFileURL(join(fixturesDir, "login.html")).toString(),
      usernameSelector: "input[name='username']",
      passwordSelector: "input[name='password']",
      submitSelector: "button[type='submit']",
      credentialReference: "does-not-exist",
    });

    await runner.run(job, reporter as unknown as ExecutionReporter);

    expect(reporter.statuses.at(-1)?.status).toBe("FAILED");
    expect(reporter.statuses.at(-1)?.statusMessage).toContain("does-not-exist");
    const messages = reporter.events.map((event) => event.message).join("\n");
    expect(messages).toContain("Discovery failed:");
  }, 120_000);

  it("fails honestly when the target is unreachable", async () => {
    const credentials = loadCredentialStore(config);
    const runner = new DiscoverJobRunner(browser, credentials);
    const reporter = new RecordingReporter();

    const job = jobFor({
      baseUrl: "http://127.0.0.1:1/does-not-exist.html",
      browserTimeoutMs: 5_000,
    });

    await runner.run(job, reporter as unknown as ExecutionReporter);

    expect(reporter.statuses.at(-1)?.status).toBe("FAILED");
    expect(reporter.statuses.length).toBe(2); // RUNNING + FAILED
  }, 120_000);

  it("observes and records real dependency changes with full revert", async () => {
    const credentials = loadCredentialStore(config);
    const runner = new DiscoverJobRunner(browser, credentials);
    const reporter = new RecordingReporter();

    await runner.run(jobFor(), reporter as unknown as ExecutionReporter);

    const batch = reporter.observationBatches.at(0) ?? [];
    expect(batch.length).toBe(4); // 2 enabled + 1 enabled + 1 visible
    for (const observation of batch) {
      expect(observation.reverted).toBe(true);
    }

    const byAffected = (ref: string) =>
      batch.filter((observation) => observation.affectedRef === ref);

    // select DIGER -> Parametre Değeri (e4) becomes enabled and auto-populated.
    const paramValue = byAffected("e4");
    expect(paramValue.length).toBe(2); // enabled + value
    expect(
      paramValue.find((observation) => observation.attribute === "enabled")?.afterValue,
    ).toBe("true");
    expect(
      paramValue.find((observation) => observation.attribute === "value")?.afterValue,
    ).toBe("OTO-123");

    // unchecking Aktif -> Başlangıç Tarihi (e6) becomes disabled.
    const startDate = byAffected("e6");
    expect(startDate.length).toBe(1);
    expect(startDate.at(0)?.attribute).toBe("enabled");
    expect(startDate.at(0)?.beforeValue).toBe("true");
    expect(startDate.at(0)?.afterValue).toBe("false");

    // choosing Manuel -> hidden Onay Notu becomes visible.
    const approvalNote = batch.find(
      (observation) => observation.attribute === "visible",
    );
    expect(approvalNote).toBeDefined();
    expect(approvalNote?.beforeValue).toBe("false");
    expect(approvalNote?.afterValue).toBe("true");

    // No business action was ever executed (no submit/delete/approve events).
    const messages = reporter.events.map((event) => event.message).join(" ");
    expect(messages).not.toContain("submit");
    expect(messages).not.toContain("Sorgula");
  }, 120_000);
});
