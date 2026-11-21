"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { IconAlert, IconCheck, IconPlay } from "@/components/icons";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useExecution,
  useExecutionArtifacts,
  useExecutionElements,
  useExecutionFindings,
  useExecutionObservations,
  useStartExecution,
} from "@/lib/api-hooks";
import { artifactContentUrl, API_BASE } from "@/lib/api-client";
import { useExecutionStream } from "@/lib/execution-stream";
import {
  MODE_LABELS,
  explainWorkerError,
  formatDate,
  formatDuration,
} from "@/lib/utils";
import type { ExecutionEvent } from "@ars/shared-contracts";

const INTERACTION_LABELS: Record<string, string> = {
  selectOption: "seçim",
  setCheckbox: "checkbox",
  chooseRadio: "radyo",
};

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
  const { data: artifacts } = useExecutionArtifacts(executionId);
  const { data: elements } = useExecutionElements(executionId);
  const { data: observations } = useExecutionObservations(executionId);
  const { data: findings } = useExecutionFindings(executionId);
  const stream = useExecutionStream(Number.isFinite(executionId) ? executionId : null);

  const startExecution = useStartExecution(execution?.projectId ?? 0);

  // Prefer the fresher stream status while it is connected.
  const status = stream.connected && stream.status ? stream.status : execution?.status;
  const reportBase = `${API_BASE}/executions/${executionId}`;

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
            <div className="flex items-center gap-2">
              <a
                className="inline-flex h-9 items-center rounded-lg border border-border-subtle bg-surface-2 px-4 text-sm font-medium hover:bg-surface-2/70"
                href={`${reportBase}/report`}
                target="_blank"
                rel="noreferrer"
              >
                Rapor (JSON)
              </a>
              <a
                className="inline-flex h-9 items-center rounded-lg border border-border-subtle bg-surface-2 px-4 text-sm font-medium hover:bg-surface-2/70"
                href={`${reportBase}/report.pdf`}
                target="_blank"
                rel="noreferrer"
              >
                Rapor (PDF)
              </a>
              <Button variant="secondary" onClick={() => void onRerun()} disabled={startExecution.isPending}>
                Yeniden Çalıştır
              </Button>
            </div>
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

          <Card>
            <CardHeader>
              <CardTitle>Bağımlılık Gözlemleri</CardTitle>
              <CardDescription>
                Güvenli etkileşim keşfinin bulguları: her satırda bir etkileşimin
                hangi alanın hangi özelliğini değiştirdiği ve ekranın ardından
                orijinale döndürüldüğü yer alır. İş eylemi hiçbir zaman
                gerçekleştirilmez.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {!observations || observations.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Bu çalıştırmada bağımlılık gözlemi yok.
                </p>
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Etkileşim</TableHead>
                        <TableHead>Etkilenen Alan</TableHead>
                        <TableHead>Özellik</TableHead>
                        <TableHead>Önce → Sonra</TableHead>
                        <TableHead>Durum</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {observations.map((observation) => (
                        <TableRow key={observation.id}>
                          <TableCell className="max-w-56">
                            <span className="font-mono text-xs text-primary">
                              {observation.sourceRef}
                            </span>{" "}
                            <span className="text-xs text-muted-foreground">
                              {INTERACTION_LABELS[observation.interaction] ??
                                observation.interaction}
                              {observation.value ? ` '${observation.value}'` : ""}
                            </span>
                            <p className="truncate text-xs text-muted-foreground">
                              {observation.sourceLabel ?? ""}
                            </p>
                          </TableCell>
                          <TableCell className="max-w-48">
                            <span className="font-mono text-xs text-primary">
                              {observation.affectedRef}
                            </span>{" "}
                            <span className="text-xs">
                              {observation.affectedLabel ?? ""}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {observation.attribute}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            <span className="text-danger">{observation.beforeValue ?? "—"}</span>
                            <span className="mx-1 text-muted-foreground">→</span>
                            <span className="text-success">{observation.afterValue ?? "—"}</span>
                          </TableCell>
                          <TableCell>
                            <Badge tone={observation.reverted ? "success" : "warning"}>
                              {observation.reverted ? "geri alındı" : "geri dönüş doğrulanamadı"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {findings && findings.length > 0 ? (
            <Card className="border-danger/40">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Tespit Edilen Davranış Farkları</CardTitle>
                  <CardDescription>
                    {findings.length} kanıt destekli bulgu — GWT beklenen davranışı,
                    React gerçekleşen davranışı temsil eder. Onaylama/yok sayma Hata
                    Raporları sayfasında yapılır.
                  </CardDescription>
                </div>
                <Link className="text-sm text-primary hover:underline" href="/bugs">
                  Hata Raporları →
                </Link>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {findings.map((finding) => (
                  <div
                    key={finding.id}
                    className={`flex flex-col gap-2 rounded-lg border border-border-subtle px-3 py-2.5 ${
                      finding.severity === "HIGH"
                        ? "border-l-4 border-l-danger bg-danger/5"
                        : finding.severity === "MEDIUM"
                          ? "border-l-4 border-l-warning"
                          : "border-l-4 border-l-border-subtle"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-primary/15 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                        {finding.bugCode}
                      </span>
                      <Badge
                        tone={
                          finding.severity === "HIGH"
                            ? "danger"
                            : finding.severity === "MEDIUM"
                              ? "warning"
                              : "muted"
                        }
                      >
                        {finding.severity === "HIGH"
                          ? "Yüksek"
                          : finding.severity === "MEDIUM"
                            ? "Orta"
                            : "Düşük"}
                      </Badge>
                      <p className="min-w-0 flex-1 text-sm font-medium">{finding.title}</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <p className="rounded-md border border-success/30 bg-success/5 px-2.5 py-1.5 text-xs">
                        <span className="font-semibold text-success">GWT beklenen:</span>{" "}
                        <span className="text-foreground">
                          {finding.expectedBehavior ?? "Kayıt yok."}
                        </span>
                      </p>
                      <p className="rounded-md border border-danger/30 bg-danger/5 px-2.5 py-1.5 text-xs">
                        <span className="font-semibold text-danger">React gerçekleşen:</span>{" "}
                        <span className="text-foreground">
                          {finding.actualBehavior ?? "Kayıt yok."}
                        </span>
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Keşfedilen Elemanlar</CardTitle>
              <CardDescription>
                Worker tarafından gerçek tarayıcı oturumundan normalize edilmiş
                alan kayıtları. Gizli alanlar kaydedilir ama &quot;atlandı&quot; olarak
                sayılır; sahte kayıt üretilmez.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {!elements || elements.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Henüz keşif sonucu yok.
                </p>
              ) : (
                <div className="max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ref</TableHead>
                        <TableHead>Etiket</TableHead>
                        <TableHead>Tip</TableHead>
                        <TableHead>Değer</TableHead>
                        <TableHead>Durum</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {elements.map((element) => (
                        <TableRow key={element.ref}>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {element.ref}
                          </TableCell>
                          <TableCell className="max-w-48 truncate">
                            {element.label ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {element.elementType}
                          </TableCell>
                          <TableCell className="max-w-48 truncate text-muted-foreground">
                            {element.value ?? "—"}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              <Badge tone={element.enabled ? "success" : "muted"}>
                                {element.enabled ? "etkin" : "pasif"}
                              </Badge>
                              <Badge tone={element.visible ? "info" : "warning"}>
                                {element.visible ? "görünür" : "gizli"}
                              </Badge>
                              {element.required ? <Badge tone="danger">zorunlu</Badge> : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Kanıtlar</CardTitle>
              <CardDescription>
                Gerçek tarayıcı oturumundan üretilen ekran görüntüleri, trace
                kayıtları ve tanılama dosyaları.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!artifacts || artifacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Bu çalıştırma için henüz kanıt üretilmedi.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  {artifacts
                    .filter((artifact) => artifact.artifactType === "SCREENSHOT")
                    .map((artifact) => (
                      <figure key={artifact.id} className="flex flex-col gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={artifactContentUrl(artifact.id)}
                          alt={artifact.displayName}
                          className="w-full rounded-lg border border-border-subtle"
                        />
                        <figcaption className="text-xs text-muted-foreground">
                          {artifact.displayName} ·{" "}
                          {artifact.byteSize
                            ? `${Math.round(artifact.byteSize / 1024)} KB`
                            : ""}
                        </figcaption>
                      </figure>
                    ))}
                  {artifacts
                    .filter((artifact) => artifact.artifactType !== "SCREENSHOT")
                    .map((artifact) => (
                      <a
                        key={artifact.id}
                        href={artifactContentUrl(artifact.id)}
                        className="text-sm text-primary hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {artifact.artifactType === "TRACE"
                          ? "▶ Playwright trace (zip)"
                          : artifact.displayName}{" "}
                        ({Math.round((artifact.byteSize ?? 0) / 1024)} KB)
                      </a>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="h-40 animate-pulse rounded-xl bg-surface-2/50" />
      )}
    </div>
  );
}
