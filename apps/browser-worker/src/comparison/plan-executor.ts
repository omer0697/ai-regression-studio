import type { Frame, Page } from "playwright";

import type { DiscoveredElementRecord } from "@ars/shared-contracts";

import { performPageOrFrameAction } from "../adapters/in-page.js";
import type { AppAdapter } from "../adapters/types.js";

/** A state snapshot entry used for behavioral comparison. */
export interface StateEntry {
  enabled: boolean;
  visible: boolean;
  value: string | null;
  options: string[] | null;
}

export type StateSnapshot = Map<string, StateEntry>;

export function toSnapshot(records: DiscoveredElementRecord[]): StateSnapshot {
  const snapshot: StateSnapshot = new Map();
  for (const record of records) {
    snapshot.set(record.ref, {
      enabled: record.enabled,
      visible: record.visible,
      value: record.value,
      options: record.options,
    });
  }
  return snapshot;
}

export interface PlanStep {
  action: string;
  target?: string;
  value?: string;
}

export interface AssertionFailure {
  stepAction: string;
  targetRef: string;
  expected: string;
  actual: string;
}

export interface DocumentWorkflowSnapshot {
  pdfAvailable: boolean;
  pdfFields: Record<string, string>;
  pdfRawText: string | null;
  signWorkflowStatus: string | null;
  publishWorkflowStatus: string | null;
}

/**
 * Executes a validated plan against one application using that app's element
 * records (refs resolved through the mapping on the React side), evaluates
 * any `assert*` steps against real DOM state, and captures generated PDF
 * fields + "İmzaya Gönder" / "Yayınla" workflow outcomes.
 */
export class PlanExecutor {
  public readonly assertionFailures: AssertionFailure[] = [];

  constructor(
    private readonly page: Page,
    private readonly adapter: AppAdapter,
    private readonly timeoutMs: number,
  ) {}

  async execute(
    steps: PlanStep[],
    elements: DiscoveredElementRecord[],
    refResolver: (legacyRef: string) => string,
    onStep: (message: string) => Promise<void>,
  ): Promise<StateSnapshot> {
    for (const step of steps) {
      if (step.action === "navigate" || step.action === "wait") {
        await onStep(`step ${step.action}`);
        continue;
      }
      if (step.action === "downloadPdf") {
        await this.triggerPdfGeneration();
        await onStep("triggered PDF generation (downloadPdf)");
        continue;
      }

      const target = step.target;
      if (!target) {
        continue;
      }
      const appRef = refResolver(target);

      if (step.action.startsWith("assert")) {
        const currentSnapshot = toSnapshot(await this.adapter.discoverElements(this.page));
        const currentState = currentSnapshot.get(appRef);
        this.evaluateAssertion(step, target, currentState);
        await onStep(`assert ${step.action} on ${target}`);
        continue;
      }

      const element = elements.find((candidate) => candidate.ref === appRef);
      const selector = element?.locatorCandidates?.[0];
      if (!element || !selector) {
        await onStep(`skip: target ${target} not found in this app`);
        continue;
      }
      switch (step.action) {
        case "click":
        case "openModal":
        case "closeModal":
          await performPageOrFrameAction(this.page, selector, { kind: "click" });
          break;
        case "fill":
          await performPageOrFrameAction(this.page, selector, {
            kind: "fill",
            value: step.value ?? "",
          });
          break;
        case "selectOption":
          await performPageOrFrameAction(this.page, selector, {
            kind: "selectOption",
            value: step.value ?? "",
          });
          break;
        case "setCheckbox":
          if (step.value === "false") {
            await performPageOrFrameAction(this.page, selector, { kind: "uncheck" });
          } else {
            await performPageOrFrameAction(this.page, selector, { kind: "check" });
          }
          break;
        case "chooseRadio":
          await performPageOrFrameAction(this.page, selector, { kind: "check" });
          break;
        default:
          break;
      }
      await this.page
        .waitForLoadState("networkidle", { timeout: Math.min(this.timeoutMs, 3_000) })
        .catch(() => undefined);
      await onStep(`applied ${step.action} on ${target}`);
    }
    return toSnapshot(await this.adapter.discoverElements(this.page));
  }

  /**
   * Triggers PDF generation + "İmzaya Gönder" + "Yayınla" workflow controls
   * (in main frame or nested iframes) and extracts the generated PDF field map
   * and workflow status for form-to-PDF and workflow verification.
   */
  async inspectDocumentAndWorkflows(): Promise<DocumentWorkflowSnapshot> {
    const script = `(() => {
      const btnPdf = document.getElementById("btnPdf") || document.querySelector("[data-ars-workflow='PDF']");
      if (btnPdf && typeof btnPdf.click === "function") {
        btnPdf.click();
      }
      const pdfBox = document.getElementById("pdfFieldsContainer") || document.querySelector("[data-pdf-json]");
      const pdfJsonRaw = pdfBox ? pdfBox.getAttribute("data-pdf-json") : null;
      let pdfFields = {};
      if (pdfJsonRaw) {
        try { pdfFields = JSON.parse(pdfJsonRaw); } catch (e) {}
      }
      const pdfRawText = pdfBox ? (pdfBox.textContent || "").trim() : null;

      let signStatus = null;
      const btnSign = document.getElementById("btnSendToSign") || document.querySelector("[data-ars-workflow='SEND_TO_SIGN']");
      const statusBox = document.getElementById("workflowStatusText") || document.querySelector("[data-ars-workflow-status]");
      if (btnSign && typeof btnSign.click === "function") {
        btnSign.click();
        signStatus = statusBox ? (statusBox.getAttribute("data-ars-workflow-status") || statusBox.textContent) : "CLICKED";
      }

      let publishStatus = null;
      const btnPublish = document.getElementById("btnPublish") || document.querySelector("[data-ars-workflow='PUBLISH']");
      if (btnPublish && typeof btnPublish.click === "function") {
        btnPublish.click();
        publishStatus = statusBox ? (statusBox.getAttribute("data-ars-workflow-status") || statusBox.textContent) : "CLICKED";
      }

      return {
        pdfAvailable: Boolean(pdfBox || btnPdf),
        pdfFields,
        pdfRawText,
        signWorkflowStatus: signStatus,
        publishWorkflowStatus: publishStatus
      };
    })()`;

    const candidates: Array<Page | Frame> = [this.page];
    if (typeof this.page.frames === "function") {
      const main = typeof this.page.mainFrame === "function" ? this.page.mainFrame() : null;
      for (const frame of this.page.frames()) {
        if (frame !== main) candidates.push(frame);
      }
    }

    for (const target of candidates) {
      try {
        const result = (await target.evaluate(script)) as DocumentWorkflowSnapshot;
        if (result && (result.pdfAvailable || result.signWorkflowStatus || result.publishWorkflowStatus)) {
          return result;
        }
      } catch {
        // continue checking other frames
      }
    }

    return {
      pdfAvailable: false,
      pdfFields: {},
      pdfRawText: null,
      signWorkflowStatus: null,
      publishWorkflowStatus: null,
    };
  }

  private async triggerPdfGeneration(): Promise<void> {
    await this.inspectDocumentAndWorkflows().catch(() => undefined);
  }

  private evaluateAssertion(
    step: PlanStep,
    legacyTarget: string,
    state: StateEntry | undefined,
  ): void {
    if (!state) {
      this.assertionFailures.push({
        stepAction: step.action,
        targetRef: legacyTarget,
        expected: `${step.action} (${step.value ?? "true"})`,
        actual: "Alan ekranda bulunamadı",
      });
      return;
    }
    switch (step.action) {
      case "assertVisible":
        if (!state.visible) {
          this.assertionFailures.push({
            stepAction: step.action,
            targetRef: legacyTarget,
            expected: "visible = true",
            actual: "visible = false",
          });
        }
        break;
      case "assertHidden":
        if (state.visible) {
          this.assertionFailures.push({
            stepAction: step.action,
            targetRef: legacyTarget,
            expected: "visible = false",
            actual: "visible = true",
          });
        }
        break;
      case "assertEnabled":
        if (!state.enabled) {
          this.assertionFailures.push({
            stepAction: step.action,
            targetRef: legacyTarget,
            expected: "enabled = true",
            actual: "enabled = false",
          });
        }
        break;
      case "assertDisabled":
        if (state.enabled) {
          this.assertionFailures.push({
            stepAction: step.action,
            targetRef: legacyTarget,
            expected: "enabled = false",
            actual: "enabled = true",
          });
        }
        break;
      case "assertValue":
      case "assertText":
        if (step.value !== undefined && (state.value ?? "") !== step.value) {
          this.assertionFailures.push({
            stepAction: step.action,
            targetRef: legacyTarget,
            expected: step.value,
            actual: state.value ?? "—",
          });
        }
        break;
      default:
        break;
    }
  }
}

/** Compares two state snapshots for one mapped pair. */
export function diffState(
  before: StateEntry,
  after: StateEntry,
): Array<{
  attribute: "enabled" | "visible" | "value" | "options";
  beforeValue: string | null;
  afterValue: string | null;
}> {
  const deltas: Array<{
    attribute: "enabled" | "visible" | "value" | "options";
    beforeValue: string | null;
    afterValue: string | null;
  }> = [];
  if (before.enabled !== after.enabled) {
    deltas.push({
      attribute: "enabled",
      beforeValue: String(before.enabled),
      afterValue: String(after.enabled),
    });
  }
  if (before.visible !== after.visible) {
    deltas.push({
      attribute: "visible",
      beforeValue: String(before.visible),
      afterValue: String(after.visible),
    });
  }
  if ((before.value ?? "") !== (after.value ?? "")) {
    deltas.push({
      attribute: "value",
      beforeValue: clip(before.value),
      afterValue: clip(after.value),
    });
  }
  if ((before.options ?? []).join("|") !== (after.options ?? []).join("|")) {
    deltas.push({
      attribute: "options",
      beforeValue: clip((before.options ?? []).join(", ")),
      afterValue: clip((after.options ?? []).join(", ")),
    });
  }
  return deltas;
}

function clip(value: string | null): string | null {
  if (value === null) return null;
  return value.length > 200 ? value.slice(0, 197) + "..." : value;
}
