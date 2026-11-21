import { chromium, type Browser } from "playwright";

import type { WorkerConfig } from "../config.js";

/**
 * Singleton Chromium lifecycle. One browser process serves all jobs; each job
 * gets a fully isolated browser context (separate cookies, cache, storage) and
 * is always closed in a finally block.
 */
export class BrowserLifecycle {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;

  constructor(private readonly config: WorkerConfig) {}

  async acquire(): Promise<Browser> {
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }
    if (!this.launching) {
      this.launching = chromium
        .launch({ headless: this.config.headless })
        .then((browser) => {
          browser.on("disconnected", () => {
            if (this.browser === browser) {
              this.browser = null;
              this.launching = null;
            }
          });
          this.browser = browser;
          return browser;
        })
        .finally(() => {
          this.launching = null;
        });
    }
    return this.launching;
  }

  async shutdown(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }
  }
}
