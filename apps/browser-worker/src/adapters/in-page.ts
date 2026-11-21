import type { Page } from "playwright";

import type { DiscoveredElementRecord } from "@ars/shared-contracts";

/**
 * In-page discovery script. This function is serialized and evaluated inside
 * the page (untrusted DOM). It must be fully self-contained: no imports and
 * no closure variables.
 *
 * IMPORTANT: page content is treated as data only. Any instructions found in
 * DOM text are never interpreted as commands.
 */
function inPageDiscover(strategy: "gwt" | "react"): Array<Record<string, unknown>> {
  const records: Array<Record<string, unknown>> = [];
  const MAX_OPTIONS = 30;
  const MAX_PATH_SEGMENTS = 10;
  const MAX_TEXT = 300;

  function clip(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    const trimmed = value.replace(/\s+/g, " ").trim();
    if (!trimmed) return null;
    return trimmed.length > MAX_TEXT ? trimmed.slice(0, MAX_TEXT) : trimmed;
  }

  function isVisible(el: Element): boolean {
    if (!(el instanceof HTMLElement)) return false;
    if (el.tagName === "INPUT" && (el as HTMLInputElement).type === "hidden") return false;
    if (el.getClientRects().length === 0) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
    return true;
  }

  function classify(el: Element): string {
    if (el instanceof HTMLInputElement) {
      switch (el.type) {
        case "hidden":
          return "hidden";
        case "checkbox":
          return "checkbox";
        case "radio":
          return "radio";
        case "date":
          return "date";
        case "file":
          return "file";
        case "button":
        case "submit":
        case "reset":
          return "button";
        default:
          return "text";
      }
    }
    if (el instanceof HTMLSelectElement) return "select";
    if (el instanceof HTMLTextAreaElement) return "textarea";
    if (el instanceof HTMLButtonElement) return "button";
    if (el.getAttribute("role") === "button") return "button";
    if (el instanceof HTMLAnchorElement) return "link";
    return "other";
  }

  function domPath(el: Element): string {
    const segments: string[] = [];
    let current: Element | null = el;
    while (current && segments.length < MAX_PATH_SEGMENTS) {
      const tag = current.tagName.toLowerCase();
      const id = current.id ? `#${current.id}` : "";
      let nth = "";
      const parent: Element | null = current.parentElement;
      if (parent) {
        const sameTag = Array.from(parent.children).filter(
          (child) => child.tagName === current!.tagName,
        );
        if (sameTag.length > 1) {
          nth = `:nth-of-type(${sameTag.indexOf(current) + 1})`;
        }
      }
      segments.unshift(`${tag}${id}${nth}`);
      current = current.parentElement;
    }
    return segments.join(" > ");
  }

  function labelForId(id: string | null): string | null {
    if (!id) return null;
    const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    return label ? clip(label.textContent) : null;
  }

  function gwtCellLabel(el: Element): string | null {
    const row = el.closest("tr");
    if (!row) return null;
    const cells = Array.from(row.children);
    if (cells.length < 2) return null;
    const ownCell = el.closest("td, th");
    const ownIndex = ownCell ? cells.indexOf(ownCell) : -1;
    for (let i = (ownIndex === -1 ? cells.length : ownIndex) - 1; i >= 0; i--) {
      const text = clip(cells[i].textContent);
      if (text) return text;
    }
    return null;
  }

  function reactFormItemLabel(el: Element): string | null {
    const item = el.closest(".ant-form-item, .form-item, [class*='form-item']");
    if (item) {
      const label = item.querySelector("label");
      if (label) return clip(label.textContent);
      const labelBox = item.querySelector("[class*='label']");
      if (labelBox) return clip(labelBox.textContent);
    }
    return labelForId(el instanceof HTMLElement ? el.id : null);
  }

  function resolveLabel(el: Element, type: string): string | null {
    if (type === "table") return null;
    const aria = clip(el.getAttribute("aria-label"));
    if (aria) return aria;
    if (strategy === "gwt") {
      const cell = gwtCellLabel(el);
      if (cell) return cell;
    } else {
      const formLabel = reactFormItemLabel(el);
      if (formLabel) return formLabel;
    }
    const htmlFor = labelForId(el instanceof HTMLElement ? el.id : null);
    if (htmlFor) return htmlFor;
    const closestLabel = el.closest("label");
    if (closestLabel) return clip(closestLabel.textContent);
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const placeholder = clip(el.placeholder);
      if (placeholder) return placeholder;
    }
    const title = clip(el.getAttribute("title"));
    if (title) return title;
    const ownText = clip(el.textContent);
    if ((type === "button" || type === "link") && ownText) return ownText;
    return null;
  }

  function accessibleName(el: Element, label: string | null): string | null {
    const aria = clip(el.getAttribute("aria-label"));
    if (aria) return aria;
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const source = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id))
        .filter((node): node is HTMLElement => node !== null)
        .map((node) => clip(node.textContent))
        .filter(Boolean)
        .join(" ");
      if (source) return source;
    }
    return label;
  }

  function confidenceFor(el: Element, label: string | null, type: string): number {
    if (!label) return 0.3;
    if (strategy === "gwt") {
      if (el.closest("tr") && el.closest("td")) return 0.9;
    } else {
      if (el.closest(".ant-form-item, .form-item, [class*='form-item']")) return 0.95;
    }
    if (el.getAttribute("aria-label")) return 0.85;
    if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.placeholder) {
      return 0.7;
    }
    if (el.getAttribute("title")) return 0.6;
    if (type === "button" || type === "link") return 0.8;
    if (labelForId(el instanceof HTMLElement ? el.id : null)) return 0.9;
    return 0.5;
  }

  function valueOf(el: Element, type: string): string | null {
    if (el instanceof HTMLInputElement) {
      if (type === "checkbox" || type === "radio") return el.checked ? "true" : "false";
      return clip(el.value);
    }
    if (el instanceof HTMLSelectElement) return clip(el.value);
    if (el instanceof HTMLTextAreaElement) return clip(el.value);
    if (type === "button" || type === "link") return clip(el.textContent);
    return null;
  }

  function optionsOf(el: Element, type: string): string[] | null {
    if (type !== "select" || !(el instanceof HTMLSelectElement)) return null;
    return Array.from(el.options)
      .slice(0, MAX_OPTIONS)
      .map((option) => clip(option.value) ?? clip(option.text) ?? "");
  }

  function requiredOf(el: Element): boolean | null {
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
      if (el.required) return true;
    }
    const aria = el.getAttribute("aria-required");
    if (aria === "true") return true;
    if (aria === "false") return false;
    return null;
  }

  const selector =
    "input, select, textarea, button, [role='button'], a[href], table";
  const elements = Array.from(document.querySelectorAll(selector));

  function locatorCandidates(el: Element): string[] {
    const out: string[] = [];
    if (el.id) {
      out.push("#" + el.id);
    }
    const name = el.getAttribute("name");
    if (name) {
      const tag = el.tagName.toLowerCase();
      const value = el.getAttribute("value");
      if (el instanceof HTMLInputElement && el.type === "radio" && value) {
        out.push(`${tag}[name="${name}"][value="${value}"]`);
      } else {
        out.push(`${tag}[name="${name}"]`);
      }
    }
    const aria = el.getAttribute("aria-label");
    if (aria) {
      out.push(`[aria-label="${aria}"]`);
    }
    return out.slice(0, 3);
  }

  for (const el of elements) {
    const type = el.tagName === "TABLE" ? "table" : classify(el);
    const visible = isVisible(el);
    const enabled =
      el instanceof HTMLButtonElement ||
      el instanceof HTMLInputElement ||
      el instanceof HTMLSelectElement ||
      el instanceof HTMLTextAreaElement
        ? !el.disabled && el.getAttribute("aria-disabled") !== "true"
        : el.getAttribute("aria-disabled") !== "true";

    let value: string | null = null;
    let options: string[] | null = null;
    if (type === "table") {
      const table = el as HTMLTableElement;
      const rows = table.rows ? table.rows.length : 0;
      const headerCells = table.tHead ? table.tHead.rows[0]?.cells.length ?? 0 : 0;
      // Content digest lets the comparison engine detect data differences;
      // header cells become the matching signature for table pairing.
      const digest: string[] = [];
      for (let i = 0; i < table.rows.length && digest.length < 40; i++) {
        const cells = Array.from(table.rows[i].cells)
          .map((cell) => clip(cell.textContent) ?? "")
          .join("|");
        digest.push(cells);
      }
      value = clip(`${rows}x${headerCells} ## ${digest.join(" ;; ")}`);
      options = headerCells
        ? Array.from(table.tHead!.rows[0].cells)
            .slice(0, 12)
            .map((cell) => clip(cell.textContent) ?? "")
        : null;
      const caption = clip(table.caption?.textContent);
      const label =
        caption ??
        clip(table.getAttribute("summary")) ??
        clip((table.previousElementSibling as HTMLElement | null)?.textContent);
      records.push({
        ref: "",
        label,
        elementType: "table",
        accessibleName: label,
        value,
        enabled: true,
        visible,
        required: null,
        options,
        locatorCandidates: [],
        name: null,
        domPath: domPath(el),
        confidence: label ? 0.75 : 0.4,
      });
      continue;
    }

    const label = resolveLabel(el, type);
    records.push({
      ref: "",
      label,
      elementType: type,
      accessibleName: accessibleName(el, label),
      value: valueOf(el, type),
      enabled,
      visible,
      required: requiredOf(el),
      options: optionsOf(el, type),
      locatorCandidates: locatorCandidates(el),
      name: el.getAttribute("name"),
      domPath: domPath(el),
      confidence: confidenceFor(el, label, type),
    });
  }

  return records;
}

/**
 * Runs discovery inside the page and normalizes the records
 * (assigns stable refs e1..eN in DOM order).
 */
export async function runDiscoveryInPage(
  page: Page,
  strategy: "gwt" | "react",
): Promise<DiscoveredElementRecord[]> {
  const raw = await page.evaluate(`(${inPageDiscover.toString()})(${JSON.stringify(strategy)})`);
  return (raw as Array<Record<string, unknown>>).map((record, index) => ({
    ref: `e${index + 1}`,
    label: (record.label as string | null) ?? null,
    elementType: String(record.elementType ?? "other"),
    accessibleName: (record.accessibleName as string | null) ?? null,
    value: (record.value as string | null) ?? null,
    enabled: Boolean(record.enabled),
    visible: Boolean(record.visible),
    required: (record.required as boolean | null) ?? null,
    options: (record.options as string[] | null) ?? null,
    locatorCandidates: (record.locatorCandidates as string[] | null) ?? null,
    name: (record.name as string | null) ?? null,
    domPath: (record.domPath as string | null) ?? null,
    confidence: Number(record.confidence ?? 0),
  }));
}
