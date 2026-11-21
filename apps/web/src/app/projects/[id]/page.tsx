"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import {
  IconChevronRight,
  IconCpu,
  IconTrash,
} from "@/components/icons";
import { PageHeader, StatCard } from "@/components/page-parts";
import {
  CreateEnvironmentDialog,
  CreateScreenDialog,
} from "@/components/project-forms";
import { AppTypeBadge, StatusBadge } from "@/components/status-badge";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useQueryClient } from "@tanstack/react-query";
import {
  useDeleteEnvironment,
  useDeleteProject,
  useDeleteScreen,
  useEnvironments,
  useProject,
  useProjectExecutions,
  useScreens,
  useStartExecution,
} from "@/lib/api-hooks";
import { MODE_LABELS, formatDate } from "@/lib/utils";
import { RequirementsPanel } from "@/components/requirements-panel";
import type { EnvironmentConfig } from "@ars/shared-contracts";

function EnvironmentCard({
  environment,
  onDelete,
}: {
  environment: EnvironmentConfig;
  onDelete: (envId: number) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <CardTitle>{environment.displayName}</CardTitle>
            <AppTypeBadge appType={environment.appType} />
          </div>
          <CardDescription>{environment.baseUrl}</CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Ortamı sil"
          onClick={() => onDelete(environment.id)}
        >
          <IconTrash />
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
        <p className="text-muted-foreground">
          Ortam: <span className="text-foreground">{environment.environmentLabel}</span>
        </p>
        <p className="text-muted-foreground">
          Kimlik doğrulama: <span className="text-foreground">{environment.authMethod}</span>
        </p>
        <p className="text-muted-foreground">
          Kimlik referansı:{" "}
          <span className="text-foreground">{environment.credentialReference ?? "—"}</span>
        </p>
        <p className="text-muted-foreground">
          Zaman aşımı: <span className="text-foreground">{environment.browserTimeoutMs} ms</span>
        </p>
        <p className="text-muted-foreground sm:col-span-2">
          İzinli alan adları:{" "}
          <span className="text-foreground">
            {environment.allowedDomains.length > 0 ? environment.allowedDomains.join(", ") : "—"}
          </span>
        </p>
        <p className="text-muted-foreground sm:col-span-2">
          Yasaklı eylemler:{" "}
          <span className="text-foreground">
            {environment.prohibitedActions.length > 0
              ? environment.prohibitedActions.join(", ")
              : "—"}
          </span>
        </p>
      </CardContent>
    </Card>
  );
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params?.id);
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: project, isLoading } = useProject(projectId);
  const { data: environments } = useEnvironments(projectId);
  const { data: screens } = useScreens(projectId);
  const { data: executions } = useProjectExecutions(projectId);

  const deleteProject = useDeleteProject(projectId);
  const deleteEnvironment = useDeleteEnvironment(projectId);
  const deleteScreen = useDeleteScreen(projectId);
  const startExecution = useStartExecution(projectId);

  const [selectedScreenId, setSelectedScreenId] = useState<string>("");
  const [selectedMode, setSelectedMode] = useState<string>("DISCOVERY");
  const [startError, setStartError] = useState<string | null>(null);

  const onStartExecution = async () => {
    setStartError(null);
    const screenId = Number(selectedScreenId);
    if (!Number.isInteger(screenId) || screenId <= 0) {
      setStartError("Önce bir ekran seçin.");
      return;
    }
    try {
      const execution = await startExecution.mutateAsync({
        screenId,
        mode: selectedMode,
      });
      router.push(`/executions/${execution.id}`);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "EXECUTION_ALREADY_RUNNING") {
        setStartError("Bu ekran için hâlen aktif bir çalıştırma var. Tamamlanmasını bekleyin.");
      } else if (code === "ENVIRONMENT_MISSING") {
        setStartError(
          "Seçili mod için gerekli uygulama ortamı tanımlı değil. Ortamlar sekmesinden ekleyin.",
        );
      } else {
        setStartError("Çalıştırma başlatılamadı. API ve worker servislerini kontrol edin.");
      }
    }
  };

  const onDeleteProject = async () => {
    if (!confirm("Proje pasife alınsın mı? (Kayıtlar silinmez, rapor geçmişi korunur.)")) {
      return;
    }
    try {
      await deleteProject.mutateAsync();
      router.push("/projects");
    } catch {
      alert("Proje pasife alınamadı.");
    }
  };

  if (isLoading || !project) {
    return <div className="h-40 animate-pulse rounded-xl bg-surface-2/50" />;
  }

  const availableScreens = (screens ?? []).filter((screen) => screen.active);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={project.name}
        description={
          project.description
            ? `${project.description} · Test ortamı: ${project.environmentName}`
            : `Test ortamı: ${project.environmentName}`
        }
        actions={
          <Button variant="ghost" onClick={() => void onDeleteProject()}>
            <IconTrash />
            Projeyi Pasife Al
          </Button>
        }
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Genel</TabsTrigger>
          <TabsTrigger value="environments">Ortamlar</TabsTrigger>
          <TabsTrigger value="screens">Ekranlar</TabsTrigger>
          <TabsTrigger value="executions">Çalıştırmalar</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Uygulama Ortamı" value={project.environmentCount} />
            <StatCard label="Hedef Ekran" value={project.screenCount} />
            <StatCard label="Çalıştırma" value={project.executionCount} />
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Faz 1 Kapsamı</CardTitle>
              <IconCpu className="text-muted-foreground" />
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Bu sürümde proje/ortam yapılandırması ve çalıştırma kaydı kullanılabilir.
              Gerçek tarayıcı otomasyonu, GWT keşfi ve GWT ↔ React karşılaştırması sırasıyla
              2–5. Fazlarda devreye alınacak. Platform, hazırlanmayan adımları{" "}
              <StatusBadge status="NOT_SUPPORTED" /> olarak raporlar; asla &quot;geçti&quot; demez.
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="environments" className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Uygulama Ortamları</h2>
            <CreateEnvironmentDialog projectId={projectId} />
          </div>

          {environments && environments.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {environments.map((environment) => (
                <EnvironmentCard
                  key={environment.id}
                  environment={environment}
                  onDelete={(envId) => {
                    if (confirm("Ortam silinsin mi?")) {
                      void deleteEnvironment.mutateAsync(envId).then(() =>
                        queryClient.invalidateQueries({ queryKey: ["projects", projectId] }),
                      );
                    }
                  }}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Henüz ortam tanımlı değil. GWT ve React test adreslerini tanımlamak için
                &quot;Ortam Ekle&quot;yi kullanın.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="screens" className="flex flex-col gap-4">
          <RequirementsPanel projectId={projectId} screenCode="KPY68" />
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Ekran Kaydı</h2>
            <CreateScreenDialog projectId={projectId} />
          </div>

          {screens && screens.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ekran Kodu</TableHead>
                  <TableHead>Ad</TableHead>
                  <TableHead>GWT Rotası</TableHead>
                  <TableHead>React Rotası</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {screens.map((screen) => (
                  <TableRow key={screen.id}>
                    <TableCell className="font-mono text-xs font-medium text-primary">
                      {screen.screenCode}
                    </TableCell>
                    <TableCell>{screen.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {screen.legacyRoute ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {screen.reactRoute ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Ekranı sil"
                        onClick={() => {
                          if (confirm("Ekran silinsin mi?")) {
                            void deleteScreen.mutateAsync(screen.id);
                          }
                        }}
                      >
                        <IconTrash />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Henüz ekran yok. Örn. KPY68 ekranını ekleyin.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="executions" className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Test Çalıştır</CardTitle>
              <CardDescription>
                Seçili ekran için keşif ya da karşılaştırma çalıştırması başlatın.
                Sonuç, faz durumuna göre dürüst biçimde raporlanır.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium" htmlFor="exec-screen">
                    Ekran
                  </label>
                  <select
                    id="exec-screen"
                    className="h-9 rounded-lg border border-border-subtle bg-surface-2 px-3 text-sm"
                    value={selectedScreenId}
                    onChange={(event) => setSelectedScreenId(event.target.value)}
                  >
                    <option value="">Ekran seçin…</option>
                    {availableScreens.map((screen) => (
                      <option key={screen.id} value={screen.id}>
                        {screen.screenCode} — {screen.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium" htmlFor="exec-mode">
                    Mod
                  </label>
                  <select
                    id="exec-mode"
                    className="h-9 rounded-lg border border-border-subtle bg-surface-2 px-3 text-sm"
                    value={selectedMode}
                    onChange={(event) => setSelectedMode(event.target.value)}
                  >
                    <option value="DISCOVERY">Keşif (GWT)</option>
                    <option value="COMPARISON">Karşılaştırma (GWT ↔ React)</option>
                    <option value="COMBINATION">Kombinasyon (tüm alan kombinasyonları)</option>
                  </select>
                </div>
              </div>

              {startError ? (
                <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {startError}
                </p>
              ) : null}

              <Button
                className="w-fit"
                onClick={() => void onStartExecution()}
                disabled={startExecution.isPending || availableScreens.length === 0}
              >
                Çalıştır
                <IconChevronRight />
              </Button>
            </CardContent>
          </Card>

          {executions && executions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>Mod</TableHead>
                  <TableHead>Başlatan</TableHead>
                  <TableHead>Tarih</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {executions.map((execution) => (
                  <TableRow key={execution.id}>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {execution.id}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={execution.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {MODE_LABELS[execution.mode] ?? execution.mode}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {execution.createdBy ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(execution.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Link
                        className="text-sm text-primary hover:underline"
                        href={`/executions/${execution.id}`}
                      >
                        Detay
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Bu proje için henüz çalıştırma yok.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
