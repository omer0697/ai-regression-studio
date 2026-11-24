import type { Frame, Locator, Page } from "playwright";

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
  pdfBytes: Uint8Array | null;
  pdfFileName: string | null;
  formFields: Record<string, string>;
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
        // Generation happens once, after the plan, in inspectDocumentAndWorkflows().
        await onStep("marked PDF generation (downloadPdf)");
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

  private static readonly PDF_TRIGGER_SELECTORS = [
    "#btnPdf",
    "[data-ars-workflow='PDF']",
    "button[title*='PDF' i]",
    "a[href$='.pdf']",
  ];

  private static readonly SIGN_TRIGGER_SELECTORS = [
    "#btnSendToSign",
    "[data-ars-workflow='SEND_TO_SIGN']",
  ];

  private static readonly PUBLISH_TRIGGER_SELECTORS = [
    "#btnPublish",
    "[data-ars-workflow='PUBLISH']",
  ];

  /**
   * Triggers PDF generation + "İmzaya Gönder" + "Yayınla" workflow controls
   * (in main frame or nested iframes) and extracts the generated PDF bytes,
   * the filled form fields and the workflow status.
   *
   * <p>The PDF is captured through Playwright's download channel (not through
   * page JavaScript), so the real file produced by the application reaches
   * the API and can be parsed by PDFBox. A blob/embed fallback covers apps that
   * render the PDF inline instead of downloading it.</p>
   */
  async inspectDocumentAndWorkflows(options: {
    includePdf: boolean;
    includeWorkflows: boolean;
  }): Promise<DocumentWorkflowSnapshot> {
    const candidates = this.searchTargets();
    const formFields = await this.collectFormFields(candidates);

    let pdfBytes: Uint8Array | null = null;
    let pdfFileName: string | null = null;
    let clickedPdf = false;

    if (options.includePdf) {
      const trigger = await this.findTrigger(candidates, PlanExecutor.PDF_TRIGGER_SELECTORS);
      if (trigger) {
        const captured = await this.clickAndCapturePdf(trigger);
        clickedPdf = true;
        pdfBytes = captured.bytes;
        pdfFileName = captured.fileName;
      }
      if (!pdfBytes) {
        const inline = await this.captureInlinePdf(candidates);
        if (inline) {
          pdfBytes = inline.bytes;
          pdfFileName = inline.fileName;
        }
      }
    }

    let signWorkflowStatus: string | null = null;
    let publishWorkflowStatus: string | null = null;

    if (options.includeWorkflows) {
      const signTrigger = await this.findTrigger(
        candidates,
        PlanExecutor.SIGN_TRIGGER_SELECTORS,
      );
      if (signTrigger) {
        await signTrigger.click({ timeout: this.timeoutMs }).catch(() => undefined);
        await this.page.waitForTimeout(800);
        signWorkflowStatus = await this.readWorkflowStatus(candidates, "SEND_TO_SIGN");
      }
      const publishTrigger = await this.findTrigger(
        candidates,
        PlanExecutor.PUBLISH_TRIGGER_SELECTORS,
      );
      if (publishTrigger) {
        await publishTrigger.click({ timeout: this.timeoutMs }).catch(() => undefined);
        await this.page.waitForTimeout(800);
        publishWorkflowStatus = await this.readWorkflowStatus(candidates, "PUBLISH");
      }
    }

    const snapshotScript = `(() => {
      const pdfBox = document.getElementById("pdfFieldsContainer") || document.querySelector("[data-pdf-json]");
      const pdfJsonRaw = pdfBox ? pdfBox.getAttribute("data-pdf-json") : null;
      let pdfFields = {};
      if (pdfJsonRaw) {
        try { pdfFields = JSON.parse(pdfJsonRaw); } catch (e) {}
      }
      return {
        pdfFields,
        pdfRawText: pdfBox ? (pdfBox.textContent || "").trim() : null
      };
    })()`;

    let pdfFields: Record<string, string> = {};
    let pdfRawText: string | null = null;
    for (const target of candidates) {
      try {
        const result = (await target.evaluate(snapshotScript)) as {
          pdfFields?: Record<string, string>;
          pdfRawText?: string | null;
        };
        if (result?.pdfFields && Object.keys(result.pdfFields).length > 0) {
          pdfFields = result.pdfFields;
          pdfRawText = result.pdfRawText ?? null;
          break;
        }
        if (!pdfRawText && result?.pdfRawText) {
          pdfRawText = result.pdfRawText;
        }
      } catch {
        // continue checking other frames
      }
    }

    return {
      pdfAvailable: Boolean(pdfBytes || clickedPdf || pdfRawText),
      pdfFields,
      pdfRawText,
      pdfBytes,
      pdfFileName,
      formFields,
      signWorkflowStatus,
      publishWorkflowStatus,
    };
  }

  private searchTargets(): Array<Page | Frame> {
    const candidates: Array<Page | Frame> = [this.page];
    if (typeof this.page.frames === "function") {
      const main = typeof this.page.mainFrame === "function" ? this.page.mainFrame() : null;
      for (const frame of this.page.frames()) {
        if (frame !== main) candidates.push(frame);
      }
    }
    return candidates;
  }

  private async findTrigger(
    candidates: Array<Page | Frame>,
    selectors: string[],
  ): Promise<Locator | null> {
    for (const target of candidates) {
      for (const selector of selectors) {
        try {
          const locator = target.locator(selector).first();
          if ((await locator.count()) === 0) continue;
          if (!(await locator.isVisible().catch(() => false))) continue;
          if (await locator.isEnabled().catch(() => false)) {
            return locator;
          }
        } catch {
          // frame detached or cross-origin — keep looking
        }
      }
    }
    return null;
  }

  private async clickAndCapturePdf(
    trigger: Locator,
  ): Promise<{ bytes: Uint8Array | null; fileName: string | null }> {
    const waitMs = Math.min(this.timeoutMs, 12_000);
    const downloadPromise = this.page
      .waitForEvent("download", { timeout: waitMs })
      .catch(() => null);
    const popupPromise = this.page
      .waitForEvent("popup", { timeout: waitMs })
      .catch(() => null);

    await trigger.click({ timeout: this.timeoutMs }).catch(() => undefined);

    const download = await downloadPromise;
    if (download) {
      const fileName = safePdfName(download.suggestedFilename());
      try {
        const path = await download.path();
        if (path) {
          const { readFile } = await import("node:fs/promises");
          return { bytes: new Uint8Array(await readFile(path)), fileName };
        }
        const stream = await download.createReadStream();
        if (stream) {
          const chunks: Buffer[] = [];
          for await (const chunk of stream) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          return { bytes: new Uint8Array(Buffer.concat(chunks)), fileName };
        }
      } catch {
        // Download failed or was cancelled — try the popup/inline fallbacks.
      }
    }

    const popup = await popupPromise;
    if (popup) {
      try {
        const url = popup.url();
        if (url && (url.startsWith("blob:") || url.toLowerCase().includes(".pdf"))) {
          const bytes = await this.fetchPdfUrl(url);
          if (bytes) {
            return { bytes, fileName: safePdfName(url.split("/").pop()) };
          }
        }
      } catch {
        // popup already closed
      } finally {
        await popup.close().catch(() => undefined);
      }
    }

    return { bytes: null, fileName: null };
  }

  /** Fetches a blob/http PDF URL from the page origin and returns its bytes. */
  private async fetchPdfUrl(url: string): Promise<Uint8Array | null> {
    try {
      const base64 = await this.page.evaluate(async (target: string) => {
        try {
          const response = await fetch(target);
          const bytes = new Uint8Array(await response.arrayBuffer());
          let binary = "";
          const chunkSize = 0x8000;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
          }
          return btoa(binary);
        } catch {
          return null;
        }
      }, url);
      if (!base64) return null;
      const bytes = new Uint8Array(Buffer.from(base64, "base64"));
      return bytes.byteLength > 0 ? bytes : null;
    } catch {
      return null;
    }
  }

  private async captureInlinePdf(
    candidates: Array<Page | Frame>,
  ): Promise<{ bytes: Uint8Array; fileName: string | null } | null> {
    const script = `(async () => {
      const candidates = [
        document.querySelector("embed[type='application/pdf']"),
        document.querySelector("object[type='application/pdf']"),
        document.querySelector("iframe[src^='blob:']"),
        document.querySelector("iframe[src*='.pdf']"),
      ].filter(Boolean);
      for (const element of candidates) {
        const url = element.src || element.data;
        if (!url) continue;
        try {
          const response = await fetch(url);
          const buffer = new Uint8Array(await response.arrayBuffer());
          let binary = "";
          const chunkSize = 0x8000;
          for (let i = 0; i < buffer.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, buffer.subarray(i, i + chunkSize));
          }
          return btoa(binary);
        } catch (error) {
          // try the next candidate
        }
      }
      return null;
    })()`;

    for (const target of candidates) {
      try {
        const base64 = (await target.evaluate(script)) as string | null;
        if (base64) {
          return {
            bytes: new Uint8Array(Buffer.from(base64, "base64")),
            fileName: "inline-generated.pdf",
          };
        }
      } catch {
        // cross-origin frame — skip
      }
    }
    return null;
  }

  private async collectFormFields(
    candidates: Array<Page | Frame>,
  ): Promise<Record<string, string>> {
    const script = `(() => {
      const fields = {};
      const elements = document.querySelectorAll("input, select, textarea");
      for (const element of elements) {
        const type = (element.getAttribute("type") || "").toLowerCase();
        if (type === "hidden" || type === "password" || type === "file") continue;
        let value = "";
        if (type === "checkbox") {
          value = element.checked ? "true" : "false";
        } else if (type === "radio") {
          value = element.checked ? (element.value || "true") : "";
        } else {
          value = element.value || "";
        }
        if (!value) continue;

        let label = "";
        if (element.labels && element.labels.length > 0) {
          label = (element.labels[0].textContent || "").trim();
        }
        if (!label) {
          label = (element.getAttribute("aria-label") || "").trim();
        }
        if (!label) {
          label = (element.getAttribute("placeholder") || "").trim();
        }
        if (!label) {
          const wrapping = element.closest("label");
          if (wrapping) label = (wrapping.textContent || "").trim();
        }
        if (!label) {
          label = (element.getAttribute("name") || element.id || "").trim();
        }
        if (!label) continue;
        label = label.replace(/\\s+/g, " ").slice(0, 120);
        fields[label] = value.slice(0, 500);
      }
      return fields;
    })()`;

    for (const target of candidates) {
      try {
        const fields = (await target.evaluate(script)) as Record<string, string>;
        if (fields && Object.keys(fields).length > 0) {
          return fields;
        }
      } catch {
        // continue checking other frames
      }
    }
    return {};
  }

  private async readWorkflowStatus(
    candidates: Array<Page | Frame>,
    expected: string,
  ): Promise<string | null> {
    const script = `(() => {
      const boxes = [
        document.getElementById("workflowStatusText"),
        document.querySelector("[data-ars-workflow-status]"),
        document.querySelector("[role='alert']"),
        document.querySelector(".ant-message-notice-content"),
        document.querySelector(".gwt-DialogBox"),
        document.querySelector("[role='dialog']"),
      ].filter(Boolean);
      for (const box of boxes) {
        const attribute = box.getAttribute("data-ars-workflow-status");
        const text = (box.textContent || "").replace(/\\s+/g, " ").trim();
        if (attribute) return attribute;
        if (text) return text.slice(0, 160);
      }
      return null;
    })()`;

    for (const target of candidates) {
      try {
        const status = (await target.evaluate(script)) as string | null;
        if (status) return status;
      } catch {
        // continue checking other frames
      }
    }
    // The click itself is an observable outcome when the app shows no status box.
    return expected === "SEND_TO_SIGN" || expected === "PUBLISH" ? "CLICKED" : null;
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

function safePdfName(name: string | null | undefined): string {
  const fallback = "generated.pdf";
  if (!name) return fallback;
  const sanitized = name.replace(/[^\w.-]+/g, "-");
  if (!sanitized) return fallback;
  return sanitized.toLowerCase().endsWith(".pdf") ? sanitized : sanitized + ".pdf";
}
