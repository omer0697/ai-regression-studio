import type { Page } from "playwright";

import type { DiscoveredElementRecord } from "@ars/shared-contracts";

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

/**
 * Executes a validated plan against one application using that app's element
 * records (refs resolved through the mapping on the React side).
 */
export class PlanExecutor {
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
      if (step.action.startsWith("assert")) {
        await onStep(`assert ${step.action} on ${step.target}`);
        continue;
      }
      const target = step.target;
      if (!target) {
        continue;
      }
      const appRef = refResolver(target);
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
          await this.page.click(selector);
          break;
        case "fill":
          await this.page.fill(selector, step.value ?? "");
          break;
        case "selectOption":
          await this.page.selectOption(selector, step.value ?? "");
          break;
        case "setCheckbox":
          if (step.value === "false") {
            await this.page.uncheck(selector);
          } else {
            await this.page.check(selector);
          }
          break;
        case "chooseRadio":
          await this.page.check(selector);
          break;
        case "downloadPdf":
          await onStep(`skip: downloadPdf requires a real document flow (Phase 6)`);
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
}

/** Compares two state snapshots for one mapped pair. */
export function diffState(
  before: StateEntry,
  after: StateEntry,
): Array<{ attribute: "enabled" | "visible" | "value" | "options"; beforeValue: string | null; afterValue: string | null }> {
  const deltas: Array<{ attribute: "enabled" | "visible" | "value" | "options"; beforeValue: string | null; afterValue: string | null }> = [];
  if (before.enabled !== after.enabled) {
    deltas.push({ attribute: "enabled", beforeValue: String(before.enabled), afterValue: String(after.enabled) });
  }
  if (before.visible !== after.visible) {
    deltas.push({ attribute: "visible", beforeValue: String(before.visible), afterValue: String(after.visible) });
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
