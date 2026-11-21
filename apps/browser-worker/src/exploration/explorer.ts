import type { Page } from "playwright";

import type { DiscoveredElementRecord } from "@ars/shared-contracts";

import type { ExecutionReporter } from "../reporter.js";

export interface ExplorationBudget {
  maxInteractions: number;
  maxOptions: number;
}

interface PlannedInteraction {
  kind: "selectOption" | "setCheckbox" | "chooseRadio";
  source: DiscoveredElementRecord;
  value: string | null;
  description: string;
}

interface StateEntry {
  enabled: boolean;
  visible: boolean;
  value: string | null;
  options: string[] | null;
}

type StateSnapshot = Map<string, StateEntry>;

export interface ExplorationObservation {
  sourceRef: string;
  sourceLabel: string | null;
  interaction: string;
  value: string | null;
  affectedRef: string;
  affectedLabel: string | null;
  attribute: "enabled" | "visible" | "value" | "options";
  beforeValue: string | null;
  afterValue: string | null;
  reverted: boolean;
}

export interface ExplorationOutcome {
  observations: ExplorationObservation[];
  executed: number;
  failed: number;
}

/**
 * Safe interaction exploration (master prompt §7).
 *
 * For each bounded interaction: snapshot state -> apply -> snapshot -> diff ->
 * capture evidence for real changes -> REVERT to the known state -> verify
 * the revert. Only selects, checkboxes and radios are ever touched; business
 * actions (submit, delete, approve, sign, send, publish) are never executed.
 */
export class DependencyExplorer {
  constructor(
    private readonly page: Page,
    private readonly budget: ExplorationBudget,
    private readonly timeoutMs: number,
    private readonly reporter: ExecutionReporter,
    private readonly scanState: () => Promise<DiscoveredElementRecord[]>,
    private readonly elements: DiscoveredElementRecord[],
  ) {}

  async run(): Promise<ExplorationOutcome> {
    const plan = this.buildPlan();
    await this.reporter.event(
      "INFO",
      `Exploration plan: ${plan.length} bounded interaction(s) (selects, checkboxes, radios only — no business actions).`,
    );

    const outcome: ExplorationOutcome = { observations: [], executed: 0, failed: 0 };
    if (plan.length === 0) {
      return outcome;
    }

    const baseline = toSnapshot(await this.scanState());

    for (const step of plan) {
      const applied = await this.applyAndObserve(step, baseline);
      if (applied.error) {
        outcome.failed += 1;
        await this.reporter.event(
          "WARNING",
          `Interaction failed on ${step.source.ref} (${step.description}): ${applied.error}`,
        );
        continue;
      }
      outcome.executed += 1;
      outcome.observations.push(...applied.observations);

      if (applied.observations.length > 0) {
        await this.reporter.event(
          "STEP",
          `Observed ${applied.observations.length} dependency change(s) for ${step.description}.`,
          {
            changes: applied.observations.map((observation) => ({
              affected: observation.affectedRef,
              attribute: observation.attribute,
              before: observation.beforeValue,
              after: observation.afterValue,
            })),
          },
        );
        const screenshot = await this.page.screenshot({ fullPage: true, type: "png" });
        await this.reporter.artifact(
          "SCREENSHOT",
          `interaction-${step.source.ref}-${sanitize(step.value ?? step.kind)}.png`,
          "image/png",
          new Uint8Array(screenshot),
        );
      }

      const revertedClean = await this.revertAndVerify(step, baseline);
      if (!revertedClean) {
        for (const observation of applied.observations) {
          observation.reverted = false;
        }
      }
    }

    return outcome;
  }

  // ------------------------------------------------------------------
  // Planning
  // ------------------------------------------------------------------

  private buildPlan(): PlannedInteraction[] {
    const plan: PlannedInteraction[] = [];
    const explorable = this.elements.filter(
      (element) => element.enabled && element.visible && (element.locatorCandidates?.length ?? 0) > 0,
    );

    // 1) Selects first — richest dependency semantics, option-limited.
    for (const select of explorable.filter((element) => element.elementType === "select")) {
      const options = (select.options ?? [])
        .filter((option) => option !== select.value)
        .slice(0, this.budget.maxOptions);
      for (const option of options) {
        plan.push({
          kind: "selectOption",
          source: select,
          value: option,
          description: `selectOption ${select.ref} ('${select.label ?? "?"}') -> '${option}'`,
        });
        if (plan.length >= this.budget.maxInteractions) {
          return plan;
        }
      }
    }

    // 2) Checkboxes — single toggle per control.
    for (const checkbox of explorable.filter((element) => element.elementType === "checkbox")) {
      plan.push({
        kind: "setCheckbox",
        source: checkbox,
        value: checkbox.value === "true" ? "false" : "true",
        description: `setCheckbox ${checkbox.ref} ('${checkbox.label ?? "?"}') -> ${checkbox.value === "true" ? "unchecked" : "checked"}`,
      });
      if (plan.length >= this.budget.maxInteractions) {
        return plan;
      }
    }

    // 3) Unchecked radios — click each (bounded).
    for (const radio of explorable.filter(
      (element) => element.elementType === "radio" && element.value !== "true",
    )) {
      plan.push({
        kind: "chooseRadio",
        source: radio,
        value: radio.locatorCandidates?.[0]?.match(/value="([^"]+)"/)?.[1] ?? null,
        description: `chooseRadio ${radio.ref} ('${radio.label ?? "?"}')`,
      });
      if (plan.length >= this.budget.maxInteractions) {
        return plan;
      }
    }

    return plan;
  }

  // ------------------------------------------------------------------
  // Apply / observe / revert
  // ------------------------------------------------------------------

  private async applyAndObserve(
    step: PlannedInteraction,
    baseline: StateSnapshot,
  ): Promise<{ observations: ExplorationObservation[]; error?: string }> {
    try {
      const selector = step.source.locatorCandidates?.[0];
      if (!selector) {
        return { observations: [], error: "no locator candidates" };
      }

      if (step.kind === "selectOption" && step.value) {
        await this.page.selectOption(selector, step.value);
      } else if (step.kind === "setCheckbox") {
        if (step.value === "true") {
          await this.page.check(selector);
        } else {
          await this.page.uncheck(selector);
        }
      } else if (step.kind === "chooseRadio") {
        await this.page.check(selector);
      } else {
        return { observations: [], error: "unsupported interaction" };
      }
      await this.stabilize();

      const after = toSnapshot(await this.scanState());
      const observations: ExplorationObservation[] = [];

      for (const [ref, afterEntry] of after) {
        if (ref === step.source.ref) {
          continue; // the source's own change is the interaction itself
        }
        const beforeEntry = baseline.get(ref);
        if (!beforeEntry) {
          continue; // dynamically inserted elements are Phase 5 comparison scope
        }
        const affected = this.elements.find((element) => element.ref === ref);

        // Skip same-group noise (radio siblings of the source).
        if (step.source.name && affected?.name && affected.name === step.source.name) {
          continue;
        }

        const deltas: Array<{
          attribute: "enabled" | "visible" | "value" | "options";
          beforeValue: string | null;
          afterValue: string | null;
        }> = [];
        if (beforeEntry.enabled !== afterEntry.enabled) {
          deltas.push({
            attribute: "enabled",
            beforeValue: String(beforeEntry.enabled),
            afterValue: String(afterEntry.enabled),
          });
        }
        if (beforeEntry.visible !== afterEntry.visible) {
          deltas.push({
            attribute: "visible",
            beforeValue: String(beforeEntry.visible),
            afterValue: String(afterEntry.visible),
          });
        }
        if ((beforeEntry.value ?? "") !== (afterEntry.value ?? "")) {
          deltas.push({
            attribute: "value",
            beforeValue: clip(beforeEntry.value),
            afterValue: clip(afterEntry.value),
          });
        }
        if ((beforeEntry.options ?? []).join("|") !== (afterEntry.options ?? []).join("|")) {
          deltas.push({
            attribute: "options",
            beforeValue: clip((beforeEntry.options ?? []).join(", ")),
            afterValue: clip((afterEntry.options ?? []).join(", ")),
          });
        }

        for (const delta of deltas) {
          observations.push({
            sourceRef: step.source.ref,
            sourceLabel: step.source.label,
            interaction: step.kind,
            value: step.value,
            affectedRef: ref,
            affectedLabel: affected?.label ?? null,
            attribute: delta.attribute,
            beforeValue: delta.beforeValue,
            afterValue: delta.afterValue,
            reverted: true, // corrected by revert verification below
          });
        }
      }

      return { observations };
    } catch (error) {
      return {
        observations: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async revertAndVerify(step: PlannedInteraction, baseline: StateSnapshot): Promise<boolean> {
    try {
      if (step.kind === "selectOption") {
        const original = baseline.get(step.source.ref)?.value ?? step.source.value;
        const selector = step.source.locatorCandidates?.[0];
        if (selector && original) {
          await this.page.selectOption(selector, original);
        }
      } else if (step.kind === "setCheckbox") {
        const selector = step.source.locatorCandidates?.[0];
        const originalChecked = baseline.get(step.source.ref)?.value === "true";
        if (selector) {
          if (originalChecked) {
            await this.page.check(selector);
          } else {
            await this.page.uncheck(selector);
          }
        }
      } else if (step.kind === "chooseRadio") {
        // Re-check the originally selected radio of the same group.
        const originalRadio = this.elements.find(
          (element) =>
            element.name === step.source.name &&
            element.ref !== step.source.ref &&
            baseline.get(element.ref)?.value === "true",
        );
        const selector = originalRadio?.locatorCandidates?.[0];
        if (selector) {
          await this.page.check(selector);
        }
      }
      await this.stabilize();

      const reverted = toSnapshot(await this.scanState());
      for (const [ref, entry] of reverted) {
        const before = baseline.get(ref);
        if (!before) {
          continue;
        }
        if (
          before.enabled !== entry.enabled ||
          before.visible !== entry.visible ||
          (before.value ?? "") !== (entry.value ?? "") ||
          (before.options ?? []).join("|") !== (entry.options ?? []).join("|")
        ) {
          await this.reporter.event(
            "WARNING",
            `Reset could not be verified after interaction ${step.description}; the screen state differs from the baseline.`,
          );
          return false;
        }
      }
      return true;
    } catch (error) {
      await this.reporter.event(
        "WARNING",
        `Reset failed after ${step.description}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /** State-based settle: wait for network activity to drain (no fixed sleeps). */
  private async stabilize(): Promise<void> {
    await this.page
      .waitForLoadState("networkidle", { timeout: Math.min(this.timeoutMs, 3_000) })
      .catch(() => undefined);
  }
}

function toSnapshot(records: DiscoveredElementRecord[]): StateSnapshot {
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

function clip(value: string | null): string | null {
  if (value === null) return null;
  return value.length > 200 ? value.slice(0, 197) + "..." : value;
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 40);
}
