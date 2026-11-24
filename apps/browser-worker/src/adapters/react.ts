import type { Page } from "playwright";

import { runDiscoveryInPage } from "./in-page.js";
import type { AppAdapter } from "./types.js";

const REACT_READY_SELECTOR = "#root > *:not(:empty), .ant-form-item, form, iframe";

/**
 * React adapter. Modern React (including Ant Design) uses semantic forms and
 * `ant-*` classes, either directly or embedded in a shell `<iframe>`.
 */
export class ReactAdapter implements AppAdapter {
  readonly appType = "REACT" as const;

  async waitForReady(page: Page, timeoutMs: number): Promise<void> {
    await page.waitForSelector(REACT_READY_SELECTOR, {
      timeout: timeoutMs,
    });
    if (typeof page.frames === "function") {
      const frames = page.frames();
      const mainFrame = typeof page.mainFrame === "function" ? page.mainFrame() : frames[0];
      for (const frame of frames) {
        if (frame === mainFrame) continue;
        await frame
          .waitForLoadState("domcontentloaded", { timeout: Math.min(timeoutMs, 5_000) })
          .catch(() => undefined);
        await frame
          .waitForSelector("#root > *:not(:empty), .ant-form-item, form, input, select, table", {
            timeout: Math.min(timeoutMs, 5_000),
          })
          .catch(() => undefined);
      }
    }
  }

  async discoverElements(page: Page) {
    return runDiscoveryInPage(page, "react");
  }
}
