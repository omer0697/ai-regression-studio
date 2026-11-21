import type {
  ApiErrorShape,
  ArtifactInfo,
  DashboardData,
  DiscoveredElementRecord,
  DependencyObservation,
  EnvironmentConfig,
  ExecutionEventListResponse,
  ExecutionSummary,
  ProjectDetail,
  ProjectSummary,
  ScreenDefinition,
  SessionResponse,
} from "@ars/shared-contracts";

/**
 * API base. Same-origin by default: requests go through the Next.js rewrite
 * (`/backend/*` -> `${API_PROXY_TARGET}/api/*`) so session cookies and CSRF
 * work without cross-site cookie configuration. Set NEXT_PUBLIC_API_BASE_URL
 * to call the API directly (requires CORS + SameSite=None; see docs).
 */
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "/backend").replace(
  /\/$/,
  "",
);

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors?: Record<string, string>;

  constructor(
    status: number,
    code: string,
    message: string,
    fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

function csrfTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  // Prefer the namespaced cookie; fall back to the legacy name for
  // compatibility with sessions opened before the rename.
  const match =
    document.cookie.match(/(?:^|;\s*)ARS-XSRF-TOKEN=([^;]+)/) ??
    document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}, retryOnCsrf = true): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json" };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (method !== "GET") {
    const csrf = csrfTokenFromCookie();
    if (csrf) headers["X-XSRF-TOKEN"] = csrf;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: "include",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 204) {
    return undefined as T;
  }

  let envelope: Partial<ApiErrorShape> & { items?: unknown } = {};
  const text = await response.text();
  if (text) {
    try {
      envelope = JSON.parse(text) as Partial<ApiErrorShape>;
    } catch {
      // Non-JSON body (e.g. HTML from a proxy) — fall through to generic error.
    }
  }

  if (!response.ok) {
    // Self-healing CSRF: a stale/missing token (e.g. browser had the page open
    // across an API restart) is repaired by fetching a fresh cookie once and
    // retrying the same mutation.
    const csrfRejected = response.status === 403 && method !== "GET";
    if (csrfRejected && retryOnCsrf) {
      try {
        await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
      } catch {
        // ignore — fall through to the thrown error
      }
      return request<T>(path, options, false);
    }
    throw new ApiError(
      response.status,
      envelope.code ?? `HTTP_${response.status}`,
      envelope.message ?? `İstek başarısız oldu (HTTP ${response.status}).`,
      envelope.fieldErrors ?? undefined,
    );
  }

  return envelope as T;
}

export const api = {
  // ---- Session ----
  getSession: () => request<SessionResponse>("/auth/me"),
  login: (username: string, password: string) =>
    request<void>("/auth/login", { method: "POST", body: { username, password } }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),

  // ---- Dashboard ----
  getDashboard: () => request<DashboardData>("/dashboard"),

  // ---- Projects ----
  listProjects: () => request<{ items: ProjectSummary[] }>("/projects"),
  getProject: (id: number) => request<ProjectDetail>(`/projects/${id}`),
  createProject: (body: { name: string; description?: string; environmentName: string }) =>
    request<ProjectDetail>("/projects", { method: "POST", body }),
  updateProject: (
    id: number,
    body: { name?: string; description?: string; environmentName?: string; active?: boolean },
  ) => request<ProjectDetail>(`/projects/${id}`, { method: "PUT", body }),
  deleteProject: (id: number) => request<void>(`/projects/${id}`, { method: "DELETE" }),

  // ---- Environments ----
  listEnvironments: (projectId: number) =>
    request<{ items: EnvironmentConfig[] }>(`/projects/${projectId}/environments`),
  createEnvironment: (projectId: number, body: Record<string, unknown>) =>
    request<EnvironmentConfig>(`/projects/${projectId}/environments`, {
      method: "POST",
      body,
    }),
  updateEnvironment: (projectId: number, envId: number, body: Record<string, unknown>) =>
    request<EnvironmentConfig>(`/projects/${projectId}/environments/${envId}`, {
      method: "PUT",
      body,
    }),
  deleteEnvironment: (projectId: number, envId: number) =>
    request<void>(`/projects/${projectId}/environments/${envId}`, { method: "DELETE" }),

  // ---- Screens ----
  listScreens: (projectId: number) =>
    request<{ items: ScreenDefinition[] }>(`/projects/${projectId}/screens`),
  createScreen: (projectId: number, body: Record<string, unknown>) =>
    request<ScreenDefinition>(`/projects/${projectId}/screens`, {
      method: "POST",
      body,
    }),
  updateScreen: (projectId: number, screenId: number, body: Record<string, unknown>) =>
    request<ScreenDefinition>(`/projects/${projectId}/screens/${screenId}`, {
      method: "PUT",
      body,
    }),
  deleteScreen: (projectId: number, screenId: number) =>
    request<void>(`/projects/${projectId}/screens/${screenId}`, { method: "DELETE" }),

  // ---- Executions ----
  listExecutions: () => request<{ items: ExecutionSummary[] }>("/executions"),
  listProjectExecutions: (projectId: number) =>
    request<{ items: ExecutionSummary[] }>(`/projects/${projectId}/executions`),
  getExecution: (id: number) => request<ExecutionSummary>(`/executions/${id}`),
  startExecution: (projectId: number, body: { screenId: number; mode: string }) =>
    request<ExecutionSummary>(`/projects/${projectId}/executions`, {
      method: "POST",
      body,
    }),
  listExecutionEvents: (id: number, from = 0) =>
    request<ExecutionEventListResponse>(`/executions/${id}/events?from=${from}`),
  listExecutionArtifacts: (id: number) =>
    request<ArtifactInfo[]>(`/executions/${id}/artifacts`),
  listExecutionElements: (id: number) =>
    request<DiscoveredElementRecord[]>(`/executions/${id}/elements`),
  listExecutionObservations: (id: number) =>
    request<DependencyObservation[]>(`/executions/${id}/observations`),
};

/** Same-origin URL that streams artifact bytes with the session cookie. */
export function artifactContentUrl(artifactId: number): string {
  return `${API_BASE}/artifacts/${artifactId}/content`;
}
