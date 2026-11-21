"use client";

import { useParams, useRouter } from "next/navigation";

import { IconAlert, IconCheck, IconPlay, IconX } from "@/components/icons";
import { PageHeader, StatCard } from "@/components/page-parts";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useExecution, useStartExecution } from "@/lib/api-hooks";
import { useExecutionStream } from "@/lib/execution-stream";
import {
  MODE_LABELS,
  explainWorkerError,
  formatDate,
  formatDuration,
} from "@/lib/utils";
import type { ExecutionEvent } from "@ars/shared-contracts";

function EventRow({ event }: { event: ExecutionEvent }) {
  const iconByType: Record<string, React.ReactNode> = {
    INFO: <IconPlay className="text-muted-foreground" />,
    STEP: <IconPlay className="text-primary" />,
    WARNING: <IconAlert className="text-warning" />,
    ERROR: <IconAlert className="text-danger" />,
    RESULT: <IconCheck className="text-success" />,
  };

  return (
    <li className="flex items-start gap-3 px-4 py-2.5">
      <span className="mt-0.5">{iconByType[event.type] ?? null}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm">{event.message}</p>
        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
          #{event.seq} · {event.type} · {formatDate(event.createdAt)}
        </p>
      </div>
    </li>
  );
}

export default function ExecutionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const executionId = Number(params?.id);

  const { data: execution } = useExecution(executionId);
  const stream = useExecutionStream(Number.isFinite(executionId) ? executionId : null);

  const startExecution = useStartExecution(execution?.projectId ?? 0);

  // Prefer the fresher stream status while it is connected.
  const status = stream.connected && stream.status ? stream.status : execution?.status;

  const workerExplanation = explainWorkerError(execution?.errorCode ?? null);

  const onRerun = async () => {
    if (!execution) return;
    try {
      const rerunExecution = await startExecution.mutateAsync({
        screenId: execution.screenId,
        mode: execution.mode,
      });
      router.push(`/executions/${rerunExecution.id}`);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "EXECUTION_ALREADY_RUNNING") {
        alert("Bu ekran için hâlen aktif bir çalıştırma var.");
      } else {
        alert("Yeniden çalıştırma başlatılamadı.");
      }
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Çalıştırma #${Number.isFinite(executionId) ? executionId : "?"}`}
        description={
          execution
            ? `${execution.projectName} · ${execution.screenCode} — ${execution.screenName}`
            : "Yükleniyor…"
        }
        actions={
          execution ? (
            <Button variant="secondary" onClick={() => void onRerun()} disabled={startExecution.isPending}>
              Yeniden Çalıştır
            </Button>
          ) : null
        }
      />

      {execution ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={status ?? execution.status} />
            <Badge tone="muted">{MODE_LABELS[execution.mode] ?? execution.mode}</Badge>
            <span className="text-sm text-muted-foreground">
              {formatDate(execution.createdAt)} · Süre:{" "}
              {formatDuration(execution.startedAt, execution.finishedAt)}
            </span>
            <span className="text-sm text-muted-foreground">
              {stream.connected ? "● Canlı akış açık" : "○ Akış beklemede"}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <StatCard label="Toplam Adım" value={execution.totalSteps} />
            <StatCard label="Geçen" value={execution.passedSteps} />
            <StatCard label="Kalan" value={execution.failedSteps} />
            <StatCard label="Atlanan" value={execution.skippedSteps} />
          </div>

          {workerExplanation ? (
            <Card className="border-warning/40">
              <CardHeader className="flex-row items-start gap-2 space-y-0">
                <IconAlert className="mt-0.5 text-warning" />
                <div>
                  <CardTitle>Çalıştırma tamamlanamadı</CardTitle>
                  <CardDescription>{workerExplanation}</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-xs text-muted-foreground">
                  Hata kodu: {execution.errorCode}
                </p>
                {execution.statusMessage ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sistem mesajı: {execution.statusMessage}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Olay Akışı</CardTitle>
              <CardDescription>
                Çalıştırmanın adım adım kaydı. Canlı güncellemeler Server-Sent Events ile akar.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {stream.events.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Henüz olay kaydı yok.
                </p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {stream.events.map((event) => (
                    <EventRow key={event.seq} event={event} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-muted-foreground">
                Ekran Görüntüleri ve Kanıt Dosyaları
              </CardTitle>
              <CardDescription>
                Tarayıcı otomasyonu 2. Fazda devreye girdiğinde burada gerçek
                ekran görüntüleri, trace kayıtları ve kanıt dosyaları listelenecek.
                Şu anda sahte kanıt gösterilmez.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
              <IconX className="text-muted-foreground" />
              Bu çalıştırma için kanıt üretimi henüz yok.
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="h-40 animate-pulse rounded-xl bg-surface-2/50" />
      )}
    </div>
  );
}
