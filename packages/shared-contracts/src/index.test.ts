import { describe, expect, it } from "vitest";

import {
  EXECUTION_STATUSES,
  isTerminalExecutionStatus,
  WORKER_ERROR_CODES,
} from "./index.js";

describe("shared contracts", () => {
  it("keeps the honest terminal statuses in the status list", () => {
    expect(EXECUTION_STATUSES).toContain("NOT_SUPPORTED");
    expect(isTerminalExecutionStatus("NOT_SUPPORTED")).toBe(true);
    expect(isTerminalExecutionStatus("RUNNING")).toBe(false);
    expect(isTerminalExecutionStatus("CREATED")).toBe(false);
  });

  it("uses only machine-readable worker error codes", () => {
    for (const code of WORKER_ERROR_CODES) {
      expect(code).toMatch(/^WORKER_[A-Z_]+$/);
    }
  });
});
