import type { DiscoverJob } from "@ars/test-schemas";

import { adapterFor } from "./adapters/index.js";
import type { BrowserLifecycle } from "./browser/lifecycle.js";
import { performFormLogin } from "./browser/login.js";
import type { SessionManager } from "./browser/session-manager.js";
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
 * launch isolated context (with optional saved session or manual interactive
 * login window) -> navigate to screen URL/path -> wait ready (including nested
 * iframes) -> passive discovery -> safe interactive exploration ->
 * screenshot/trace/console evidence -> honest terminal status.
 */
export class DiscoverJobRunner {
  constructor(
    private readonly browser: BrowserLifecycle,
    private readonly credentials: CredentialStore,
    private readonly sessions?: SessionManager,
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
    const isManualInteractive = this.sessions?.isManualInteractive(environment) ?? false;

    let context = null;
    try {
      await reporter.status({ status: "RUNNING" });

      const savedSession = await this.sessions?.resolveStorageState(environment);
      const browser = isManualInteractive
        ? await this.browser.acquireVisible()
        : await this.browser.acquire();

      await reporter.event(
        "INFO",
        isManualInteractive
          ? "Görünür (interaktif) Chromium oturumu başlatılıyor (Manuel Login modu)."
          : savedSession
            ? `Chromium oturumu kayıtlı oturum ('${savedSession.profileKey}') ile başlatılıyor.`
            : "İzole Chromium oturumu başlatılıyor.",
      );

      context = await browser.newContext({
        viewport: { width: 1366, height: 900 },
        ...(savedSession ? { storageState: savedSession.storageState } : {}),
      });
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

      const page = await context.newPage();
      this.collectDiagnostics(context, page, diagnostics);

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
        await this.login(page, environment, reporter, timeoutMs);
      }

      const targetUrl = environment.baseUrl;
      if (!skipNavigation || page.url() === "about:blank") {
        await reporter.event("INFO", `Navigating to ${targetUrl}`);
        await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      } else {
        await reporter.event("INFO", `Mevcut açık ekran kullanılıyor: ${page.url()}`);
      }

      await adapter.waitForReady(page, timeoutMs);
      await reporter.event("STEP", "Application is ready.");

      const elements = await adapter.discoverElements(page);
      const iframeCount = elements.filter((el) => el.domPath?.startsWith("[iframe:")).length;
      await reporter.event(
        "STEP",
        `Discovered ${elements.length} elements on ${job.screenCode}${
          iframeCount > 0 ? ` (${iframeCount} inside nested iframe)` : ""
        }.`,
        {
          total: elements.length,
          iframeElements: iframeCount,
          byType: countByType(elements.map((element) => element.elementType)),
          hidden: elements.filter((element) => !element.visible).length,
          disabled: elements.filter((element) => !element.enabled).length,
        },
      );

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
        passedSteps: elements.length - hiddenCount + executedInteractions,
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

  private async login(
    page: import("playwright").Page,
    environment: DiscoverJob["legacyApp"],
    reporter: ExecutionReporter,
    timeoutMs: number,
  ): Promise<void> {
    await performFormLogin(
      page,
      environment,
      this.credentials.get(environment.credentialReference ?? ""),
      (message) => reporter.event("INFO", message),
      timeoutMs,
    );
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
