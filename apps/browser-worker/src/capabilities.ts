/**
 * Single source of truth for what this worker can actually do.
 *
 * Phase 2: browser automation is live — Chromium lifecycle, secure form login,
 * GWT/React adapters, element discovery, screenshots, traces and console/
 * network diagnostics. Capabilities are reported honestly and the /api/jobs
 * endpoint refuses job types that are still not implemented.
 */
export const WORKER_CAPABILITIES = {
  browserAutomation: true,
  elementDiscovery: true,
  screenshot: true,
  traceRecording: true,
  networkObservation: true,
} as const;

export type WorkerCapability = keyof typeof WORKER_CAPABILITIES;

/** Phase in which scenario execution/comparison lands. */
export const PLANNED_COMPARISON_PHASE = 5;

export function hasBrowserAutomation(): boolean {
  return WORKER_CAPABILITIES.browserAutomation;
}
