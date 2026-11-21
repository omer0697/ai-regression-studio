"use client";

import Link from "next/link";
import { useState } from "react";

import { IconBug, IconCheck, IconChevronRight, IconX } from "@/components/icons";
import { EmptyState, PageHeader } from "@/components/page-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
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

const SEVERITY_LABELS: Record<string, string> = {
  HIGH: "Yüksek",
  MEDIUM: "Orta",
  LOW: "Düşük",
};

const SEVERITY_STYLES: Record<string, { edge: string; badge: "danger" | "warning" | "muted" }> = {
  HIGH: { edge: "border-l-4 border-l-danger", badge: "danger" },
  MEDIUM: { edge: "border-l-4 border-l-warning", badge: "warning" },
  LOW: { edge: "border-l-4 border-l-border-subtle", badge: "muted" },
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function ReproductionBlock({ reproduction }: { reproduction: Record<string, unknown> | null }) {
  const entries = reproduction ? Object.entries(reproduction) : [];
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Yeniden üretim adımı kaydı yok.</p>;
  }
  return (
    <dl className="flex flex-col gap-2">
      {entries.map(([key, value]) => (
        <div
          key={key}
          className="grid gap-1 rounded-lg border border-border-subtle bg-surface-2/40 px-3 py-2 sm:grid-cols-[180px_1fr] sm:gap-3"
        >
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {key}
          </dt>
          <dd className="whitespace-pre-wrap break-words font-mono text-xs text-foreground">
            {formatValue(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function BugCard({
  bug,
  onStatus,
  pending,
}: {
  bug: BugFindingInfo;
  onStatus: (status: "CONFIRMED" | "DISMISSED") => void;
  pending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const severity = SEVERITY_STYLES[bug.severity] ?? SEVERITY_STYLES.LOW;

  return (
    <article
      className={`flex flex-col gap-4 rounded-xl border border-border-subtle bg-surface p-4 ${severity.edge} ${
        bug.severity === "HIGH" ? "bg-danger/5" : ""
      }`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-primary/15 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
              {bug.bugCode}
            </span>
            <Badge tone={severity.badge}>
              {SEVERITY_LABELS[bug.severity] ?? bug.severity} Ağırlık
            </Badge>
            <Badge tone="info">{CATEGORY_LABELS[bug.category] ?? bug.category}</Badge>
            <Badge
              tone={
                bug.status === "CONFIRMED"
                  ? "success"
                  : bug.status === "DISMISSED"
                    ? "muted"
                    : "warning"
              }
            >
              {STATUS_LABELS[bug.status] ?? bug.status}
            </Badge>
          </div>
          <h3 className="mt-2 text-base font-semibold leading-snug">{bug.title}</h3>
        </div>

        {bug.status === "DETECTED" ? (
          <div className="flex shrink-0 gap-2">
            <Button size="sm" disabled={pending} onClick={() => onStatus("CONFIRMED")}>
              <IconCheck className="text-success" />
              Onayla
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => onStatus("DISMISSED")}
            >
              <IconX />
              Yoksay
            </Button>
          </div>
        ) : null}
      </header>

      <div className="grid items-stretch gap-2 lg:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-lg border border-success/30 bg-success/5 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-success">
            Eski (GWT) — Beklenen
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
            {bug.expectedBehavior ?? "Kayıt yok."}
          </p>
        </div>
        <div className="flex items-center justify-center text-lg text-muted-foreground">
          <IconChevronRight width={22} height={22} />
        </div>
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-danger">
            Yeni (React) — Gerçekleşen
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
            {bug.actualBehavior ?? "Kayıt yok."}
          </p>
        </div>
      </div>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          Ekran: <span className="font-mono text-foreground">{bug.screenCode}</span>
        </span>
        <Link className="text-primary hover:underline" href={`/executions/${bug.executionId}`}>
          Çalıştırma #{bug.executionId} →
        </Link>
        <span>{formatDate(bug.createdAt)}</span>
        {(bug.evidenceArtifacts ?? []).length > 0 ? (
          <span>
            {(bug.evidenceArtifacts ?? []).length} kanıt dosyası
            {expanded ? ":" : ""}
          </span>
        ) : null}
      </footer>

      <button
        className="flex w-fit items-center gap-1 text-xs font-medium text-primary hover:underline"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? "Detayı gizle" : "Yeniden üretim ve kanıtları göster"}
        <span className={expanded ? "rotate-90 transition-transform" : "transition-transform"}>
          <IconChevronRight width={14} height={14} />
        </span>
      </button>

      {expanded ? (
        <div className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-surface-2/30 p-3">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Yeniden Üretim
            </p>
            <ReproductionBlock reproduction={bug.reproduction} />
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Kanıt Dosyaları
            </p>
            {(bug.evidenceArtifacts ?? []).length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {(bug.evidenceArtifacts ?? []).map((name) => (
                  <Badge key={name} tone="muted">
                    {name}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Kanıt dosyası kaydı yok.</p>
            )}
          </div>

          {bug.aiHypothesis ? (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs">
              <p className="mb-1 font-semibold text-warning">AI Hipotezi (gözlem değil)</p>
              <p className="whitespace-pre-wrap text-foreground">{bug.aiHypothesis}</p>
            </div>
          ) : null}

          {bug.status !== "DETECTED" ? (
            <p className="text-xs text-muted-foreground">
              Bu bulgu {bug.status === "CONFIRMED" ? "onaylandı" : "yoksayıldı"} — karar geçmişi
              çalıştırma raporunda tutulur.
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export default function BugsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const { data: bugs, isLoading } = useBugs(statusFilter || undefined);
  const updateStatus = useUpdateBugStatus();

  const filtered = (bugs ?? []).filter((bug) => {
    if (severityFilter && bug.severity !== severityFilter) return false;
    if (categoryFilter && bug.category !== categoryFilter) return false;
    return true;
  });

  const categories = [...new Set((bugs ?? []).map((bug) => bug.category))];
  const highCount = filtered.filter((bug) => bug.severity === "HIGH").length;
  const mediumCount = filtered.filter((bug) => bug.severity === "MEDIUM").length;
  const lowCount = filtered.filter((bug) => bug.severity === "LOW").length;

  const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 } as Record<string, number>;
  const sorted = [...filtered].sort(
    (a, b) =>
      (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9) ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Hata Raporları"
        description="Karşılaştırma motorunun kanıtla doğruladığı davranış farkları — eski (GWT) beklenen, yeni (React) gerçekleşen davranıştır. Onaylama/yok sayma insan kararıdır."
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border-subtle bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Toplam</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{filtered.length}</p>
        </div>
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-danger">Yüksek Ağırlık</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-danger">{highCount}</p>
        </div>
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-warning">Orta Ağırlık</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-warning">{mediumCount}</p>
        </div>
        <div className="rounded-xl border border-border-subtle bg-surface-2/50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Düşük Ağırlık
          </p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{lowCount}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex flex-wrap gap-1">
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
        <Select
          aria-label="Ağırlık filtresi"
          className="h-8 w-36 text-xs"
          value={severityFilter}
          onChange={(event) => setSeverityFilter(event.target.value)}
        >
          <option value="">Ağırlık: Tümü</option>
          <option value="HIGH">Yüksek</option>
          <option value="MEDIUM">Orta</option>
          <option value="LOW">Düşük</option>
        </Select>
        <Select
          aria-label="Kategori filtresi"
          className="h-8 w-48 text-xs"
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
        >
          <option value="">Kategori: Tümü</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {CATEGORY_LABELS[category] ?? category}
            </option>
          ))}
        </Select>
      </div>

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-surface-2/50" />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={<IconBug width={28} height={28} />}
          title="Kayda değer bulgu yok"
          description="Bir projede Karşılaştırma veya Kombinasyon çalıştırması başlatın; tespit edilen davranış farkları burada listelenir."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {sorted.map((bug) => (
            <BugCard
              key={bug.id}
              bug={bug}
              onStatus={(status) => void updateStatus.mutateAsync({ id: bug.id, status })}
              pending={updateStatus.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
