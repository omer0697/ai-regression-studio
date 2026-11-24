import { pathToFileURL } from "node:url";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BrowserLifecycle } from "../browser/lifecycle.js";
import { loadCredentialStore } from "../credentials.js";
import type { WorkerConfig } from "../config.js";
import { ComparisonRunner, type ComparisonFinding } from "./comparison.js";
import type { ExecutionReporter, StatusUpdate } from "../reporter.js";
import type { ComparisonJob } from "@ars/test-schemas";

const fixturesDir = resolve(import.meta.dirname ?? ".", "../../fixtures");

class RecordingReporter {
  events: Array<{ type: string; message: string; payload?: Record<string, unknown> }> = [];
  statuses: StatusUpdate[] = [];
  artifacts: Array<{ type: string; name: string; bytes: number }> = [];
  mappings: Array<Array<Record<string, unknown>>> = [];
  findingBatches: Array<Array<ComparisonFinding>> = [];

  async event(type: string, message: string, payload?: Record<string, unknown>) {
    this.events.push({ type, message, payload });
  }
  async status(update: StatusUpdate) {
    this.statuses.push(update);
  }
  async artifact(type: string, name: string, _mime: string, bytes: Uint8Array) {
    this.artifacts.push({ type, name, bytes: bytes.byteLength });
  }
  async mapping(records: Array<Record<string, unknown>>) {
    this.mappings.push(records);
  }
  async findings(records: Array<Record<string, unknown>>) {
    this.findingBatches.push(records as unknown as ComparisonFinding[]);
  }
}

describe("ComparisonRunner — differential engine against injected defects", () => {
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

  function comparisonJob(): ComparisonJob {
    const credentials = loadCredentialStore(config);
    return {
      jobType: "compare",
      executionId: 501,
      projectId: 7,
      screenCode: "KPY68",
      screenName: "KPY68",
      mode: "COMPARISON",
      plan: {
        scenarioName: "DIGER secimi deger alanini etkinlestirmeli",
        screen: "KPY68",
        steps: [
          { action: "selectOption", target: "e3", value: "DIGER" },
          { action: "setCheckbox", target: "e7", value: "false" },
          { action: "chooseRadio", target: "e9" },
        ],
      },
      legacyApp: {
        projectId: 7,
        appType: "LEGACY_GWT",
        displayName: "KAP GWT (TEST)",
        baseUrl: pathToFileURL(join(fixturesDir, "gwt-kpy68.html")).toString(),
        environmentLabel: "TEST",
        authMethod: "NONE",
        allowedDomains: [],
        allowedActions: [],
        prohibitedActions: [],
        browserTimeoutMs: 15_000,
        explorationMaxInteractions: 12,
        explorationMaxOptions: 3,
        screenshotEnabled: true,
      },
      reactApp: {
        projectId: 7,
        appType: "REACT",
        displayName: "KAP React (TEST)",
        baseUrl: pathToFileURL(join(fixturesDir, "react-kpy68.html")).toString(),
        environmentLabel: "TEST",
        authMethod: "NONE",
        allowedDomains: [],
        allowedActions: [],
        prohibitedActions: [],
        browserTimeoutMs: 15_000,
        explorationMaxInteractions: 12,
        explorationMaxOptions: 3,
        screenshotEnabled: true,
      },
    } as unknown as ComparisonJob;
  }

  it("detects every intentionally injected React regression with evidence", async () => {
    const runner = new ComparisonRunner(browser, loadCredentialStore(config));
    const reporter = new RecordingReporter();

    await runner.run(comparisonJob(), reporter as unknown as ExecutionReporter);

    // Honest terminal status.
    const statuses = reporter.statuses.map((update) => update.status).join(",");
    if (statuses.endsWith("FAILED")) {
      console.error(
        "DEBUG events:\n" +
          reporter.events.map((event) => `[${event.type}] ${event.message}`).join("\n"),
      );
    }
    expect(reporter.statuses.at(-1)?.status).toBe("COMPLETED");

    const findings = reporter.findingBatches.at(0) ?? [];
    const categories = findings.map((finding) => finding.category);
    const titles = findings.map((finding) => finding.title).join("\n");
    const labels = findings
      .map((finding) => `${finding.category}|${finding.legacyLabel}`)
      .join("\n");

    // Defect 1: FIELD_MISSING — Açıklama textarea missing in React.
    expect(categories).toContain("FIELD_MISSING");
    expect(labels).toContain("FIELD_MISSING|Açıklama");
    // Defect 2: FIELD_MISSING — conditional Onay Notu section never appears.
    expect(labels).toContain("FIELD_MISSING|Onay Notu (Manuel onay)");
    // Defect 3: DEPENDENCY_MISMATCH — Parametre Değeri not enabled by DIGER.
    expect(labels).toContain("DEPENDENCY_MISMATCH|Parametre Değeri");
    // Defect 4: DEPENDENCY_MISMATCH — Başlangıç Tarihi stays enabled.
    expect(labels).toContain("DEPENDENCY_MISMATCH|Başlangıç Tarihi");
    // Defect 5: VALUE_MISMATCH — Parametre Kodu empty (GWT: KPY-001).
    expect(labels).toContain("VALUE_MISMATCH|Parametre Kodu");
    // Defect 6: TABLE_MISMATCH — results table content differs (XYZ-8 vs XYZ-9).
    expect(
      findings.filter((finding) => finding.category === "TABLE_MISMATCH").length,
    ).toBeGreaterThan(0);

    // Structural GWT layout tables must NOT produce field-level noise.
    expect(labels).not.toContain("FIELD_MISSING|KPY68 — Parametre Tanımları");

    // Evidence: per-app baseline + after-plan screenshots.
    const names = reporter.artifacts.map((artifact) => artifact.name).join(",");
    expect(names).toContain("comparison-gwt-baseline.png");
    expect(names).toContain("comparison-react-baseline.png");
    expect(names).toContain("comparison-gwt-after-plan.png");
    expect(names).toContain("comparison-react-after-plan.png");

    // Mapping reported with unmatched pairs flagged for review.
    const mapping = reporter.mappings.at(0) ?? [];
    expect(mapping.length).toBeGreaterThan(10);
    expect(
      mapping.filter((pair) => (pair as { reactRef: string | null }).reactRef === null).length,
    ).toBeGreaterThan(0);

    // Summary event with category breakdown.
    const summary = reporter.events
      .find((event) => event.message.startsWith("Comparison finished"));
    expect(summary?.message).toContain("behavioral difference(s) detected");
  }, 240_000);

  it("reports missing generated-PDF fields and Send-to-Sign/Publish workflow differences when opted in", async () => {
    const runner = new ComparisonRunner(browser, loadCredentialStore(config));
    const reporter = new RecordingReporter();

    const job = comparisonJob();
    job.legacyApp.allowedActions = [
      "safe-exploration",
      "document-pdf-testing",
      "document-workflow-testing",
    ];
    job.reactApp.allowedActions = [
      "safe-exploration",
      "document-pdf-testing",
      "document-workflow-testing",
    ];
    job.plan = {
      scenarioName: "Document workflow comparison",
      screen: "KPY68",
      steps: [{ action: "wait", value: "auto-explore" }],
    };

    await runner.run(job, reporter as unknown as ExecutionReporter);

    expect(reporter.statuses.at(-1)?.status).toBe("COMPLETED");
    const findings = reporter.findingBatches.at(0) ?? [];
    const titles = findings.map((finding) => finding.title).join("\n");
    const categories = findings.map((finding) => finding.category);

    // Fixture deliberately omits "Açıklama" and "Başlangıç Tarihi" in React PDF.
    expect(categories).toContain("PDF_FIELD_MISSING");
    expect(titles).toContain("Açıklama");
    expect(titles).toContain("Başlangıç Tarihi");

    // Fixture leaves React "İmzaya Gönder" in IMZA_SERVISI_EKSIK.
    expect(categories).toContain("WORKFLOW_MISMATCH");
    expect(titles).toContain("İmzaya Gönder");
  }, 240_000);

  it("auto-explores and compares GWT vs React screens embedded inside nested <iframe> shells", async () => {
    const runner = new ComparisonRunner(browser, loadCredentialStore(config));
    const reporter = new RecordingReporter();

    const baseJob = comparisonJob();
    const iframeJob: ComparisonJob = {
      ...baseJob,
      plan: {
        scenarioName: "Auto-explore iframe comparison",
        screen: "KPY68",
        steps: [{ action: "wait", value: "auto-explore" }],
      },
      legacyApp: {
        ...baseJob.legacyApp,
        baseUrl: `${pathToFileURL(join(fixturesDir, "gwt-iframe-shell.html")).toString()}#KPY68`,
      },
      reactApp: {
        ...baseJob.reactApp,
        baseUrl: `${pathToFileURL(join(fixturesDir, "react-iframe-shell.html")).toString()}#/kpy68`,
      },
    };

    await runner.run(iframeJob, reporter as unknown as ExecutionReporter);

    expect(reporter.statuses.at(-1)?.status).toBe("COMPLETED");
    const findings = reporter.findingBatches.at(0) ?? [];
    const labels = findings.map((f) => `${f.category}|${f.legacyLabel}`).join("\n");
    expect(labels).toContain("FIELD_MISSING|Açıklama");
    expect(labels).toContain("DEPENDENCY_MISMATCH|Parametre Değeri");
    expect(labels).toContain("VALUE_MISMATCH|Parametre Kodu");
  }, 240_000);
});
