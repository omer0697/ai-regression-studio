"use client";

import Link from "next/link";
import { useState } from "react";

import { IconBug } from "@/components/icons";
import { EmptyState, PageHeader } from "@/components/page-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useBugs, useUpdateBugStatus } from "@/lib/api-hooks";
import { formatDate } from "@/lib/utils";
import type { BugFindingInfo } from "@ars/shared-contracts";

const CATEGORY_LABELS: Record<string, string> = {
  FIELD_MISSING: "Eksik Alan",
  STATE_MISMATCH: "Durum Farkı",
  VALUE_MISMATCH: "Değer Farkı",
  DEPENDENCY_MISMATCH: "Bağımlılık Farkı",
  TABLE_MISMATCH: "Tablo Farkı",
};

const STATUS_LABELS: Record<string, string> = {
  DETECTED: "Tespit Edildi",
  CONFIRMED: "Onaylandı",
  DISMISSED: "Yoksayıldı",
};

export default function BugsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const { data: bugs, isLoading } = useBugs(statusFilter || undefined);
  const updateStatus = useUpdateBugStatus();
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Hata Raporları"
        description="Karşılaştırma motorunun kanıtla doğruladığı davranış farkları. Bulgular makine tarafından tespit edilir; onaylama/yok sayma insana aittir."
        actions={
          <div className="flex items-center gap-2">
            {["", "DETECTED", "CONFIRMED", "DISMISSED"].map((status) => (
              <Button
                key={status || "all"}
                size="sm"
                variant={statusFilter === status ? "default" : "ghost"}
                onClick={() => setStatusFilter(status)}
              >
                {status ? STATUS_LABELS[status] : "Tümü"}
              </Button>
            ))}
          </div>
        }
      />

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-surface-2/50" />
      ) : !bugs || bugs.length === 0 ? (
        <EmptyState
          icon={<IconBug width={28} height={28} />}
          title="Kayıtlı bulgu yok"
          description="Bir projede Karşılaştırma (GWT ↔ React) çalıştırması başlatın; tespit edilen davranış farkları burada listelenir."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {bugs.map((bug) => (
            <BugCard
              key={bug.id}
              bug={bug}
              expanded={expanded === bug.id}
              onToggle={() => setExpanded(expanded === bug.id ? null : bug.id)}
              onStatus={(status) => void updateStatus.mutateAsync({ id: bug.id, status })}
              pending={updateStatus.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BugCard({
  bug,
  expanded,
  onToggle,
  onStatus,
  pending,
}: {
  bug: BugFindingInfo;
  expanded: boolean;
  onToggle: () => void;
  onStatus: (status: "CONFIRMED" | "DISMISSED") => void;
  pending: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-primary">
              {bug.bugCode}
            </span>
            <Badge tone={bug.severity === "HIGH" ? "danger" : bug.severity === "MEDIUM" ? "warning" : "muted"}>
              {bug.severity}
            </Badge>
            <Badge tone="info">{CATEGORY_LABELS[bug.category] ?? bug.category}</Badge>
            <Badge tone={bug.status === "CONFIRMED" ? "success" : bug.status === "DISMISSED" ? "muted" : "warning"}>
              {STATUS_LABELS[bug.status] ?? bug.status}
            </Badge>
            <span className="text-xs text-muted-foreground">{bug.screenCode}</span>
          </div>
          <CardTitle className="mt-2 text-base">{bug.title}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDate(bug.createdAt)} ·{" "}
            <Link
              className="text-primary hover:underline"
              href={`/executions/${bug.executionId}`}
            >
              çalıştırma #{bug.executionId}
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {bug.status === "DETECTED" ? (
            <>
              <Button size="sm" disabled={pending} onClick={() => onStatus("CONFIRMED")}>
                Onayla
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => onStatus("DISMISSED")}>
                Yoksay
              </Button>
            </>
          ) : null}
          <Button size="sm" variant="ghost" onClick={onToggle}>
            {expanded ? "Detayı Gizle" : "Detayı Gör"}
          </Button>
        </div>
      </CardHeader>
      {expanded ? (
        <CardContent className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-success/40 bg-success/10 p-3 text-sm">
              <p className="mb-1 text-xs font-semibold uppercase text-success">
                Beklenen (GWT)
              </p>
              {bug.expectedBehavior ?? "—"}
            </div>
            <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm">
              <p className="mb-1 text-xs font-semibold uppercase text-danger">
                Gerçekleşen (React)
              </p>
              {bug.actualBehavior ?? "—"}
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Yeniden Üretim
            </p>
            <pre className="max-h-40 overflow-auto rounded-lg bg-surface-2/60 p-3 font-mono text-xs">
              {JSON.stringify(bug.reproduction, null, 2)}
            </pre>
          </div>
          {bug.evidenceArtifacts && bug.evidenceArtifacts.length > 0 ? (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Kanıt Dosyaları
              </p>
              <div className="flex flex-wrap gap-2">
                {bug.evidenceArtifacts.map((name) => (
                  <Badge key={name} tone="muted">
                    {name}
                  </Badge>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Ekran görüntüleri{" "}
                <Link
                  className="text-primary hover:underline"
                  href={`/executions/${bug.executionId}`}
                >
                  çalıştırma detayında
                </Link>{" "}
                yan yana görünür.
              </p>
            </div>
          ) : null}
          {bug.aiHypothesis ? (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <p className="mb-1 text-xs font-semibold uppercase text-warning">
                AI Kök-Neden Hipotezi (gözlem değil — hipotez)
              </p>
              {bug.aiHypothesis}
            </div>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}
