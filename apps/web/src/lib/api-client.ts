import type {
  ApiErrorShape,
  ArtifactInfo,
  BugFindingInfo,
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
  getAiStatus: () =>
    request<{
      configured: boolean;
      baseUrl: string | null;
      model: string | null;
      timeoutSeconds: number | null;
      maxOutputTokens: number | null;
      allowedActions: string[];
      apiKeyPresent: boolean;
    }>("/ai/status"),
  proposeAiPlan: (projectId: number, screenId: number, command: string) =>
    request<ScenarioInfo>(`/projects/${projectId}/screens/${screenId}/ai/plan`, {
      method: "POST",
      body: { command },
    }),
  analyzeExecution: (id: number) =>
    request<{
      id: number;
      kind: string;
      model: string | null;
      status: string;
      hypothesis: string | null;
      output: Record<string, unknown> | null;
    }>(`/executions/${id}/ai/analyze`, { method: "POST" }),
  listScenarios: (projectId?: number) =>
    request<ScenarioInfo[]>(
      projectId ? `/scenarios?projectId=${projectId}` : "/scenarios",
    ),
  approveScenario: (id: number) =>
    request<ScenarioInfo>(`/scenarios/${id}/approve`, { method: "POST" }),
  rejectScenario: (id: number, reason?: string) =>
    request<ScenarioInfo>(`/scenarios/${id}/reject`, {
      method: "POST",
      body: { reason: reason ?? null },
    }),
  listBugs: (status?: string) =>
    request<BugFindingInfo[]>(status ? `/bugs?status=${status}` : "/bugs"),
  listExecutionFindings: (id: number) =>
    request<BugFindingInfo[]>(`/executions/${id}/findings`),
  listExecutionMapping: (id: number) =>
    request<MappingInfo[]>(`/executions/${id}/mapping`),
  updateBugStatus: (id: number, status: "CONFIRMED" | "DISMISSED") =>
    request<BugFindingInfo>(`/bugs/${id}/status`, {
      method: "POST",
      body: { status },
    }),
  comparePdfs: (
    projectId: number,
    pdfA: File,
    pdfB: File,
    screenCode: string,
    expectedFields: string,
  ) => {
    const form = new FormData();
    form.append("pdfA", pdfA);
    form.append("pdfB", pdfB);
    form.append("screenCode", screenCode);
    form.append("expectedFields", expectedFields);
    return fetch(`${API_BASE}/projects/${projectId}/pdf/compare`, {
      method: "POST",
      credentials: "include",
      headers: {
        ...(csrfTokenFromCookie() ? { "X-XSRF-TOKEN": csrfTokenFromCookie() ?? "" } : {}),
      },
      body: form,
    }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) {
        throw new ApiError(
          response.status,
          body.code ?? `HTTP_${response.status}`,
          body.message ?? "PDF karşılaştırması başarısız oldu.",
        );
      }
      return body as PdfComparisonResult;
    });
  },
  listPdfComparisons: (projectId: number) =>
    request<PdfComparisonHistory[]>(`/projects/${projectId}/pdf/comparisons`),
  listRequirements: (projectId: number, screenCode: string) =>
    request<RequirementInfo[]>(
      `/projects/${projectId}/screens/${screenCode}/requirements`,
    ),
  addManualRequirement: (projectId: number, screenCode: string, title: string, content?: string) =>
    request<RequirementInfo>(
      `/projects/${projectId}/screens/${screenCode}/requirements`,
      { method: "POST", body: { title, content: content ?? null } },
    ),
  importRequirements: (projectId: number, screenCode: string, confluencePageId: string) =>
    request<{ imported: number }>(
      `/projects/${projectId}/screens/${screenCode}/requirements/import`,
      { method: "POST", body: { confluencePageId } },
    ),
  analyzeRequirements: (projectId: number, screenCode: string) =>
    request<{ analyzed: number }>(
      `/projects/${projectId}/screens/${screenCode}/requirements/analyze`,
      { method: "POST" },
    ),
  sendChat: (projectId: number, message: string) =>
    request<ChatReply>(`/projects/${projectId}/chat`, {
      method: "POST",
      body: { message },
    }),
  listChat: (projectId: number) =>
    request<ChatReply[]>(`/projects/${projectId}/chat`),
};

export interface RequirementInfo {
  id: number;
  screenCode: string;
  title: string;
  content: string | null;
  confluenceId: string | null;
  sourceUrl: string | null;
  status: "PENDING" | "VERIFIED" | "UNSATISFIED" | "PARTIAL" | "MANUAL_REVIEW";
  coverage: Record<string, unknown> | null;
  createdAt: string;
}

export interface ChatReply {
  id: number;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
}

/** Standalone multipart PDF comparison (fetch-based, CSRF-aware). */
export async function comparePdfs(
  projectId: number,
  pdfA: File,
  pdfB: File,
  screenCode: string,
  expectedFields: string,
): Promise<PdfComparisonResult> {
  return api.comparePdfs(projectId, pdfA, pdfB, screenCode, expectedFields);
}

export interface PdfComparisonResult {
  id: number;
  verdict: "MATCH" | "DIFFERENT" | "ERROR";
  pagesA: number;
  pagesB: number;
  differences: Array<{
    kind: string;
    field: string;
    expected: string;
    actual: string;
    page: number | null;
  }>;
  artifactAId: number;
  artifactBId: number;
  createdAt: string;
}

export interface PdfComparisonHistory {
  id: number;
  screenCode: string | null;
  sourceAName: string;
  sourceBName: string;
  pagesA: number | null;
  pagesB: number | null;
  verdict: string;
  differences: PdfComparisonResult["differences"];
  createdAt: string;
}

export interface MappingInfo {
  id: number;
  legacyRef: string;
  legacyLabel: string | null;
  reactRef: string | null;
  reactLabel: string | null;
  confidence: number;
  method: string;
  needsReview: boolean;
}

export interface ScenarioInfo {
  id: number;
  projectId: number;
  screenId: number;
  name: string;
  description: string | null;
  source: string;
  status: "PROPOSED" | "APPROVED" | "REJECTED" | "EXECUTED";
  plan: Record<string, unknown>;
  proposedBy: string | null;
  approvedBy: string | null;
  createdAt: string;
  approvedAt: string | null;
}

/** Same-origin URL that streams artifact bytes with the session cookie. */
export function artifactContentUrl(artifactId: number): string {
  return `${API_BASE}/artifacts/${artifactId}/content`;
}
