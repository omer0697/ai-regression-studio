import { Badge } from "@/components/ui/badge";
import { statusVisual } from "@/lib/utils";
import type { ExecutionStatus } from "@ars/shared-contracts";

export function StatusBadge({ status }: { status: ExecutionStatus }) {
  const visual = statusVisual(status);
  return <Badge tone={visual.tone}>{visual.label}</Badge>;
}

export function AppTypeBadge({ appType }: { appType: string }) {
  if (appType === "LEGACY_GWT") {
    return <Badge tone="warning">GWT (Eski)</Badge>;
  }
  return <Badge tone="info">React (Yeni)</Badge>;
}
