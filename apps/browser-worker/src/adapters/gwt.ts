import type { Page } from "playwright";

import { runDiscoveryInPage } from "./in-page.js";
import type { AppAdapter } from "./types.js";

const GWT_READY_SELECTOR =
  ".gwt-TextBox, .gwt-ListBox, .gwt-TextArea, .gwt-Button, table[role='form'], .gwt-Root, iframe";

/**
 * GWT adapter. Legacy GWT screens are typically table-based with minimal
 * semantics or hosted inside an enterprise shell `<iframe>`. Readiness waits
 * for recognizable GWT artifacts in the main document or inside nested iframes.
 */
export class GwtAdapter implements AppAdapter {
  readonly appType = "LEGACY_GWT" as const;

  async waitForReady(page: Page, timeoutMs: number): Promise<void> {
    await page.waitForSelector(GWT_READY_SELECTOR, { timeout: timeoutMs });
    if (typeof page.frames === "function") {
      const frames = page.frames();
      const mainFrame = typeof page.mainFrame === "function" ? page.mainFrame() : frames[0];
      for (const frame of frames) {
        if (frame === mainFrame) continue;
        await frame
          .waitForLoadState("domcontentloaded", { timeout: Math.min(timeoutMs, 5_000) })
          .catch(() => undefined);
        await frame
          .waitForSelector(
            ".gwt-TextBox, .gwt-ListBox, .gwt-TextArea, .gwt-Button, table[role='form'], .gwt-Root, input, select, table",
            { timeout: Math.min(timeoutMs, 5_000) },
          )
          .catch(() => undefined);
      }
    }
  }

  async discoverElements(page: Page) {
    return runDiscoveryInPage(page, "gwt");
  }
}
