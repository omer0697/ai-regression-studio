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

  it("discovers elements, uploads evidence and completes honestly", async () => {
    const credentials = loadCredentialStore(config);
    const runner = new DiscoverJobRunner(browser, credentials);
    const reporter = new RecordingReporter();

    await runner.run(jobFor(), reporter as unknown as ExecutionReporter);

    // Terminal status first, RUNNING at start.
    expect(reporter.statuses.at(0)?.status).toBe("RUNNING");
    const final = reporter.statuses.at(-1);
    expect(final?.status).toBe("COMPLETED");
    expect(final?.totalSteps).toBeGreaterThan(10);
    expect(final?.passedSteps).toBeGreaterThan(0);
    expect(final?.failedSteps).toBe(0);
    // Hidden fields are reported as skipped, never as failures.
    expect(final?.skippedSteps).toBeGreaterThan(0);

    // Evidence: screenshot + trace uploaded with real bytes.
    const screenshot = reporter.artifacts.find((artifact) => artifact.type === "SCREENSHOT");
    expect(screenshot?.bytes).toBeGreaterThan(10_000);
    const trace = reporter.artifacts.find((artifact) => artifact.type === "TRACE");
    expect(trace?.bytes).toBeGreaterThan(1_000);

    // Elements were reported for persistence.
    expect(reporter.elementBatches.at(0)?.length).toBeGreaterThan(10);

    // Honest progress narrative.
    const messages = reporter.events.map((event) => event.message).join("\n");
    expect(messages).toContain("Application is ready.");
    expect(messages).toContain("No browser console errors observed.");
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
});
