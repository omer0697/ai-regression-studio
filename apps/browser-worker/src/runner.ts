import type { DiscoverJob } from "@ars/test-schemas";

import { adapterFor } from "./adapters/index.js";
import type { BrowserLifecycle } from "./browser/lifecycle.js";
import type { CredentialStore } from "./credentials.js";
import { DependencyExplorer } from "./exploration/explorer.js";
import type { ExecutionReporter } from "./reporter.js";

/** Console diagnostics collected per session (bounded). */
interface SessionDiagnostics {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
}

/**
 * Runs a discover job end to end:
 * launch isolated context -> (optional) secure form login -> navigate ->
 * wait ready -> passive discovery -> screenshot/trace/console evidence ->
 * honest terminal status. No interactive business action is ever performed
 * during discovery.
 */
export class DiscoverJobRunner {
  constructor(
    private readonly browser: BrowserLifecycle,
    private readonly credentials: CredentialStore,
  ) {}

  async run(job: DiscoverJob, reporter: ExecutionReporter): Promise<void> {
    const environment = job.legacyApp;
    const adapter = adapterFor(environment.appType);
    const diagnostics: SessionDiagnostics = {
      consoleErrors: [],
      pageErrors: [],
      failedRequests: [],
    };
    const timeoutMs = environment.browserTimeoutMs;

    let context = null;
    try {
      await reporter.status({ status: "RUNNING" });
      await reporter.event("INFO", "Launching an isolated Chromium context.");

      const browser = await this.browser.acquire();
      context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

      const page = await context.newPage();
      this.collectDiagnostics(context, page, diagnostics);

      if (environment.authMethod === "TEST_ACCOUNT_FORM") {
        await this.login(page, environment, reporter, timeoutMs);
      }

      const targetUrl = environment.baseUrl;
      await reporter.event("INFO", `Navigating to ${targetUrl}`);
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });

      await adapter.waitForReady(page, timeoutMs);
      await reporter.event("STEP", "Application is ready.");

      const elements = await adapter.discoverElements(page);
      await reporter.event(
        "STEP",
        `Discovered ${elements.length} elements on ${job.screenCode}.`,
        {
          total: elements.length,
          byType: countByType(elements.map((element) => element.elementType)),
          hidden: elements.filter((element) => !element.visible).length,
          disabled: elements.filter((element) => !element.enabled).length,
        },
      );

      // Passive discovery only — prohibited business actions are never executed.
      await reporter.elements(
        elements.map((element) => ({ ...element, appType: environment.appType })),
      );

      await reporter.event("INFO", "Capturing evidence (screenshot).");
      const screenshot = await page.screenshot({ fullPage: true, type: "png" });
      await reporter.artifact(
        "SCREENSHOT",
        `discovery-${job.screenCode.toLowerCase()}.png`,
        "image/png",
        new Uint8Array(screenshot),
      );

      // ---- Phase 3: bounded safe interaction exploration -----------------
      let executedInteractions = 0;
      let failedInteractions = 0;
      let observationCount = 0;
      if ((environment.explorationMaxInteractions ?? 12) > 0) {
        const explorer = new DependencyExplorer(
          page,
          {
            maxInteractions: environment.explorationMaxInteractions ?? 12,
            maxOptions: environment.explorationMaxOptions ?? 3,
          },
          timeoutMs,
          reporter,
          () => adapter.discoverElements(page),
          elements,
        );
        const outcome = await explorer.run();
        executedInteractions = outcome.executed;
        failedInteractions = outcome.failed;
        observationCount = outcome.observations.length;

        if (observationCount > 0) {
          await reporter.observations(
            outcome.observations.map((observation) => ({
              ...observation,
              appType: environment.appType,
            })),
          );
          await reporter.event(
            "STEP",
            `Recorded ${observationCount} dependency observation(s) from ${executedInteractions} interaction(s); the screen was reverted after each step.`,
          );
        } else {
          await reporter.event(
            "INFO",
            "Exploration finished without observable dependency changes.",
          );
        }
      }

      const tracePath = `${process.env.TEMP ?? "/tmp"}/ars-trace-${job.executionId}.zip`;
      await context.tracing.stop({ path: tracePath });
      const traceBytes = await import("node:fs/promises").then((fs) => fs.readFile(tracePath));
      await reporter.artifact(
        "TRACE",
        `trace-${job.executionId}.zip`,
        "application/zip",
        new Uint8Array(traceBytes),
      );

      if (diagnostics.consoleErrors.length > 0 || diagnostics.pageErrors.length > 0) {
        const log =
          "Console errors:\n" +
          diagnostics.consoleErrors.join("\n") +
          "\nPage errors:\n" +
          diagnostics.pageErrors.join("\n");
        await reporter.artifact(
          "CONSOLE_LOG",
          `console-${job.executionId}.log`,
          "text/plain",
          new TextEncoder().encode(log),
        );
        await reporter.event(
          "WARNING",
          `Browser reported ${diagnostics.consoleErrors.length} console errors and ${diagnostics.pageErrors.length} page errors.`,
        );
      } else {
        await reporter.event("INFO", "No browser console errors observed.");
      }
      if (diagnostics.failedRequests.length > 0) {
        await reporter.event(
          "WARNING",
          `${diagnostics.failedRequests.length} network requests failed.`,
          { examples: diagnostics.failedRequests.slice(0, 10) },
        );
      }

      const hiddenCount = elements.filter((element) => !element.visible).length;
      await reporter.status({
        status: "COMPLETED",
        totalSteps: elements.length + executedInteractions + failedInteractions,
        passedSteps:
            elements.length - hiddenCount + executedInteractions,
        skippedSteps: hiddenCount,
        failedSteps: failedInteractions,
      });
      await reporter.event(
        "RESULT",
        `Discovery completed: ${elements.length} elements recorded, ${observationCount} dependency observation(s) from ${executedInteractions} safe interaction(s).`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isTimeout = /timeout/i.test(message);
      await reporter.event("ERROR", `Discovery failed: ${message}`);
      await reporter.status({
        status: "FAILED",
        errorCode: isTimeout ? "TARGET_TIMEOUT" : "DISCOVERY_ERROR",
        statusMessage: message.slice(0, 500),
      });
    } finally {
      if (context) {
        await context.close().catch(() => undefined);
      }
    }
  }

  /**
   * Secure test login: credentials come from the local store by reference and
   * are used only inside the isolated browser context — never logged.
   */
  private async login(
    page: import("playwright").Page,
    environment: DiscoverJob["legacyApp"],
    reporter: ExecutionReporter,
    timeoutMs: number,
  ): Promise<void> {
    const reference = environment.credentialReference ?? "";
    const credential = this.credentials.get(reference);
    if (!credential) {
      throw new Error(
        `Credential reference '${reference}' not found in the worker credential store.`,
      );
    }
    if (
      !environment.loginUrl ||
      !environment.usernameSelector ||
      !environment.passwordSelector ||
      !environment.submitSelector
    ) {
      throw new Error("TEST_ACCOUNT_FORM requires loginUrl and form selectors.");
    }

    await reporter.event("INFO", "Performing configured test-account form login.");
    await page.goto(environment.loginUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForSelector(environment.usernameSelector, { timeout: timeoutMs });
    const loginPageUrl = page.url();

    await page.fill(environment.usernameSelector, credential.username);
    await page.fill(environment.passwordSelector, credential.password);
    await page.click(environment.submitSelector);

    // State-based wait: success means we leave the login page.
    try {
      await page.waitForURL((url) => url.toString() !== loginPageUrl, { timeout: timeoutMs });
      await reporter.event("STEP", "Test-account login accepted by the application.");
    } catch {
      throw new Error("Login was rejected — the login form is still visible after submit.");
    }
  }

  private collectDiagnostics(
    context: import("playwright").BrowserContext,
    page: import("playwright").Page,
    diagnostics: SessionDiagnostics,
  ): void {
    page.on("console", (message) => {
      if (message.type() === "error" && diagnostics.consoleErrors.length < 100) {
        diagnostics.consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      if (diagnostics.pageErrors.length < 100) {
        diagnostics.pageErrors.push(error.message);
      }
    });
    context.on("requestfailed", (request) => {
      if (diagnostics.failedRequests.length < 100) {
        diagnostics.failedRequests.push(`${request.method()} ${request.url()}`);
      }
    });
  }
}

function countByType(types: string[]): Record<string, number> {
  return types.reduce<Record<string, number>>((acc, type) => {
    acc[type] = (acc[type] ?? 0) + 1;
    return acc;
  }, {});
}
