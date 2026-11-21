import { describe, expect, it } from "vitest";

import { formatDate, formatDuration, statusVisual } from "./utils";

describe("formatDate", () => {
  it("formats ISO timestamps in Turkish locale", () => {
    const result = formatDate("2026-11-21T09:30:00Z");
    expect(result).not.toBe("—");
    expect(typeof result).toBe("string");
  });

  it("returns a dash for empty input", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("not-a-date")).toBe("—");
  });
});

describe("formatDuration", () => {
  it("computes duration between start and finish", () => {
    const duration = formatDuration("2026-11-21T09:00:00Z", "2026-11-21T09:00:45Z");
    expect(duration).toBe("45 sn");
  });

  it("returns a dash when the execution is still running", () => {
    expect(formatDuration("2026-11-21T09:00:00Z", null)).toBe("—");
  });
});

describe("statusVisual", () => {
  it("maps every status to a Turkish label with a tone", () => {
    expect(statusVisual("RUNNING").label).toBe("Çalışıyor");
    expect(statusVisual("NOT_SUPPORTED").label).toBe("Desteklenmiyor");
    expect(statusVisual("COMPLETED").tone).toBe("success");
    expect(statusVisual("FAILED").tone).toBe("danger");
  });
});
