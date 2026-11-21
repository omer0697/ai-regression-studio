import type { Page } from "playwright";

import { runDiscoveryInPage } from "./in-page.js";
import type { AppAdapter } from "./types.js";

/**
 * GWT adapter. Legacy GWT screens are typically table-based with minimal
 * semantics: labels sit in the preceding table cell and controls carry
 * `gwt-*` class names. Readiness waits for recognizable GWT artifacts —
 * never an arbitrary sleep.
 */
export class GwtAdapter implements AppAdapter {
  readonly appType = "LEGACY_GWT" as const;

  async waitForReady(page: Page, timeoutMs: number): Promise<void> {
    await page.waitForSelector(
      ".gwt-TextBox, .gwt-ListBox, .gwt-TextArea, .gwt-Button, table[role='form'], .gwt-Root",
      { timeout: timeoutMs },
    );
  }

  async discoverElements(page: Page) {
    return runDiscoveryInPage(page, "gwt");
  }
}
