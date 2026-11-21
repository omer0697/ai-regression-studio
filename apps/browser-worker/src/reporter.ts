import type { ArtifactType, ExecutionEventType } from "@ars/shared-contracts";

export interface StatusUpdate {
  status: "RUNNING" | "COMPLETED" | "FAILED";
  statusMessage?: string | null;
  errorCode?: string | null;
  totalSteps?: number;
  passedSteps?: number;
  failedSteps?: number;
  skippedSteps?: number;
}

/**
 * Reports execution progress back to the Spring API over the internal
 * callback channel (authenticated with the shared internal token).
 * Each call retries once on transient failures — a lost event must never
 * abort the browser session.
 */
export class ExecutionReporter {
  constructor(
    private readonly apiBaseUrl: string,
    private readonly internalToken: string,
    private readonly executionId: number,
  ) {}

  async event(type: ExecutionEventType, message: string, payload?: Record<string, unknown>) {
    await this.withRetry(() =>
      this.call("POST", `/api/internal/executions/${this.executionId}/events`, {
        type,
        message,
        payload: payload ?? null,
      }),
    );
  }

  async status(update: StatusUpdate) {
    await this.withRetry(() =>
      this.call("PUT", `/api/internal/executions/${this.executionId}/status`, update),
    );
  }

  async artifact(
    artifactType: ArtifactType,
    displayName: string,
    mimeType: string,
    bytes: Uint8Array,
  ): Promise<void> {
    const path = `/api/internal/executions/${this.executionId}/artifacts?type=${encodeURIComponent(
      artifactType,
    )}&name=${encodeURIComponent(displayName)}`;
    await this.withRetry(() =>
      fetch(`${this.apiBaseUrl}${path}`, {
        method: "POST",
        headers: {
          "X-ARS-Internal-Token": this.internalToken,
          "Content-Type": mimeType,
        },
        body: bytes as unknown as BodyInit,
      }).then(async (response) => {
        if (!response.ok) {
          throw new Error(`Artifact upload failed: HTTP ${response.status}`);
        }
      }),
    );
  }

  async elements(records: Array<Record<string, unknown>>) {
    await this.withRetry(() =>
      this.call("POST", `/api/internal/executions/${this.executionId}/elements`, {
        items: records,
      }),
    );
  }

  async observations(records: Array<Record<string, unknown>>) {
    await this.withRetry(() =>
      this.call("POST", `/api/internal/executions/${this.executionId}/observations`, {
        items: records,
      }),
    );
  }

  async mapping(records: Array<Record<string, unknown>>) {
    await this.withRetry(() =>
      this.call("POST", `/api/internal/executions/${this.executionId}/mapping`, {
        items: records,
      }),
    );
  }

  async findings(records: Array<Record<string, unknown>>) {
    await this.withRetry(() =>
      this.call("POST", `/api/internal/executions/${this.executionId}/findings`, {
        items: records,
      }),
    );
  }

  private async call(method: string, path: string, body: unknown) {
    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      method,
      headers: {
        "X-ARS-Internal-Token": this.internalToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Callback ${method} ${path} failed: HTTP ${response.status}`);
    }
  }

  private async withRetry(operation: () => Promise<void>) {
    try {
      await operation();
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        await operation();
      } catch (retryError) {
        console.warn(
          "[reporter] callback failed after retry:",
          (retryError as Error).message,
        );
      }
    }
  }
}
