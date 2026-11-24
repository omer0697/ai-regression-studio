import { chromium, type Browser } from "playwright";

import type { WorkerConfig } from "../config.js";

/**
 * Singleton Chromium lifecycle. One headless browser process serves standard
 * automated jobs; an optional visible (headed) browser process is launched on
 * demand when the user chooses interactive manual login.
 */
export class BrowserLifecycle {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;

  private visibleBrowser: Browser | null = null;
  private launchingVisible: Promise<Browser> | null = null;

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

  /**
   * Acquires a visible (headed) Chromium browser so the user can manually pass
   * login / OTP / Captcha / SSO screens in a real window.
   */
  async acquireVisible(): Promise<Browser> {
    if (this.visibleBrowser && this.visibleBrowser.isConnected()) {
      return this.visibleBrowser;
    }
    if (!this.launchingVisible) {
      this.launchingVisible = chromium
        .launch({ headless: false })
        .then((browser) => {
          browser.on("disconnected", () => {
            if (this.visibleBrowser === browser) {
              this.visibleBrowser = null;
              this.launchingVisible = null;
            }
          });
          this.visibleBrowser = browser;
          return browser;
        })
        .catch(async () => {
          // Fallback to default acquire() if display server is unavailable (e.g. headless CI)
          return this.acquire();
        })
        .finally(() => {
          this.launchingVisible = null;
        });
    }
    return this.launchingVisible;
  }

  async shutdown(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }
    if (this.visibleBrowser) {
      await this.visibleBrowser.close().catch(() => undefined);
      this.visibleBrowser = null;
    }
  }
}
