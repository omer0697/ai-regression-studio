"use client";

import { useEffect, useRef, useState } from "react";

import { API_BASE } from "@/lib/api-client";
import type { ExecutionEvent, ExecutionStatus } from "@ars/shared-contracts";

interface StreamState {
  events: ExecutionEvent[];
  status: ExecutionStatus | null;
  connected: boolean;
}

/**
 * Subscribes to the execution event stream (SSE).
 *
 * Falls back to the JSON snapshot endpoint if EventSource cannot connect,
 * so the UI still shows recorded events without a live stream.
 */
export function useExecutionStream(executionId: number | null) {
  const [state, setState] = useState<StreamState>({
    events: [],
    status: null,
    connected: false,
  });
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (executionId == null) return;

    let disposed = false;
    const source = new EventSource(`${API_BASE}/executions/${executionId}/events?from=0`, {
      withCredentials: true,
    });
    sourceRef.current = source;

    source.onopen = () => {
      if (!disposed) setState((prev) => ({ ...prev, connected: true }));
    };

    source.addEventListener("event", (raw) => {
      if (disposed) return;
      try {
        const event = JSON.parse((raw as MessageEvent<string>).data) as ExecutionEvent;
        setState((prev) => ({
          ...prev,
          connected: true,
          events: mergeEvent(prev.events, event),
        }));
      } catch {
        // Ignore malformed frames; the snapshot refetch covers gaps.
      }
    });

    source.addEventListener("status", (raw) => {
      if (disposed) return;
      try {
        const payload = JSON.parse((raw as MessageEvent<string>).data) as { status: ExecutionStatus };
        setState((prev) => ({ ...prev, connected: true, status: payload.status }));
      } catch {
        // ignore
      }
    });

    source.onerror = () => {
      if (disposed) return;
      setState((prev) => ({ ...prev, connected: false }));
      // EventSource retries automatically; while disconnected we refresh the
      // snapshot so nothing is lost permanently.
      void snapshotRefresh();
    };

    async function snapshotRefresh() {
      try {
        const response = await fetch(`${API_BASE}/executions/${executionId}/events?from=0`, {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) return;
        const body = (await response.json()) as { items: ExecutionEvent[] };
        if (disposed) return;
        setState((prev) => ({ ...prev, events: mergeAll(prev.events, body.items) }));
      } catch {
        // Offline — keep whatever we have; EventSource will retry.
      }
    }

    void snapshotRefresh();

    return () => {
      disposed = true;
      source.close();
      sourceRef.current = null;
    };
  }, [executionId]);

  return state;
}

function mergeEvent(existing: ExecutionEvent[], incoming: ExecutionEvent): ExecutionEvent[] {
  const lastSeq = existing.length > 0 ? existing[existing.length - 1].seq : 0;
  if (incoming.seq <= lastSeq) return existing;
  return [...existing, incoming];
}

function mergeAll(existing: ExecutionEvent[], incoming: ExecutionEvent[]): ExecutionEvent[] {
  if (incoming.length === 0) return existing;
  const map = new Map<number, ExecutionEvent>();
  for (const event of existing) map.set(event.seq, event);
  for (const event of incoming) map.set(event.seq, event);
  return [...map.values()].sort((a, b) => a.seq - b.seq).slice(-500);
}
