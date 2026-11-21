/** Worker configuration — all values come from the environment. */
export interface WorkerConfig {
  port: number;
  host: string;
  /** Run Chromium headless (default) or visibly for debugging. */
  headless: boolean;
  /** Spring API base URL for execution callbacks. */
  apiBaseUrl: string;
  /** Shared secret for /api/internal/** endpoints. */
  internalToken: string;
  /** Local credential store (reference name -> test account), git-ignored. */
  credentialsFile: string;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

export function loadConfig(): WorkerConfig {
  return {
    port: Number(process.env.WORKER_PORT ?? 9100),
    host: process.env.WORKER_HOST ?? "0.0.0.0",
    headless: envBool("WORKER_HEADLESS", true),
    apiBaseUrl: (process.env.WORKER_API_BASE_URL ?? "http://localhost:8080").replace(/\/$/, ""),
    internalToken: process.env.WORKER_INTERNAL_TOKEN ?? "ars-dev-internal-token",
    credentialsFile: process.env.WORKER_CREDENTIALS_FILE ?? "credentials.local.json",
  };
}
