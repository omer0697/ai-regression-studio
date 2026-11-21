import type { Page } from "playwright";

import { runDiscoveryInPage } from "./in-page.js";
import type { AppAdapter } from "./types.js";

/**
 * React adapter. Modern React (including Ant Design) uses semantic forms and
 * `ant-*` classes; labels live inside `.ant-form-item` blocks.
 */
export class ReactAdapter implements AppAdapter {
  readonly appType = "REACT" as const;

  async waitForReady(page: Page, timeoutMs: number): Promise<void> {
    await page.waitForSelector("#root > *:not(:empty), .ant-form-item, form", {
      timeout: timeoutMs,
    });
  }

  async discoverElements(page: Page) {
    return runDiscoveryInPage(page, "react");
  }
}
