import type { Page } from "playwright";

import type { TargetEnvironment } from "../adapters/types.js";

export interface TestCredential {
  username: string;
  password: string;
}

/**
 * Secure test login shared by discovery and comparison flows. Credentials are
 * resolved by reference and used only inside the isolated browser context —
 * never logged, never echoed into URLs.
 */
export async function performFormLogin(
  page: Page,
  environment: TargetEnvironment,
  credential: TestCredential | undefined,
  reporterLog: (message: string) => Promise<void>,
  timeoutMs: number,
): Promise<void> {
  const reference = environment.credentialReference ?? "";
  if (!credential) {
    throw new Error(
      `Credential reference '${reference}' not found in the worker credential store.`,
    );
  }
  if (
    !environment.loginUrl ||
    !environment.usernameSelector ||
    !environment.passwordSelector ||
    !environment.submitSelector
  ) {
    throw new Error("TEST_ACCOUNT_FORM requires loginUrl and form selectors.");
  }

  await reporterLog("Performing configured test-account form login.");
  await page.goto(environment.loginUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  await page.waitForSelector(environment.usernameSelector, { timeout: timeoutMs });
  const loginPageUrl = page.url();

  await page.fill(environment.usernameSelector, credential.username);
  await page.fill(environment.passwordSelector, credential.password);
  await page.click(environment.submitSelector);

  try {
    await page.waitForURL((url) => url.toString() !== loginPageUrl, { timeout: timeoutMs });
    await reporterLog("Test-account login accepted by the application.");
  } catch {
    throw new Error("Login was rejected — the login form is still visible after submit.");
  }
}
