/**
 * Single source of truth for what this worker can actually do.
 *
 * Phase 1 ships the service skeleton only. Browser automation (Playwright)
 * arrives in Phase 2. The worker reports capabilities honestly and rejects
 * job requests it cannot execute — it never fakes results.
 */
export const WORKER_CAPABILITIES = {
  browserAutomation: false,
  elementDiscovery: false,
  screenshot: false,
  traceRecording: false,
  networkObservation: false,
} as const;

export type WorkerCapability = keyof typeof WORKER_CAPABILITIES;

/** Phase in which browser automation is scheduled to land. */
export const PLANNED_AUTOMATION_PHASE = 2;

export function hasBrowserAutomation(): boolean {
  return WORKER_CAPABILITIES.browserAutomation;
}
