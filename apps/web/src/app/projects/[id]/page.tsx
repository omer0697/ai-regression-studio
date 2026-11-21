"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import {
  IconChat,
  IconChevronRight,
  IconEdit,
  IconPlay,
  IconTrash,
} from "@/components/icons";
import { EmptyState, PageHeader, StatCard } from "@/components/page-parts";
import {
  CreateEnvironmentDialog,
  CreateScreenDialog,
  EditEnvironmentDialog,
  EditScreenDialog,
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
import { Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { MODE_DESCRIPTIONS, MODE_LABELS, formatDate } from "@/lib/utils";
import { RequirementsPanel } from "@/components/requirements-panel";
import { RequirementsMatrix } from "@/components/requirements-matrix";
import type { EnvironmentConfig, ScreenDefinition } from "@ars/shared-contracts";

const RUN_MODES = ["DISCOVERY", "COMPARISON", "COMBINATION"] as const;

function EnvironmentCard({
  environment,
  onEdit,
  onDelete,
}: {
  environment: EnvironmentConfig;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <CardTitle>{environment.displayName}</CardTitle>
            <AppTypeBadge appType={environment.appType} />
          </div>
          <CardDescription className="font-mono">{environment.baseUrl}</CardDescription>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" aria-label="Ortamı düzenle" onClick={onEdit}>
            <IconEdit />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Ortamı sil"
            className="text-danger hover:bg-danger/10 hover:text-danger"
            onClick={onDelete}
          >
            <IconTrash />
          </Button>
        </div>
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
        <p className="text-muted-foreground">
          Keşif limiti:{" "}
          <span className="text-foreground">
            {environment.explorationMaxInteractions} etkileşim × {environment.explorationMaxOptions}{" "}
            seçenek
          </span>
        </p>
        <p className="text-muted-foreground">
          Ekran görüntüsü:{" "}
          <span className="text-foreground">
            {environment.screenshotEnabled ? "açık" : "kapalı"}
          </span>
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

function QuickStep({
  index,
  title,
  description,
  href,
  linkLabel,
}: {
  index: number;
  title: string;
  description: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
        {index}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        {href && linkLabel ? (
          <Link className="mt-1 inline-block text-xs text-primary hover:underline" href={href}>
            {linkLabel} →
          </Link>
        ) : null}
      </div>
    </li>
  );
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params?.id);
  const router = useRouter();

  const { data: project, isLoading } = useProject(projectId);
  const { data: environments } = useEnvironments(projectId);
  const { data: screens } = useScreens(projectId);
  const { data: executions } = useProjectExecutions(projectId);

  const deleteProject = useDeleteProject(projectId);
  const deleteEnvironment = useDeleteEnvironment(projectId);
  const deleteScreen = useDeleteScreen(projectId);
  const startExecution = useStartExecution(projectId);

  const [editingEnvironment, setEditingEnvironment] = useState<EnvironmentConfig | null>(null);
  const [editingScreen, setEditingScreen] = useState<ScreenDefinition | null>(null);

  const [selectedScreenId, setSelectedScreenId] = useState<string>("");
  const [selectedMode, setSelectedMode] = useState<string>("DISCOVERY");
  const [startError, setStartError] = useState<string | null>(null);

  const availableScreens = (screens ?? []).filter((screen) => screen.active);
  const [reqScreenCode, setReqScreenCode] = useState<string>("");
  const activeReqScreenCode =
    (screens ?? []).some((screen) => screen.screenCode === reqScreenCode)
      ? reqScreenCode
      : ((screens ?? [])[0]?.screenCode ?? "");

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

  const hasGwt = (environments ?? []).some((env) => env.appType === "LEGACY_GWT");
  const hasReact = (environments ?? []).some((env) => env.appType === "REACT");

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
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-subtle bg-surface-2 px-4 text-sm font-medium hover:bg-surface-2/70"
              href="/chat"
            >
              <IconChat />
              Proje Sohbeti
            </Link>
            <Button variant="ghost" onClick={() => void onDeleteProject()}>
              <IconTrash />
              Projeyi Pasife Al
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Genel</TabsTrigger>
          <TabsTrigger value="environments">Ortamlar</TabsTrigger>
          <TabsTrigger value="screens">Ekranlar</TabsTrigger>
          <TabsTrigger value="requirements">Gereksinimler</TabsTrigger>
          <TabsTrigger value="executions">Çalıştırmalar</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Uygulama Ortamı" value={project.environmentCount} />
            <StatCard label="Hedef Ekran" value={project.screenCount} />
            <StatCard label="Çalıştırma" value={project.executionCount} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Nasıl ilerlenir?</CardTitle>
              <CardDescription>
                Dört adımda eski ↔ yeni uygulama karşılaştırması; platform hazırlanmayan
                adımları asla &quot;geçti&quot; olarak göstermez.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-4">
                <QuickStep
                  index={1}
                  title="Ortamları tanımlayın"
                  description="Ortamlar sekmesinden eski (GWT) ve yeni (React) uygulamanın adreslerini ekleyin. Yerelde çalışan bir uygulamayı da (örn. http://localhost:…) test edebilirsiniz."
                />
                <QuickStep
                  index={2}
                  title="Ekran ekleyin"
                  description="Ekranlar sekmesinden test edilecek ekranı kaydedin (örn. KPY68). Ekran kodu sonradan değişmez, diğer bilgiler düzenlenebilir."
                />
                <QuickStep
                  index={3}
                  title="Çalıştırma başlatın"
                  description="Çalıştırmalar sekmesinden Keşif, Karşılaştırma veya Kombinasyon modunu seçip başlatın; ilerlemeyi canlı izleyin."
                />
                <QuickStep
                  index={4}
                  title="Farkları inceleyin"
                  description="Tespit edilen davranış farkları, kanıt ekran görüntüleriyle birlikte Hata Raporları sayfasında listelenir; onaylama insan kararıdır."
                  href="/bugs"
                  linkLabel="Hata Raporları"
                />
              </ol>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-primary/30">
              <CardHeader className="flex-row items-start gap-3 space-y-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <IconChat />
                </span>
                <div>
                  <CardTitle>Sorunuz mu var?</CardTitle>
                  <CardDescription>
                    Proje sohbetinde bulguları, gereksinim kapsamını ve çalıştırma
                    durumunu sorabilirsiniz. AI yapılandırılmadığında da aynı gerçek
                    verilerle yanıt alırsınız — asla uydurma değil.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <Link
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  href="/chat"
                >
                  Sohbeti aç
                  <IconChevronRight />
                </Link>
              </CardContent>
            </Card>

            <Card
              className={
                hasGwt && hasReact
                  ? "border-success/40"
                  : "border-warning/40"
              }
            >
              <CardHeader>
                <CardTitle>Ortam Hazırlığı</CardTitle>
                <CardDescription>
                  Karşılaştırma ve Kombinasyon modları için eski ve yeni uygulamanın
                  ikisi de tanımlı olmalıdır.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <p className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-2/40 px-3 py-2">
                  <span>Eski (GWT) ortamı</span>
                  {hasGwt ? (
                    <span className="font-medium text-success">Tanımlı ✓</span>
                  ) : (
                    <span className="font-medium text-warning">Eksik</span>
                  )}
                </p>
                <p className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-2/40 px-3 py-2">
                  <span>Yeni (React) ortamı</span>
                  {hasReact ? (
                    <span className="font-medium text-success">Tanımlı ✓</span>
                  ) : (
                    <span className="font-medium text-warning">Eksik</span>
                  )}
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="environments" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Uygulama Ortamları</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Test edilecek uygulamaların adresleri ve güvenli giriş ayarları.
                Değişiklik için karttaki düzenleme simgesini kullanın.
              </p>
            </div>
            <CreateEnvironmentDialog projectId={projectId} />
          </div>

          {environments && environments.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {environments.map((environment) => (
                <EnvironmentCard
                  key={environment.id}
                  environment={environment}
                  onEdit={() => setEditingEnvironment(environment)}
                  onDelete={() => {
                    if (
                      confirm(
                        `"${environment.displayName}" ortamı silinsin mi? Bu işlem geri alınamaz.`,
                      )
                    ) {
                      void deleteEnvironment.mutateAsync(environment.id);
                    }
                  }}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Henüz ortam tanımlı değil"
              description='Karşılaştırma için bir GWT (eski) ve bir React (yeni) ortamı ekleyin. Yerelde çalışan uygulamanızın adresini (örn. http://localhost:9100/...) "Temel URL" alanına girebilirsiniz.'
              action={<CreateEnvironmentDialog projectId={projectId} />}
            />
          )}
        </TabsContent>

        <TabsContent value="screens" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Ekran Kaydı</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Test edilecek ekranlar. Ekran kodu sabittir; ad, rotalar ve notlar düzenlenebilir.
              </p>
            </div>
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
                    <TableCell className="max-w-48">
                      <span className="block truncate">{screen.name}</span>
                      {screen.navigationNotes ? (
                        <span className="block max-w-48 truncate text-xs text-muted-foreground">
                          {screen.navigationNotes}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {screen.legacyRoute ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {screen.reactRoute ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Ekranı düzenle"
                          onClick={() => setEditingScreen(screen)}
                        >
                          <IconEdit />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Ekranı sil"
                          className="text-danger hover:bg-danger/10 hover:text-danger"
                          onClick={() => {
                            if (
                              confirm(
                                `"${screen.screenCode}" ekranı silinsin mi? Bu işlem geri alınamaz.`,
                              )
                            ) {
                              void deleteScreen.mutateAsync(screen.id);
                            }
                          }}
                        >
                          <IconTrash />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title="Henüz ekran yok"
              description='Test edilecek ekranı ekleyin (örn. ekran kodu "KPY68", ad "Parametre Tanımları").'
              action={<CreateScreenDialog projectId={projectId} />}
            />
          )}
        </TabsContent>

        <TabsContent value="requirements" className="flex flex-col gap-4">
          {screens && screens.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Label htmlFor="req-screen">Ekran seçin</Label>
                <Select
                  id="req-screen"
                  className="max-w-64"
                  value={activeReqScreenCode}
                  onChange={(event) => setReqScreenCode(event.target.value)}
                >
                  {screens.map((screen) => (
                    <option key={screen.id} value={screen.screenCode}>
                      {screen.screenCode} — {screen.name}
                    </option>
                  ))}
                </Select>
              </div>
              <RequirementsMatrix
                projectId={projectId}
                screens={screens.map((screen) => ({
                  id: screen.id,
                  screenCode: screen.screenCode,
                  name: screen.name,
                }))}
                screenCode={activeReqScreenCode}
                onScreenChange={setReqScreenCode}
              />
              <RequirementsPanel projectId={projectId} screenCode={activeReqScreenCode} />
            </>
          ) : (
            <EmptyState
              title="Gereksinim görüntülemek için önce ekran ekleyin"
              description="Gereksinimler ekran bazlı takip edilir. Ekranlar sekmesinden en az bir ekran ekleyin."
            />
          )}
        </TabsContent>

        <TabsContent value="executions" className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Test Çalıştır</CardTitle>
              <CardDescription>
                Seçili ekran için keşif, karşılaştırma ya da kombinasyon çalıştırması
                başlatın. Sonuçlar dürüst biçimde raporlanır — hazırlanmayan adım
                asla &quot;geçti&quot; denmez.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="exec-screen">Ekran</Label>
                  <Select
                    id="exec-screen"
                    value={selectedScreenId}
                    onChange={(event) => setSelectedScreenId(event.target.value)}
                  >
                    <option value="">Ekran seçin…</option>
                    {availableScreens.map((screen) => (
                      <option key={screen.id} value={screen.id}>
                        {screen.screenCode} — {screen.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="exec-mode">Mod</Label>
                  <Select
                    id="exec-mode"
                    value={selectedMode}
                    onChange={(event) => setSelectedMode(event.target.value)}
                  >
                    {RUN_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {MODE_LABELS[mode]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <p className="rounded-lg border border-border-subtle bg-surface-2/40 px-3 py-2 text-xs text-muted-foreground">
                {MODE_DESCRIPTIONS[selectedMode]}
              </p>

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
                <IconPlay />
                Çalıştır
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
            <EmptyState
              title="Bu proje için henüz çalıştırma yok"
              description="Yukarıdaki formdan bir ekran ve mod seçip çalıştırın. İlerlemeyi çalıştırma detayında canlı izleyebilirsiniz."
            />
          )}
        </TabsContent>
      </Tabs>

      <EditEnvironmentDialog
        projectId={projectId}
        environment={editingEnvironment}
        onClose={() => setEditingEnvironment(null)}
      />
      <EditScreenDialog
        projectId={projectId}
        screen={editingScreen}
        onClose={() => setEditingScreen(null)}
      />
    </div>
  );
}
