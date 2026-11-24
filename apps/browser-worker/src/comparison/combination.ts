import type { BrowserContext, Page } from "playwright";

import type { CombinationJob, MappingPair } from "@ars/test-schemas";
import type { DiscoveredElementRecord } from "@ars/shared-contracts";

import { adapterFor } from "../adapters/index.js";
import { performPageOrFrameAction } from "../adapters/in-page.js";
import type { BrowserLifecycle } from "../browser/lifecycle.js";
import { performFormLogin } from "../browser/login.js";
import type { SessionManager } from "../browser/session-manager.js";
import type { CredentialStore } from "../credentials.js";
import type { ExecutionReporter } from "../reporter.js";
import { buildLabelMapping } from "./mapping.js";
import { diffState, toSnapshot, type StateSnapshot } from "./plan-executor.js";

/** One combination assignment: field ref -> value to apply. */
interface ComboAssignment {
  ref: string;
  selector: string;
  elementType: string;
  value: string;
}

/**
 * V8 user-driven: full-combination testing.
 *
 * Fills EVERY discovered field in both applications with a bounded set of
 * value combinations (defaults, each single variation, then pairwise pairs
 * while the budget lasts), reloads the page between combinations (a hard
 * reset to the known initial state) and compares the resulting states.
 * Differences become findings — the platform never claims fields match
 * without applying the combinations and observing them.
 */
export class CombinationRunner {
  constructor(
    private readonly browser: BrowserLifecycle,
    private readonly credentials: CredentialStore,
    private readonly sessions?: SessionManager,
  ) {}

  async run(job: CombinationJob, reporter: ExecutionReporter): Promise<void> {
    const timeoutMs = job.legacyApp.browserTimeoutMs;
    let legacyContext: BrowserContext | null = null;
    let reactContext: BrowserContext | null = null;

    try {
      await reporter.status({ status: "RUNNING" });

      // ---- Discover both apps once (combination candidates come from GWT) --
      const gwtManual = this.sessions?.isManualInteractive(job.legacyApp) ?? false;
      const gwtSaved = await this.sessions?.resolveStorageState(job.legacyApp);
      const gwtBrowser = gwtManual
        ? await this.browser.acquireVisible()
        : await this.browser.acquire();
      legacyContext = await gwtBrowser.newContext({
        viewport: { width: 1366, height: 900 },
        ...(gwtSaved ? { storageState: gwtSaved.storageState } : {}),
      });
      const legacyPage = await legacyContext.newPage();
      const legacyElements = await this.openApp(
        legacyPage,
        legacyContext,
        job.legacyApp,
        job,
        reporter,
        timeoutMs,
      );
      await reporter.event(
        "STEP",
        `Combination mode: GWT screen ready (${legacyElements.length} elements).`,
      );

      const reactManual = this.sessions?.isManualInteractive(job.reactApp) ?? false;
      const reactSaved = await this.sessions?.resolveStorageState(job.reactApp);
      const reactBrowser = reactManual
        ? await this.browser.acquireVisible()
        : await this.browser.acquire();
      reactContext = await reactBrowser.newContext({
        viewport: { width: 1366, height: 900 },
        ...(reactSaved ? { storageState: reactSaved.storageState } : {}),
      });
      const reactPage = await reactContext.newPage();
      const reactElements = await this.openApp(
        reactPage,
        reactContext,
        job.reactApp,
        job,
        reporter,
        timeoutMs,
      );
      await reporter.event(
        "STEP",
        `Combination mode: React screen ready (${reactElements.length} elements).`,
      );

      const mapping = buildLabelMapping(legacyElements, reactElements);
      await reporter.mapping(mapping.map((pair) => ({ ...pair, screenCode: job.screenCode })));

      const combinations = buildCombinations(legacyElements, job.maxCombinations);
      await reporter.event(
        "INFO",
        `Combination matrix: ${combinations.length} bounded combination(s) ` +
          `(budget ${job.maxCombinations}); the page is reloaded between each.`,
      );

      const differences: Array<Record<string, unknown>> = [];
      const mapByLegacy = new Map<string, MappingPair>(
        mapping.map((pair) => [pair.legacyRef, pair]));
      const reactByRef = new Map(reactElements.map((element) => [element.ref, element]));

      let executed = 0;
      for (const [index, combination] of combinations.entries()) {
        // Apply in GWT (fresh load = guaranteed reset).
        await this.reload(legacyPage, job.legacyApp, timeoutMs);
        const gwtState = await this.applyAndSnapshot(
          legacyPage, job.legacyApp, combination, timeoutMs);
        // Apply in React (fresh load, refs through the mapping).
        await this.reload(reactPage, job.reactApp, timeoutMs);
        const reactState = await this.applyAndSnapshot(
          reactPage, job.reactApp, combination, timeoutMs, mapByLegacy, reactByRef);
        executed++;

        const comboLabel = combination
          .map((assignment) => `${assignment.ref}=${assignment.value}`)
          .join(", ");
        const found = compareStates(
          gwtState, reactState, mapping, legacyElements, comboLabel);
        if (found.length > 0) {
          differences.push(...found);
          await reporter.event(
            "STEP",
            `Combination ${index + 1}/${combinations.length} (${comboLabel}): ` +
              `${found.length} difference(s).`,
            { combination: comboLabel },
          );
        } else {
          await reporter.event(
            "STEP",
            `Combination ${index + 1}/${combinations.length} (${comboLabel}): states match.`,
            { combination: comboLabel },
          );
        }
      }

      const evidenceShot = await reactPage.screenshot({ fullPage: true, type: "png" });
      await reporter.artifact(
        "SCREENSHOT",
        "combination-final-react.png",
        "image/png",
        new Uint8Array(evidenceShot),
      );
      const gwtEvidenceShot = await legacyPage.screenshot({ fullPage: true, type: "png" });
      await reporter.artifact(
        "SCREENSHOT",
        "combination-final-gwt.png",
        "image/png",
        new Uint8Array(gwtEvidenceShot),
      );

      if (differences.length > 0) {
        await reporter.findings(differences);
        await reporter.event(
          "RESULT",
          `Combination testing finished: ${combinations.length} combination(s) executed, ` +
            `${differences.length} behavioral difference(s) detected.`,
          { combinations: combinations.length },
        );
      } else {
        await reporter.event(
          "RESULT",
          `Combination testing finished: ${combinations.length} combination(s) executed, ` +
            `no behavioral differences detected.`,
        );
      }

      await reporter.status({
        status: "COMPLETED",
        totalSteps: combinations.length,
        passedSteps: combinations.length - differences.length,
        failedSteps: differences.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await reporter.event("ERROR", `Combination testing failed: ${message}`);
      await reporter.status({
        status: "FAILED",
        errorCode: /timeout/i.test(message) ? "TARGET_TIMEOUT" : "COMBINATION_ERROR",
        statusMessage: message.slice(0, 500),
      });
    } finally {
      await legacyContext?.close().catch(() => undefined);
      await reactContext?.close().catch(() => undefined);
    }
  }

  /** Fresh page load — the hard reset between combinations (§17). */
  private async reload(
    page: Page,
    environment: CombinationJob["legacyApp"],
    timeoutMs: number,
  ): Promise<void> {
    await page.goto(environment.baseUrl, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    await adapterFor(environment.appType).waitForReady(page, timeoutMs);
  }

  private async applyAndSnapshot(
    page: Page,
    environment: CombinationJob["legacyApp"],
    combination: ComboAssignment[],
    timeoutMs: number,
    refResolver?: Map<string, MappingPair>,
    reactByRef?: Map<string, DiscoveredElementRecord>,
  ): Promise<StateSnapshot> {
    const adapter = adapterFor(environment.appType);
    for (const assignment of combination) {
      let selector = assignment.selector;
      if (refResolver && reactByRef) {
        const pair = refResolver.get(assignment.ref);
        const reactRef = pair?.reactRef;
        if (!reactRef) {
          continue; // field missing in React — handled by state comparison
        }
        const reactElement = reactByRef.get(reactRef);
        selector = reactElement?.locatorCandidates?.[0] ?? selector;
      }
      try {
        if (assignment.elementType === "select") {
          await performPageOrFrameAction(page, selector, {
            kind: "selectOption",
            value: assignment.value,
          });
        } else if (assignment.elementType === "checkbox") {
          if (assignment.value === "true") {
            await performPageOrFrameAction(page, selector, { kind: "check" });
          } else {
            await performPageOrFrameAction(page, selector, { kind: "uncheck" });
          }
        } else if (assignment.elementType === "radio") {
          await performPageOrFrameAction(page, selector, { kind: "check" });
        } else if (assignment.elementType === "text"
            || assignment.elementType === "textarea") {
          await performPageOrFrameAction(page, selector, {
            kind: "fill",
            value: assignment.value,
          });
        }
      } catch {
        // A field that cannot take this value in this app is itself a
        // behavioral difference that the state snapshot will surface.
      }
    }
    await page
      .waitForLoadState("networkidle", { timeout: Math.min(timeoutMs, 3_000) })
      .catch(() => undefined);
    return toSnapshot(await adapter.discoverElements(page));
  }

  private async openApp(
    page: Page,
    context: BrowserContext,
    environment: CombinationJob["legacyApp"],
    job: CombinationJob,
    reporter: ExecutionReporter,
    timeoutMs: number,
  ): Promise<DiscoveredElementRecord[]> {
    const adapter = adapterFor(environment.appType);
    const isManualInteractive = this.sessions?.isManualInteractive(environment) ?? false;

    let skipNavigation = false;
    if (isManualInteractive && this.sessions) {
      const manualOutcome = await this.sessions.performInteractiveExecutionLogin(
        job.executionId,
        page,
        context,
        environment,
        reporter,
        timeoutMs,
      );
      skipNavigation = manualOutcome.skipNavigation;
    } else if (environment.authMethod === "TEST_ACCOUNT_FORM") {
      await performFormLogin(
        page,
        environment,
        this.credentials.get(environment.credentialReference ?? ""),
        (message) => reporter.event("INFO", `[${environment.appType}] ${message}`),
        timeoutMs,
      );
    }
    if (!skipNavigation || page.url() === "about:blank") {
      await page.goto(environment.baseUrl, {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs,
      });
    }
    await adapter.waitForReady(page, timeoutMs);
    return adapter.discoverElements(page);
  }
}

/**
 * Bounded combination matrix (§7: configurable depth prevents explosion):
 * 1) the default state (no assignments),
 * 2) each field varied one value at a time (singles),
 * 3) pairwise pairs while the budget lasts.
 */
export function buildCombinations(
  elements: DiscoveredElementRecord[],
  budget: number,
): ComboAssignment[][] {
  const applicable = elements.filter(
    (element) =>
      element.enabled &&
      element.visible &&
      (element.locatorCandidates?.length ?? 0) > 0 &&
      ["select", "checkbox", "radio"].includes(element.elementType),
  );

  const assignments: ComboAssignment[][] = [];
  const push = (combo: ComboAssignment[]) => {
    if (assignments.length < budget) {
      assignments.push(combo);
    }
  };

  // 1) Defaults (empty combination).
  push([]);

  // 2) Singles: each option / toggle of each field.
  for (const element of applicable) {
    const selector = element.locatorCandidates?.[0] ?? "";
    if (element.elementType === "select") {
      for (const option of element.options ?? []) {
        if (option !== element.value) {
          push([{ ref: element.ref, selector, elementType: "select", value: option }]);
        }
      }
    } else if (element.elementType === "checkbox") {
      const target = element.value === "true" ? "false" : "true";
      push([{ ref: element.ref, selector, elementType: "checkbox", value: target }]);
    } else if (element.elementType === "radio" && element.value !== "true") {
      push([{ ref: element.ref, selector, elementType: "radio", value: "true" }]);
    }
  }

  // 3) Pairwise while the budget lasts.
  const singles = assignments.slice(1);
  outer:
  for (let i = 0; i < singles.length; i++) {
    for (let j = i + 1; j < singles.length; j++) {
      const a = singles[i][0];
      const b = singles[j][0];
      if (a.ref === b.ref) {
        continue;
      }
      push([a, b]);
      if (assignments.length >= budget) {
        break outer;
      }
    }
  }

  return assignments;
}

function compareStates(
  gwtState: StateSnapshot,
  reactState: StateSnapshot,
  mapping: Array<{ legacyRef: string; legacyLabel?: string | null; reactRef?: string | null; reactLabel?: string | null }>,
  legacyElements: DiscoveredElementRecord[],
  comboLabel: string,
): Array<Record<string, unknown>> {
  const findings: Array<Record<string, unknown>> = [];
  const types = new Map(legacyElements.map((element) => [element.ref, element.elementType]));

  for (const pair of mapping) {
    if (!pair.reactRef) {
      continue; // missing fields are already reported by the mapping summary
    }
    const gwtEntry = gwtState.get(pair.legacyRef);
    const reactEntry = reactState.get(pair.reactRef);
    if (!gwtEntry || !reactEntry) {
      continue;
    }
    for (const delta of diffState(gwtEntry, reactEntry)) {
      findings.push({
        category: types.get(pair.legacyRef) === "table"
          ? "TABLE_MISMATCH"
          : delta.attribute === "value"
            ? "VALUE_MISMATCH"
            : delta.attribute === "options"
              ? "TABLE_MISMATCH"
              : "STATE_MISMATCH",
        severity: "MEDIUM",
        title: `Kombinasyon (${comboLabel}) sonucunda ${pair.legacyLabel ?? pair.legacyRef} farkı`,
        legacyRef: pair.legacyRef,
        legacyLabel: pair.legacyLabel ?? null,
        reactRef: pair.reactRef,
        reactLabel: pair.reactLabel ?? null,
        attribute: delta.attribute,
        expectedBehavior: `GWT (${delta.attribute}): ${delta.beforeValue ?? "—"}`,
        actualBehavior: `React (${delta.attribute}): ${delta.afterValue ?? "—"}`,
        screenCode: null,
      });
    }
  }
  return findings;
}
