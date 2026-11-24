import type { BrowserContext, Page } from "playwright";

import type { ComparisonJob, MappingPair } from "@ars/test-schemas";
import type { DiscoveredElementRecord } from "@ars/shared-contracts";

import { adapterFor } from "../adapters/index.js";
import type { BrowserLifecycle } from "../browser/lifecycle.js";
import { performFormLogin } from "../browser/login.js";
import type { SessionManager } from "../browser/session-manager.js";
import type { CredentialStore } from "../credentials.js";
import type { ExecutionReporter } from "../reporter.js";
import { buildLabelMapping } from "./mapping.js";
import {
  PlanExecutor,
  diffState,
  toSnapshot,
  type PlanStep,
  type StateEntry,
} from "./plan-executor.js";

export interface ComparisonFinding {
  category:
    | "FIELD_MISSING"
    | "STATE_MISMATCH"
    | "VALUE_MISMATCH"
    | "DEPENDENCY_MISMATCH"
    | "TABLE_MISMATCH"
    | "PDF_FIELD_MISSING"
    | "WORKFLOW_MISMATCH"
    | "ASSERTION_MISMATCH";
  severity: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  legacyRef: string;
  legacyLabel: string | null;
  reactRef: string | null;
  reactLabel: string | null;
  attribute: "enabled" | "visible" | "value" | "options" | null;
  expectedBehavior: string;
  actualBehavior: string;
}

/**
 * Phase 5 differential engine: run the same validated plan in the GWT and the
 * React application (separate isolated contexts, sequential execution), then
 * compare aligned behavior. Supports nested iframes, saved sessions, live
 * manual interactive login, and automatic interaction plan derivation.
 */
export class ComparisonRunner {
  constructor(
    private readonly browser: BrowserLifecycle,
    private readonly credentials: CredentialStore,
    private readonly sessions?: SessionManager,
  ) {}

  async run(job: ComparisonJob, reporter: ExecutionReporter): Promise<void> {
    const timeoutMs = job.legacyApp.browserTimeoutMs;
    let legacyContext: BrowserContext | null = null;
    let reactContext: BrowserContext | null = null;

    try {
      await reporter.status({ status: "RUNNING" });

      // ---- Legacy (GWT) session ------------------------------------------
      const gwtManual = this.sessions?.isManualInteractive(job.legacyApp) ?? false;
      const gwtSaved = await this.sessions?.resolveStorageState(job.legacyApp);
      const gwtBrowser = gwtManual
        ? await this.browser.acquireVisible()
        : await this.browser.acquire();

      await reporter.event(
        "INFO",
        gwtManual
          ? "Comparison: launching visible GWT session (Manual Login mode)."
          : gwtSaved
            ? `Comparison: launching GWT session with saved session '${gwtSaved.profileKey}'.`
            : "Comparison: launching the isolated GWT session.",
      );
      legacyContext = await gwtBrowser.newContext({
        viewport: { width: 1366, height: 900 },
        ...(gwtSaved ? { storageState: gwtSaved.storageState } : {}),
      });
      const legacyPage = await legacyContext.newPage();
      const legacyElements = await this.openApp(
        job.executionId,
        legacyPage,
        legacyContext,
        job.legacyApp,
        reporter,
        timeoutMs,
      );
      const legacyBaseline = toSnapshot(legacyElements);
      await reporter.event(
        "STEP",
        `GWT baseline captured (${legacyElements.length} elements).`,
      );
      const legacyScreenshot = await legacyPage.screenshot({ fullPage: true, type: "png" });
      await reporter.artifact(
        "SCREENSHOT",
        "comparison-gwt-baseline.png",
        "image/png",
        new Uint8Array(legacyScreenshot),
      );

      // ---- React session -------------------------------------------------
      const reactManual = this.sessions?.isManualInteractive(job.reactApp) ?? false;
      const reactSaved = await this.sessions?.resolveStorageState(job.reactApp);
      const reactBrowser = reactManual
        ? await this.browser.acquireVisible()
        : await this.browser.acquire();

      await reporter.event(
        "INFO",
        reactManual
          ? "Comparison: launching visible React session (Manual Login mode)."
          : reactSaved
            ? `Comparison: launching React session with saved session '${reactSaved.profileKey}'.`
            : "Comparison: launching the isolated React session.",
      );
      reactContext = await reactBrowser.newContext({
        viewport: { width: 1366, height: 900 },
        ...(reactSaved ? { storageState: reactSaved.storageState } : {}),
      });
      const reactPage = await reactContext.newPage();
      const reactElements = await this.openApp(
        job.executionId,
        reactPage,
        reactContext,
        job.reactApp,
        reporter,
        timeoutMs,
      );
      const reactBaseline = toSnapshot(reactElements);
      await reporter.event(
        "STEP",
        `React baseline captured (${reactElements.length} elements).`,
      );
      const reactScreenshot = await reactPage.screenshot({ fullPage: true, type: "png" });
      await reporter.artifact(
        "SCREENSHOT",
        "comparison-react-baseline.png",
        "image/png",
        new Uint8Array(reactScreenshot),
      );

      // Persist discovered elements from both apps so the report & UI table show them
      if (typeof reporter.elements === "function") {
        await reporter.elements([
          ...legacyElements.map((el) => ({ ...el, appType: job.legacyApp.appType })),
          ...reactElements.map((el) => ({
            ...el,
            ref: `react-${el.ref}`,
            appType: job.reactApp.appType,
          })),
        ]);
      }

      // ---- Mapping --------------------------------------------------------
      const mapping = job.mapping?.length
        ? job.mapping
        : buildLabelMapping(legacyElements, reactElements);
      const unmatched = mapping.filter((pair) => !pair.reactRef);
      await reporter.event(
        "STEP",
        `Element mapping: ${mapping.length} pairs (${unmatched.length} unmatched).`,
        {
          unmatched: unmatched.map((pair) => pair.legacyLabel),
          needsReview: mapping.filter((pair) => pair.needsReview).length,
        },
      );
      await reporter.mapping(
        mapping.map((pair) => ({ ...pair, screenCode: job.screenCode })),
      );

      const mapByLegacy = new Map(mapping.map((pair) => [pair.legacyRef, pair]));

      // ---- Execute the plan in both apps ----------------------------------
      const rawSteps =
        (job.plan as { steps?: Array<{ action: string; target?: string; value?: string }> })
          .steps ?? [];
      const isAutoExplore =
        rawSteps.length === 0 ||
        (rawSteps.length === 1 &&
          rawSteps[0].action === "wait" &&
          rawSteps[0].value === "auto-explore");

      const steps: PlanStep[] = isAutoExplore
        ? buildAutoComparisonSteps(
            legacyElements,
            job.legacyApp.explorationMaxInteractions ?? 12,
            job.legacyApp.explorationMaxOptions ?? 3,
          )
        : rawSteps;

      const documentChecksEnabled =
        job.legacyApp.allowedActions.includes("document-pdf-testing") ||
        steps.some((step) => step.action === "downloadPdf");
      const workflowChecksEnabled =
        job.legacyApp.allowedActions.includes("document-workflow-testing");

      // Safety gate: even an approved plan must not click "İmzaya Gönder" /
      // "Yayınla" unless the operator explicitly opted into workflow testing.
      const executionSteps = workflowChecksEnabled
        ? steps
        : steps.filter((step) => !isWorkflowTriggerStep(step, legacyElements));
      if (executionSteps.length !== steps.length) {
        await reporter.event(
          "INFO",
          `Skipped ${steps.length - executionSteps.length} workflow trigger step(s): document-workflow-testing is not enabled.`,
        );
      }

      if (isAutoExplore) {
        await reporter.event(
          "INFO",
          `Auto-derived ${executionSteps.length} interactive step(s) from GWT controls for comparison.`,
        );
      }

      await reporter.event("INFO", "Executing the plan in the GWT application.");
      const legacyExecutor = new PlanExecutor(
        legacyPage,
        adapterFor(job.legacyApp.appType),
        timeoutMs,
      );
      const legacyAfter = await legacyExecutor.execute(
        executionSteps,
        legacyElements,
        (legacyRef) => legacyRef,
        (message) => reporter.event("STEP", `[GWT] ${message}`),
      );
      const legacyDoc = await legacyExecutor.inspectDocumentAndWorkflows({
        includePdf: documentChecksEnabled,
        includeWorkflows: workflowChecksEnabled,
      });

      await reporter.event("INFO", "Executing the same plan in the React application.");
      const reactExecutor = new PlanExecutor(
        reactPage,
        adapterFor(job.reactApp.appType),
        timeoutMs,
      );
      const reactAfter = await reactExecutor.execute(
        executionSteps,
        reactElements,
        (legacyRef) => mapByLegacy.get(legacyRef)?.reactRef ?? legacyRef,
        (message) => reporter.event("STEP", `[React] ${message}`),
      );
      const reactDoc = await reactExecutor.inspectDocumentAndWorkflows({
        includePdf: documentChecksEnabled,
        includeWorkflows: workflowChecksEnabled,
      });

      const legacyFinalScreenshot = await legacyPage.screenshot({ fullPage: true, type: "png" });
      await reporter.artifact(
        "SCREENSHOT",
        "comparison-gwt-after-plan.png",
        "image/png",
        new Uint8Array(legacyFinalScreenshot),
      );
      const reactFinalScreenshot = await reactPage.screenshot({ fullPage: true, type: "png" });
      await reporter.artifact(
        "SCREENSHOT",
        "comparison-react-after-plan.png",
        "image/png",
        new Uint8Array(reactFinalScreenshot),
      );

      // ---- Differential findings -------------------------------------------
      const findings: ComparisonFinding[] = [];

      for (const pair of mapping) {
        const legacyBefore = legacyBaseline.get(pair.legacyRef);
        const legacyAfterFinal = legacyAfter.get(pair.legacyRef);
        const legacyRecord = legacyElements.find(
          (element) => element.ref === pair.legacyRef,
        );

        if (
          legacyRecord?.elementType === "table" &&
          (legacyRecord.options?.length ?? 0) === 0
        ) {
          continue;
        }

        if (!pair.reactRef) {
          if (legacyBefore?.visible || legacyAfterFinal?.visible) {
            findings.push(
              finding(
                "FIELD_MISSING",
                legacyBefore?.enabled || legacyAfterFinal?.enabled ? "HIGH" : "MEDIUM",
                `React tarafında eksik alan: ${pair.legacyLabel ?? pair.legacyRef}`,
                pair,
                null,
                `GWT ekranında '${pair.legacyLabel ?? pair.legacyRef}' alanı mevcut${
                  legacyAfterFinal?.visible && !legacyBefore?.visible
                    ? " (plan uygulandığında görünür oluyor)"
                    : ""
                }.`,
                "React ekranında bu alan bulunamadı (etiket bazlı eşleme yapılamadı).",
              ),
            );
          }
          continue;
        }

        const reactBefore = reactBaseline.get(pair.reactRef);
        const reactAfterFinal = reactAfter.get(pair.reactRef);
        if (!legacyBefore || !legacyAfterFinal || !reactBefore || !reactAfterFinal) {
          continue;
        }

        // Baseline behavioral differences (before any interaction).
        for (const delta of diffState(legacyBefore, reactBefore)) {
          const category: ComparisonFinding["category"] =
            legacyRecord?.elementType === "table"
              ? "TABLE_MISMATCH"
              : delta.attribute === "value"
                ? "VALUE_MISMATCH"
                : delta.attribute === "options"
                  ? "TABLE_MISMATCH"
                  : "STATE_MISMATCH";
          findings.push(
            finding(
              category,
              delta.attribute === "value" && pair.legacyLabel === "Parametre Kodu"
                ? "HIGH"
                : "MEDIUM",
              attributeTitle(delta.attribute, pair),
              pair,
              delta.attribute,
              `GWT: ${delta.beforeValue ?? "—"}`,
              `React: ${delta.afterValue ?? "—"}`,
            ),
          );
        }

        // Dependency behavior: the same interaction must change the same field.
        const legacyDelta = diffState(legacyBefore, legacyAfterFinal);
        const reactDelta = diffState(reactBefore, reactAfterFinal);
        for (const legacyChange of legacyDelta) {
          const reactChange = reactDelta.find(
            (candidate) => candidate.attribute === legacyChange.attribute,
          );
          if (!reactChange) {
            findings.push(
              finding(
                "DEPENDENCY_MISMATCH",
                "HIGH",
                `Bağımlılık davranışı farkı: ${pair.legacyLabel ?? pair.legacyRef}`,
                pair,
                legacyChange.attribute,
                `GWT: plan uygulandığında ${legacyChange.attribute} → ${
                  legacyChange.afterValue ?? "—"
                }.`,
                `React: plan uygulandığında alan değişmedi (${
                  String(reactBefore[keyOf(legacyChange.attribute)] ?? "—")
                }).`,
              ),
            );
          }
        }
      }

      // ---- Real assert* step verification (both applications) --------------
      for (const failure of legacyExecutor.assertionFailures) {
        findings.push({
          category: "ASSERTION_MISMATCH",
          severity: "HIGH",
          title: `GWT test adımı doğrulaması başarısız: ${failure.stepAction} / ${failure.targetRef}`,
          legacyRef: failure.targetRef,
          legacyLabel: null,
          reactRef: mapByLegacy.get(failure.targetRef)?.reactRef ?? null,
          reactLabel: mapByLegacy.get(failure.targetRef)?.reactLabel ?? null,
          attribute: "value",
          expectedBehavior: `Test adımı bekleniyordu: ${failure.expected}`,
          actualBehavior: `GWT ekranında gerçekleşen: ${failure.actual}`,
        });
      }
      for (const failure of reactExecutor.assertionFailures) {
        const pair = mapping.find((candidate) => candidate.reactRef === failure.targetRef);
        findings.push({
          category: "ASSERTION_MISMATCH",
          severity: "HIGH",
          title: `React test adımı doğrulaması başarısız: ${failure.stepAction} / ${failure.targetRef}`,
          legacyRef: pair?.legacyRef ?? failure.targetRef,
          legacyLabel: pair?.legacyLabel ?? null,
          reactRef: failure.targetRef,
          reactLabel: pair?.reactLabel ?? null,
          attribute: "value",
          expectedBehavior: `Test adımı bekleniyordu: ${failure.expected}`,
          actualBehavior: `React ekranında gerçekleşen: ${failure.actual}`,
        });
      }

      // ---- Form-to-PDF Missing/Incorrect Field Verification (once) ---------
      if (documentChecksEnabled && legacyDoc.pdfAvailable && reactDoc.pdfAvailable) {
        const pdfFieldNames = new Set([
          ...Object.keys(legacyDoc.pdfFields),
          ...Object.keys(reactDoc.pdfFields),
        ]);
        for (const fieldName of pdfFieldNames) {
          const gwtPdfValue = legacyDoc.pdfFields[fieldName];
          const reactPdfValue = reactDoc.pdfFields[fieldName];
          const pair =
            mapping.find((candidate) => candidate.legacyLabel === fieldName) ?? {
              legacyRef: "pdf",
              legacyLabel: fieldName,
              reactRef: null,
              reactLabel: null,
              confidence: 1,
            };
          if (gwtPdfValue !== undefined && reactPdfValue === undefined) {
            findings.push(
              finding(
                "PDF_FIELD_MISSING",
                "HIGH",
                `Oluşturulan PDF çıktısında eksik alan: ${fieldName}`,
                pair,
                "value",
                `GWT PDF çıktısında '${fieldName}: ${gwtPdfValue || "—"}' alanı yer alıyor.`,
                `React PDF çıktısında '${fieldName}' alanı hiç oluşturulmadı (PDF şablonunda eksik).`,
              ),
            );
          } else if (
            gwtPdfValue !== undefined &&
            reactPdfValue !== undefined &&
            gwtPdfValue !== reactPdfValue
          ) {
            findings.push(
              finding(
                "VALUE_MISMATCH",
                "HIGH",
                `PDF çıktısında alan değeri farkı: ${fieldName}`,
                pair,
                "value",
                `GWT PDF: '${fieldName}: ${gwtPdfValue || "—"}'`,
                `React PDF: '${fieldName}: ${reactPdfValue || "—"}'`,
              ),
            );
          } else if (gwtPdfValue === undefined && reactPdfValue !== undefined) {
            findings.push(
              finding(
                "PDF_FIELD_MISSING",
                "MEDIUM",
                `React PDF çıktısında GWT'de olmayan ek alan: ${fieldName}`,
                pair,
                "value",
                "GWT PDF çıktısında bu alan bulunmuyor.",
                `React PDF çıktısında '${fieldName}: ${reactPdfValue || "—"}' alanı üretildi.`,
              ),
            );
          }
        }
      }

      // ---- Real generated PDFs: evidence + PDFBox field verification -------
      if (documentChecksEnabled) {
        if (legacyDoc.pdfBytes) {
          await reporter.artifact(
            "PDF",
            legacyDoc.pdfFileName ?? "gwt-generated.pdf",
            "application/pdf",
            legacyDoc.pdfBytes,
          );
        }
        if (reactDoc.pdfBytes) {
          await reporter.artifact(
            "PDF",
            reactDoc.pdfFileName ?? "react-generated.pdf",
            "application/pdf",
            reactDoc.pdfBytes,
          );
        }

        if (legacyDoc.pdfBytes && !reactDoc.pdfBytes) {
          findings.push(
            finding(
              "PDF_FIELD_MISSING",
              "HIGH",
              "React uygulaması PDF üretmedi",
              {
                legacyRef: "pdf",
                legacyLabel: "PDF Çıktısı",
                reactRef: null,
                reactLabel: null,
                confidence: 1,
              },
              "value",
              "GWT 'PDF' işlemi sonucunda indirilebilir bir PDF dosyası üretti.",
              "React 'PDF' işlemi dosya üretmedi (indirme veya gömülü PDF bulunamadı).",
            ),
          );
        } else if (!legacyDoc.pdfBytes && reactDoc.pdfBytes) {
          findings.push(
            finding(
              "PDF_FIELD_MISSING",
              "HIGH",
              "GWT uygulaması PDF üretmedi",
              {
                legacyRef: "pdf",
                legacyLabel: "PDF Çıktısı",
                reactRef: "pdf",
                reactLabel: "PDF Çıktısı",
                confidence: 1,
              },
              "value",
              "React 'PDF' işlemi indirilebilir bir PDF dosyası üretti.",
              "GWT 'PDF' işlemi dosya üretmedi (indirme veya gömülü PDF bulunamadı).",
            ),
          );
        } else if (legacyDoc.pdfBytes && reactDoc.pdfBytes) {
          const expectedFields = {
            ...reactDoc.formFields,
            ...legacyDoc.formFields,
          };
          if (Object.keys(expectedFields).length > 0) {
            await reporter.event(
              "STEP",
              `Generated PDFs captured; verifying ${Object.keys(expectedFields).length} filled field(s) with PDFBox.`,
            );
            const pdfResult = await reporter.pdfCheck({
              screenCode: job.screenCode,
              gwtFileName: legacyDoc.pdfFileName ?? "gwt-generated.pdf",
              gwtPdfBase64: Buffer.from(legacyDoc.pdfBytes).toString("base64"),
              reactFileName: reactDoc.pdfFileName ?? "react-generated.pdf",
              reactPdfBase64: Buffer.from(reactDoc.pdfBytes).toString("base64"),
              expectedFields,
            });
            for (const difference of pdfResult?.differences ?? []) {
              const isMissing =
                difference.kind === "MISSING_FIELD" ||
                difference.kind === "MISSING_IN_REFERENCE";
              const pair =
                mapping.find((candidate) => candidate.legacyLabel === difference.field) ?? {
                  legacyRef: "pdf",
                  legacyLabel: difference.field,
                  reactRef: null,
                  reactLabel: null,
                  confidence: 1,
                };
              findings.push(
                finding(
                  isMissing && difference.kind === "MISSING_FIELD"
                    ? "PDF_FIELD_MISSING"
                    : "VALUE_MISMATCH",
                  "HIGH",
                  isMissing
                    ? `PDF çıktısında eksik alan: ${difference.field}`
                    : `PDF çıktısında hatalı değer: ${difference.field}`,
                  pair,
                  "value",
                  `PDFBox beklentisi: '${difference.field}' alanı '${difference.expected ?? "—"}' değeriyle yer almalı.`,
                  difference.kind === "PAGE_COUNT"
                    ? `Sayfa sayısı farkı (GWT ${difference.expected}, React ${difference.actual}).`
                    : `PDF'te bulunan: '${difference.actual ?? "(yok)"}' (${difference.kind}${
                        difference.page ? `, sayfa ${difference.page}` : ""
                      }).`,
                ),
              );
            }
            if (pdfResult && pdfResult.differences.length === 0) {
              await reporter.event(
                "STEP",
                "PDFBox: both PDFs contain every filled form field with the same value.",
              );
            }
          } else {
            await reporter.event(
              "INFO",
              "Generated PDFs captured, but no filled form field was found to verify against the PDF content.",
            );
          }
        }
      }

      // ---- Send to Sign / Publish workflow comparison (explicit opt-in) ----
      if (workflowChecksEnabled) {
        const workflowComparisons = [
          {
            key: "sign",
            label: "İmzaya Gönder",
            expected: legacyDoc.signWorkflowStatus,
            actual: reactDoc.signWorkflowStatus,
          },
          {
            key: "publish",
            label: "Yayınla",
            expected: legacyDoc.publishWorkflowStatus,
            actual: reactDoc.publishWorkflowStatus,
          },
        ];
        for (const workflow of workflowComparisons) {
          if (workflow.expected && workflow.actual && workflow.expected !== workflow.actual) {
            findings.push({
              category: "WORKFLOW_MISMATCH",
              severity: "HIGH",
              title: `${workflow.label} iş akışı durumu farkı`,
              legacyRef: `workflow-${workflow.key}`,
              legacyLabel: `${workflow.label} Akışı`,
              reactRef: `workflow-${workflow.key}`,
              reactLabel: `${workflow.label} Akışı`,
              attribute: "value",
              expectedBehavior: `GWT ${workflow.label} durumu: ${workflow.expected}`,
              actualBehavior: `React ${workflow.label} durumu: ${workflow.actual}`,
            });
          }
        }
      }

      if (findings.length > 0) {
        await reporter.findings(findings.map((item) => ({ ...item })));
        await reporter.event(
          "RESULT",
          `Comparison finished: ${findings.length} behavioral difference(s) detected with evidence.`,
          {
            byCategory: countBy(findings, (finding) => finding.category),
            bySeverity: countBy(findings, (finding) => finding.severity),
          },
        );
      } else {
        await reporter.event(
          "RESULT",
          "Comparison finished: no behavioral differences detected across mapped fields.",
        );
      }

      await reporter.status({
        status: "COMPLETED",
        totalSteps: Math.max(steps.length, 1),
        passedSteps: Math.max(steps.length, 1),
        failedSteps: findings.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await reporter.event("ERROR", `Comparison failed: ${message}`);
      await reporter.status({
        status: "FAILED",
        errorCode: /timeout/i.test(message) ? "TARGET_TIMEOUT" : "COMPARISON_ERROR",
        statusMessage: message.slice(0, 500),
      });
    } finally {
      await legacyContext?.close().catch(() => undefined);
      await reactContext?.close().catch(() => undefined);
    }
  }

  private async openApp(
    executionId: number,
    page: Page,
    context: BrowserContext,
    environment: ComparisonJob["legacyApp"],
    reporter: ExecutionReporter,
    timeoutMs: number,
  ): Promise<DiscoveredElementRecord[]> {
    const adapter = adapterFor(environment.appType);
    const isManualInteractive = this.sessions?.isManualInteractive(environment) ?? false;

    let skipNavigation = false;
    if (isManualInteractive && this.sessions) {
      const manualOutcome = await this.sessions.performInteractiveExecutionLogin(
        executionId,
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
 * Automatically derives bounded safe interaction steps from GWT controls
 * when no prior discovery or human-approved scenario exists yet.
 */
function buildAutoComparisonSteps(
  elements: DiscoveredElementRecord[],
  maxInteractions: number,
  maxOptions: number,
): PlanStep[] {
  const steps: PlanStep[] = [];
  const explorable = elements.filter(
    (el) => el.enabled && el.visible && (el.locatorCandidates?.length ?? 0) > 0,
  );

  for (const select of explorable.filter((el) => el.elementType === "select")) {
    const options = (select.options ?? [])
      .filter((opt) => opt !== select.value)
      .slice(0, maxOptions);
    // Pick the last non-default option (e.g. DIGER) so its final state remains visible for comparison
    const targetOption = options[options.length - 1];
    if (targetOption) {
      steps.push({
        action: "selectOption",
        target: select.ref,
        value: targetOption,
      });
      if (steps.length >= maxInteractions) return steps;
    }
  }

  for (const checkbox of explorable.filter((el) => el.elementType === "checkbox")) {
    steps.push({
      action: "setCheckbox",
      target: checkbox.ref,
      value: checkbox.value === "true" ? "false" : "true",
    });
    if (steps.length >= maxInteractions) return steps;
  }

  for (const radio of explorable.filter(
    (el) => el.elementType === "radio" && el.value !== "true",
  )) {
    const radioValue =
      radio.locatorCandidates?.[0]?.match(/value="([^"]+)"/)?.[1] ?? "true";
    steps.push({
      action: "chooseRadio",
      target: radio.ref,
      value: radioValue,
    });
    if (steps.length >= maxInteractions) return steps;
  }

  return steps;
}

/**
 * True when a click step targets a "İmzaya Gönder" / "Yayınla" style control.
 * Used to keep mutating business workflows behind explicit opt-in.
 */
function isWorkflowTriggerStep(
  step: PlanStep,
  elements: DiscoveredElementRecord[],
): boolean {
  if (step.action !== "click" || !step.target) {
    return false;
  }
  const element = elements.find((candidate) => candidate.ref === step.target);
  const haystack = [
    element?.label ?? "",
    element?.accessibleName ?? "",
    element?.name ?? "",
    step.target,
  ]
    .join(" ")
    .toLocaleLowerCase("tr-TR");
  return /(imzaya gönder|yayınla|yayinla|send to sign|publish|\bsign\b)/.test(haystack);
}

function finding(
  category: ComparisonFinding["category"],
  severity: ComparisonFinding["severity"],
  title: string,
  pair: MappingPair,
  attribute: ComparisonFinding["attribute"],
  expectedBehavior: string,
  actualBehavior: string,
): ComparisonFinding {
  return {
    category,
    severity,
    title,
    legacyRef: pair.legacyRef,
    legacyLabel: pair.legacyLabel ?? null,
    reactRef: pair.reactRef ?? null,
    reactLabel: pair.reactLabel ?? null,
    attribute,
    expectedBehavior,
    actualBehavior,
  };
}

function attributeTitle(
  attribute: "enabled" | "visible" | "value" | "options",
  pair: MappingPair,
): string {
  const name =
    attribute === "enabled"
      ? "Etkinlik durumu"
      : attribute === "visible"
        ? "Görünürlük"
        : attribute === "value"
          ? "Değer"
          : "Seçenekler";
  return `${name} farkı: ${pair.legacyLabel ?? pair.legacyRef}`;
}

function keyOf(attribute: string): keyof StateEntry {
  switch (attribute) {
    case "enabled":
      return "enabled";
    case "visible":
      return "visible";
    case "options":
      return "options";
    default:
      return "value";
  }
}

function countBy<T>(items: T[], keyOf: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = keyOf(item);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}
