/**
 * Shared contracts between the Next.js web app and the browser worker.
 *
 * These types mirror the Spring Boot API DTOs. Keep both sides in sync;
 * the API is the source of truth (see apps/api dto package).
 */

/** Application type under test. */
export const APP_TYPES = ["LEGACY_GWT", "REACT"] as const;
export type AppType = (typeof APP_TYPES)[number];

/** How the worker authenticates into the application under test. */
export const AUTH_METHODS = ["NONE", "TEST_ACCOUNT_FORM"] as const;
export type AuthMethod = (typeof AUTH_METHODS)[number];

/** Platform user roles (RBAC). */
export const USER_ROLES = ["ADMIN", "TESTER", "VIEWER"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Lifecycle of a test execution. */
export const EXECUTION_STATUSES = [
  "CREATED",
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "NOT_SUPPORTED",
  "ERROR",
  "CANCELLED",
] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

/** NOT_SUPPORTED/... are terminal states; the platform never fakes results. */
export function isTerminalExecutionStatus(status: ExecutionStatus): boolean {
  return (
    status === "COMPLETED" ||
    status === "FAILED" ||
    status === "NOT_SUPPORTED" ||
    status === "ERROR" ||
    status === "CANCELLED"
  );
}

/** What an execution does. */
export const EXECUTION_MODES = ["DISCOVERY", "COMPARISON", "COMBINATION"] as const;
export type ExecutionMode = (typeof EXECUTION_MODES)[number];

/** Execution event types streamed over SSE. */
export const EXECUTION_EVENT_TYPES = ["INFO", "STEP", "WARNING", "ERROR", "RESULT"] as const;
export type ExecutionEventType = (typeof EXECUTION_EVENT_TYPES)[number];

/**
 * Structured error codes the API returns for worker dispatch problems.
 * The UI maps these to Turkish explanations; they are never hidden.
 */
export const WORKER_ERROR_CODES = [
  "WORKER_NOT_CONFIGURED",
  "WORKER_CAPABILITY_NOT_IMPLEMENTED",
  "WORKER_UNAVAILABLE",
  "WORKER_UNEXPECTED_RESPONSE",
] as const;
export type WorkerErrorCode = (typeof WORKER_ERROR_CODES)[number];

export interface SessionUser {
  username: string;
  displayName: string;
  role: UserRole;
}

export interface SessionResponse {
  user: SessionUser | null;
}

export interface ProjectSummary {
  id: number;
  name: string;
  description: string | null;
  environmentName: string;
  active: boolean;
  createdAt: string;
  environmentCount: number;
  screenCount: number;
  executionCount: number;
}

export interface EnvironmentConfig {
  id: number;
  projectId: number;
  appType: AppType;
  displayName: string;
  baseUrl: string;
  environmentLabel: string;
  authMethod: AuthMethod;
  /** Reference name only — never a secret value. */
  credentialReference: string | null;
  loginUrl: string | null;
  usernameSelector: string | null;
  passwordSelector: string | null;
  submitSelector: string | null;
  allowedDomains: string[];
  allowedActions: string[];
  prohibitedActions: string[];
  browserTimeoutMs: number;
  /** Budget for safe interactive exploration (0 = disabled). */
  explorationMaxInteractions: number;
  /** Max options tried per interaction during exploration. */
  explorationMaxOptions: number;
  screenshotEnabled: boolean;
  createdAt: string;
}

export interface ScreenDefinition {
  id: number;
  projectId: number;
  screenCode: string;
  name: string;
  legacyRoute: string | null;
  reactRoute: string | null;
  navigationNotes: string | null;
  active: boolean;
  createdAt: string;
}

export interface ProjectDetail {
  id: number;
  name: string;
  description: string | null;
  environmentName: string;
  active: boolean;
  createdAt: string;
  environmentCount: number;
  screenCount: number;
  executionCount: number;
  environments: EnvironmentConfig[];
  screens: ScreenDefinition[];
}

export interface ExecutionSummary {
  id: number;
  projectId: number;
  projectName: string;
  screenId: number;
  screenCode: string;
  screenName: string;
  mode: ExecutionMode;
  status: ExecutionStatus;
  errorCode: string | null;
  statusMessage: string | null;
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  skippedSteps: number;
  createdBy: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ExecutionEvent {
  seq: number;
  type: ExecutionEventType;
  message: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface ExecutionEventListResponse {
  items: ExecutionEvent[];
}

export interface WorkerStatus {
  configured: boolean;
  reachable: boolean;
  detail: string | null;
  capabilities: Record<string, boolean>;
}

export interface DashboardData {
  totalProjects: number;
  activeProjects: number;
  totalExecutions: number;
  worker: WorkerStatus;
  recentExecutions: ExecutionSummary[];
}

/** Standard API error envelope. */
export interface ApiErrorShape {
  code: string;
  message: string;
  fieldErrors?: Record<string, string> | null;
}

/** SSE payload pushed by GET /executions/{id}/events (Accept: text/event-stream). */
export interface SseExecutionEvent {
  kind: "event" | "status";
  event?: ExecutionEvent;
  status?: ExecutionStatus;
}

/**
 * Normalized record for a discovered element (Phase 2 discovery output).
 * Shared between the worker (producer) and the API (persistence contract).
 */
export interface DiscoveredElementRecord {
  ref: string;
  label: string | null;
  elementType: string;
  accessibleName: string | null;
  value: string | null;
  enabled: boolean;
  visible: boolean;
  required: boolean | null;
  options: string[] | null;
  /** Playwright-ready CSS selector hints (id, name, aria). */
  locatorCandidates: string[] | null;
  /** Form group name (radios/checkboxes share it) — worker-side metadata. */
  name: string | null;
  domPath: string | null;
  confidence: number;
}

export interface DiscoveredElementListResponse {
  items: DiscoveredElementRecord[];
}

export const ARTIFACT_TYPES = ["SCREENSHOT", "TRACE", "CONSOLE_LOG", "NETWORK_LOG"] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export interface ArtifactInfo {
  id: number;
  executionId: number;
  artifactType: ArtifactType;
  displayName: string;
  byteSize: number | null;
  createdAt: string;
}

export interface BugFindingInfo {
  id: number;
  bugCode: string;
  projectId: number;
  executionId: number;
  screenCode: string;
  category: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  expectedBehavior: string | null;
  actualBehavior: string | null;
  reproduction: Record<string, unknown> | null;
  evidenceArtifacts: string[] | null;
  aiHypothesis: string | null;
  status: "DETECTED" | "CONFIRMED" | "DISMISSED";
  createdAt: string;
}

/**
 * A dependency observation from Phase 3 interaction exploration:
 * "applying interaction X on source changed attribute A of affected element
 * from before to after; the screen was reverted afterwards".
 */
export interface DependencyObservation {
  id: number;
  executionId: number;
  appType: string;
  screenCode: string;
  sourceRef: string;
  sourceLabel: string | null;
  interaction: "selectOption" | "setCheckbox" | "chooseRadio";
  value: string | null;
  affectedRef: string;
  affectedLabel: string | null;
  attribute: "enabled" | "visible" | "value" | "options" | "required";
  beforeValue: string | null;
  afterValue: string | null;
  reverted: boolean;
  observedAt: string;
}
