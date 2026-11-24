import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { BrowserContext, Page } from "playwright";

import type { TargetEnvironment } from "../adapters/types.js";
import type { ExecutionReporter } from "../reporter.js";
import type { BrowserLifecycle } from "./lifecycle.js";

export interface SavedSessionMeta {
  profileKey: string;
  targetUrl: string;
  currentUrl: string;
  cookieCount: number;
  originCount: number;
  savedAt: string;
  windowOpen: boolean;
}

export interface StorageStateData {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Strict" | "Lax" | "None";
  }>;
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
}

interface StoredSessionFile {
  meta: Omit<SavedSessionMeta, "windowOpen">;
  storageState: StorageStateData;
}

interface ActiveWindow {
  profileKey: string;
  targetUrl: string;
  context: BrowserContext;
  page: Page;
  openedAt: string;
}

interface PendingExecutionLogin {
  executionId: number;
  appType: string;
  loginUrl: string;
  targetUrl: string;
  startedAt: string;
  resolve: (options?: { skipNavigation?: boolean }) => void;
  reject: (reason: Error) => void;
}

function sanitizeKey(raw: string): string {
  const cleaned = raw.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 80) || "default-session";
}

export function profileKeyForUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return sanitizeKey(`${parsed.hostname}-${parsed.port || (parsed.protocol === "https:" ? "443" : "80")}`);
  } catch {
    return "default-session";
  }
}

/**
 * Manages manual interactive login windows, persistent browser sessions
 * (cookies + localStorage) and live execution pause/continue gates so testers
 * can manually pass login / Captcha / OTP / SSO steps before screen testing.
 */
export class SessionManager {
  private readonly sessionsDir: string;
  private readonly activeWindows = new Map<string, ActiveWindow>();
  private readonly memorySessions = new Map<string, StoredSessionFile>();
  private readonly pendingExecutions = new Map<number, PendingExecutionLogin>();

  constructor(
    private readonly browser: BrowserLifecycle,
    sessionsDir?: string,
  ) {
    this.sessionsDir = resolve(
      sessionsDir ?? process.env.WORKER_SESSIONS_DIR ?? join(process.cwd(), ".ars-sessions"),
    );
  }

  /**
   * Checks whether an environment requests live manual interactive login during execution.
   */
  isManualInteractive(environment: TargetEnvironment & { allowedActions?: string[] }): boolean {
    const ref = (environment.credentialReference ?? "").trim().toUpperCase();
    if (ref === "MANUAL_INTERACTIVE" || ref === "MANUAL-INTERACTIVE" || ref.startsWith("MANUAL_LIVE")) {
      return true;
    }
    const actions = environment.allowedActions ?? [];
    return actions.includes("manual-interactive-login");
  }

  /**
   * Resolves a saved Playwright storageState for the given environment if one exists
   * (matched by explicit credentialReference or by the target URL's host:port key).
   */
  async resolveStorageState(
    environment: TargetEnvironment,
  ): Promise<{ profileKey: string; storageState: StorageStateData } | null> {
    await this.loadFromDisk();
    const candidates: string[] = [];
    if (environment.credentialReference && !this.isManualInteractive(environment)) {
      candidates.push(sanitizeKey(environment.credentialReference));
    }
    if (environment.loginUrl) {
      candidates.push(profileKeyForUrl(environment.loginUrl));
    }
    candidates.push(profileKeyForUrl(environment.baseUrl));

    for (const key of candidates) {
      const found = this.memorySessions.get(key);
      if (found) {
        return { profileKey: key, storageState: found.storageState };
      }
    }
    return null;
  }

  /**
   * Opens a visible Chromium window at `targetUrl` so the user can manually log in.
   */
  async openLoginWindow(rawProfileKey: string | undefined, targetUrl: string): Promise<SavedSessionMeta> {
    await this.loadFromDisk();
    const profileKey = rawProfileKey?.trim()
      ? sanitizeKey(rawProfileKey)
      : profileKeyForUrl(targetUrl);

    const existingWindow = this.activeWindows.get(profileKey);
    if (existingWindow) {
      try {
        await existingWindow.page.bringToFront();
        return {
          profileKey,
          targetUrl: existingWindow.targetUrl,
          currentUrl: existingWindow.page.url(),
          cookieCount: (await existingWindow.context.cookies()).length,
          originCount: 0,
          savedAt: existingWindow.openedAt,
          windowOpen: true,
        };
      } catch {
        this.activeWindows.delete(profileKey);
      }
    }

    const visibleBrowser = await this.browser.acquireVisible();
    const existingSaved = this.memorySessions.get(profileKey);
    const context = await visibleBrowser.newContext({
      viewport: { width: 1366, height: 900 },
      ...(existingSaved ? { storageState: existingSaved.storageState } : {}),
    });
    const page = await context.newPage();

    context.on("close", () => {
      if (this.activeWindows.get(profileKey)?.context === context) {
        this.activeWindows.delete(profileKey);
      }
    });

    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    const openedAt = new Date().toISOString();
    this.activeWindows.set(profileKey, {
      profileKey,
      targetUrl,
      context,
      page,
      openedAt,
    });

    const cookies = await context.cookies();
    return {
      profileKey,
      targetUrl,
      currentUrl: page.url(),
      cookieCount: cookies.length,
      originCount: existingSaved?.storageState.origins.length ?? 0,
      savedAt: openedAt,
      windowOpen: true,
    };
  }

  /**
   * Captures cookies + localStorage from the currently open manual login window,
   * persists them under `profileKey` (and the current URL's host key) and closes the window.
   */
  async saveLoginWindow(rawProfileKey: string, closeWindow = true): Promise<SavedSessionMeta> {
    const profileKey = sanitizeKey(rawProfileKey);
    const active = this.activeWindows.get(profileKey);
    if (!active) {
      throw new Error(
        `'${profileKey}' için açık bir giriş penceresi bulunamadı. Önce 'Tarayıcıda Giriş Penceresi Aç' butonuna basın.`,
      );
    }

    const currentUrl = active.page.url();
    const state = (await active.context.storageState()) as StorageStateData;
    const savedAt = new Date().toISOString();
    const meta: Omit<SavedSessionMeta, "windowOpen"> = {
      profileKey,
      targetUrl: active.targetUrl,
      currentUrl,
      cookieCount: state.cookies.length,
      originCount: state.origins.length,
      savedAt,
    };

    await this.persistSession(profileKey, { meta, storageState: state });

    // Also index by host:port so any test targeting the same host automatically reuses it
    const hostKey = profileKeyForUrl(currentUrl || active.targetUrl);
    if (hostKey !== profileKey) {
      await this.persistSession(hostKey, {
        meta: { ...meta, profileKey: hostKey },
        storageState: state,
      });
    }

    if (closeWindow) {
      this.activeWindows.delete(profileKey);
      await active.context.close().catch(() => undefined);
    }

    return {
      ...meta,
      windowOpen: !closeWindow,
    };
  }

  /**
   * During an execution, pauses in a visible browser window until the tester
   * completes manual login and clicks "Giriş Yaptım, Teste Devam Et" in the UI.
   */
  async performInteractiveExecutionLogin(
    executionId: number,
    page: Page,
    context: BrowserContext,
    environment: TargetEnvironment,
    reporter: ExecutionReporter,
    timeoutMs: number,
  ): Promise<{ skipNavigation: boolean }> {
    const loginEntryUrl = environment.loginUrl?.trim() || environment.baseUrl;
    await reporter.event(
      "INFO",
      `[${environment.appType}] Görünür tarayıcıda giriş sayfası açılıyor: ${loginEntryUrl}`,
    );
    await page.goto(loginEntryUrl, {
      waitUntil: "domcontentloaded",
      timeout: Math.max(timeoutMs, 45_000),
    });
    await page.bringToFront().catch(() => undefined);

    await reporter.event(
      "WARNING",
      `MANUAL_LOGIN_WAITING: [${environment.appType}] Tarayıcı açıldı. Lütfen giriş işlemini elinizle tamamlayın ve ekrandaki 'Giriş Yaptım, Teste Devam Et' butonuna basın.`,
      {
        waitingForManualLogin: true,
        executionId,
        appType: environment.appType,
        loginUrl: loginEntryUrl,
        targetUrl: environment.baseUrl,
        currentUrl: page.url(),
      },
    );

    const waitTimeoutMs = Math.max(timeoutMs * 4, 300_000); // up to 5 minutes for manual login
    const decision = await new Promise<{ skipNavigation?: boolean }>((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        this.pendingExecutions.delete(executionId);
        rejectPromise(new Error("Manuel giriş bekleme süresi (5 dk) doldu."));
      }, waitTimeoutMs);

      this.pendingExecutions.set(executionId, {
        executionId,
        appType: environment.appType,
        loginUrl: loginEntryUrl,
        targetUrl: environment.baseUrl,
        startedAt: new Date().toISOString(),
        resolve: (opts) => {
          clearTimeout(timer);
          this.pendingExecutions.delete(executionId);
          resolvePromise(opts ?? {});
        },
        reject: (err) => {
          clearTimeout(timer);
          this.pendingExecutions.delete(executionId);
          rejectPromise(err);
        },
      });
    });

    // Save the authenticated session automatically so future runs can reuse it!
    try {
      const state = (await context.storageState()) as StorageStateData;
      const hostKey = profileKeyForUrl(environment.baseUrl);
      const savedAt = new Date().toISOString();
      const meta: Omit<SavedSessionMeta, "windowOpen"> = {
        profileKey: hostKey,
        targetUrl: environment.baseUrl,
        currentUrl: page.url(),
        cookieCount: state.cookies.length,
        originCount: state.origins.length,
        savedAt,
      };
      await this.persistSession(hostKey, { meta, storageState: state });
      if (environment.credentialReference && !this.isManualInteractive(environment)) {
        const refKey = sanitizeKey(environment.credentialReference);
        await this.persistSession(refKey, {
          meta: { ...meta, profileKey: refKey },
          storageState: state,
        });
      }
      await reporter.event(
        "INFO",
        `[${environment.appType}] Manuel giriş onaylandı ve oturum kaydedildi (${state.cookies.length} çerez). Hedef ekrana geçiliyor...`,
      );
    } catch {
      await reporter.event(
        "INFO",
        `[${environment.appType}] Manuel giriş onaylandı. Hedef ekrana geçiliyor...`,
      );
    }

    return { skipNavigation: Boolean(decision.skipNavigation) };
  }

  /**
   * Resumes an execution that is currently waiting for manual login.
   */
  continueExecution(executionId: number, options?: { skipNavigation?: boolean }): boolean {
    const pending = this.pendingExecutions.get(executionId);
    if (!pending) {
      return false;
    }
    pending.resolve(options);
    return true;
  }

  /**
   * Returns any executions currently paused waiting for manual login.
   */
  listPendingExecutions(): Array<{
    executionId: number;
    appType: string;
    loginUrl: string;
    targetUrl: string;
    startedAt: string;
  }> {
    return Array.from(this.pendingExecutions.values()).map((item) => ({
      executionId: item.executionId,
      appType: item.appType,
      loginUrl: item.loginUrl,
      targetUrl: item.targetUrl,
      startedAt: item.startedAt,
    }));
  }

  async listSessions(): Promise<SavedSessionMeta[]> {
    await this.loadFromDisk();
    const out = new Map<string, SavedSessionMeta>();
    for (const [key, stored] of this.memorySessions.entries()) {
      out.set(key, {
        ...stored.meta,
        windowOpen: this.activeWindows.has(key),
      });
    }
    for (const [key, win] of this.activeWindows.entries()) {
      if (!out.has(key)) {
        let cookieCount = 0;
        let currentUrl = win.targetUrl;
        try {
          cookieCount = (await win.context.cookies()).length;
          currentUrl = win.page.url();
        } catch {
          // ignore if window was closed externally
        }
        out.set(key, {
          profileKey: key,
          targetUrl: win.targetUrl,
          currentUrl,
          cookieCount,
          originCount: 0,
          savedAt: win.openedAt,
          windowOpen: true,
        });
      }
    }
    return Array.from(out.values()).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  async deleteSession(rawProfileKey: string): Promise<void> {
    const profileKey = sanitizeKey(rawProfileKey);
    const active = this.activeWindows.get(profileKey);
    if (active) {
      this.activeWindows.delete(profileKey);
      await active.context.close().catch(() => undefined);
    }
    this.memorySessions.delete(profileKey);
    await unlink(join(this.sessionsDir, `${profileKey}.json`)).catch(() => undefined);
  }

  private async persistSession(profileKey: string, data: StoredSessionFile): Promise<void> {
    this.memorySessions.set(profileKey, data);
    try {
      await mkdir(this.sessionsDir, { recursive: true });
      await writeFile(
        join(this.sessionsDir, `${profileKey}.json`),
        JSON.stringify(data, null, 2),
        "utf8",
      );
    } catch {
      // In-memory store remains available even if disk write fails
    }
  }

  private loadedFromDisk = false;
  private async loadFromDisk(): Promise<void> {
    if (this.loadedFromDisk) return;
    this.loadedFromDisk = true;
    try {
      const files = await readdir(this.sessionsDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const raw = await readFile(join(this.sessionsDir, file), "utf8");
          const parsed = JSON.parse(raw) as StoredSessionFile;
          if (parsed?.meta?.profileKey && parsed?.storageState) {
            this.memorySessions.set(parsed.meta.profileKey, parsed);
          }
        } catch {
          // ignore corrupted session file
        }
      }
    } catch {
      // directory may not exist yet
    }
  }
}
