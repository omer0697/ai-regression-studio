import type { Page } from "playwright";

import type { DiscoveredElementRecord } from "@ars/shared-contracts";

/** Environment reference handed to the runner (secrets excluded). */
export interface TargetEnvironment {
  appType: "LEGACY_GWT" | "REACT";
  baseUrl: string;
  authMethod: "NONE" | "TEST_ACCOUNT_FORM";
  loginUrl?: string | null;
  usernameSelector?: string | null;
  passwordSelector?: string | null;
  submitSelector?: string | null;
  browserTimeoutMs: number;
}

/**
 * A DOM adapter. GWT and React applications get separate implementations —
 * the platform never assumes the same DOM structure exists in both.
 */
export interface AppAdapter {
  readonly appType: TargetEnvironment["appType"];
  /** State-based readiness wait; never an arbitrary sleep. */
  waitForReady(page: Page, timeoutMs: number): Promise<void>;
  /** Passive scan of the current page into normalized element records. */
  discoverElements(page: Page): Promise<DiscoveredElementRecord[]>;
}

export { runDiscoveryInPage } from "./in-page.js";
