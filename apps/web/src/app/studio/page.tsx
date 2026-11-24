"use client";

import Link from "next/link";
import { useState } from "react";

import {
  IconAlert,
  IconCheck,
  IconChevronRight,
  IconCpu,
  IconFileText,
  IconLayers,
  IconPlay,
  IconSparkles,
  IconTrash,
} from "@/components/icons";
import { PageHeader, StatCard } from "@/components/page-parts";
import { AppTypeBadge, StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { API_BASE, WORKER_BASE, api, artifactContentUrl, type RequirementInfo, type ScenarioInfo } from "@/lib/api-client";
import {
  useAiStatus,
  useBrowserSessions,
  useContinueManualLoginExecution,
  useDeleteBrowserSession,
  useExecution,
  useExecutionArtifacts,
  useExecutionElements,
  useExecutionFindings,
  useExecutionObservations,
  useOpenManualLoginWindow,
  useProjects,
  useSaveManualLoginSession,
} from "@/lib/api-hooks";
import { useExecutionStream } from "@/lib/execution-stream";
import { MODE_LABELS, formatDate, formatDuration } from "@/lib/utils";

type StudioAuthMode =
  | "NONE"
  | "MANUAL_INTERACTIVE"
  | "SAVED_SESSION"
  | "TEST_ACCOUNT_FORM";

function buildFullUrl(baseUrl: string, routePath: string): string {
  const cleanBase = baseUrl.trim();
  const cleanRoute = routePath.trim();
  if (!cleanRoute) return cleanBase;
  if (/^https?:\/\//i.test(cleanRoute)) return cleanRoute;
  if (cleanBase.endsWith(cleanRoute)) return cleanBase;
  if (cleanRoute.startsWith("#") || cleanRoute.startsWith("?")) {
    return `${cleanBase}${cleanRoute}`;
  }
  const baseNoSlash = cleanBase.replace(/\/+$/, "");
  if (cleanRoute.startsWith("/")) {
    return `${baseNoSlash}${cleanRoute}`;
  }
  return `${baseNoSlash}/${cleanRoute}`;
}

/**
 * Converts localhost:9100 fixture URLs to the same-origin `/worker/...` proxy
 * path when rendering inside the studio's live preview `<iframe>` so the browser
 * never blocks mixed ports or cross-origin frames.
 */
function toPreviewIframeSrc(fullUrl: string): string {
  return fullUrl.replace(/^https?:\/\/(localhost|127\.0\.0\.1):9100/i, WORKER_BASE);
}

export default function ScreenTestStudioPage() {
  // ---- Target Screen & Mode State ----
  const [screenCode, setScreenCode] = useState("KPY68");
  const [screenName, setScreenName] = useState("Parametre Tanımları (Iframe & Dönüşüm)");
  const [mode, setMode] = useState<"COMPARISON" | "DISCOVERY" | "COMBINATION">("COMPARISON");

  // ---- GWT (Legacy) Configuration ----
  const [gwtBaseUrl, setGwtBaseUrl] = useState("http://localhost:9100");
  const [gwtPath, setGwtPath] = useState("/fixtures/gwt-iframe-shell.html#KPY68");
  const [gwtAuthMode, setGwtAuthMode] = useState<StudioAuthMode>("NONE");
  const [gwtLoginUrl, setGwtLoginUrl] = useState("http://localhost:9100/fixtures/login.html");
  const [gwtProfileKey, setGwtProfileKey] = useState("kap-gwt-session");
  const [gwtCredRef, setGwtCredRef] = useState("kap-gwt-test-user");
  const [gwtUserSelector, setGwtUserSelector] = useState("input[name='username']");
  const [gwtPassSelector, setGwtPassSelector] = useState("input[name='password']");
  const [gwtSubmitSelector, setGwtSubmitSelector] = useState("button[type='submit']");

  // ---- React (New) Configuration ----
  const [reactBaseUrl, setReactBaseUrl] = useState("http://localhost:9100");
  const [reactPath, setReactPath] = useState("/fixtures/react-iframe-shell.html#/kpy68");
  const [reactAuthMode, setReactAuthMode] = useState<StudioAuthMode>("NONE");
  const [reactLoginUrl, setReactLoginUrl] = useState("");
  const [reactProfileKey, setReactProfileKey] = useState("kap-react-session");

  // ---- Live Iframe Preview State ----
  const [showIframePreview, setShowIframePreview] = useState(true);
  const [iframeRefreshKey, setIframeRefreshKey] = useState(0);
  const [checkPdfFields, setCheckPdfFields] = useState(true);
  const [checkDocumentWorkflows, setCheckDocumentWorkflows] = useState(false);

  // ---- Confluence New Development / Requirement Check State ----
  const [confluenceBaseUrl, setConfluenceBaseUrl] = useState("");
  const [confluencePageId, setConfluencePageId] = useState("");
  const [confluenceToken, setConfluenceToken] = useState("");
  const [confluenceRawContent, setConfluenceRawContent] = useState("");
  const [isCheckingConfluence, setIsCheckingConfluence] = useState(false);
  const [confluenceResult, setConfluenceResult] = useState<{
    imported: number;
    analyzed: number;
    totalRequirements: number;
    verifiedCount: number;
    missingOrReviewCount: number;
  } | null>(null);
  const [confluenceRequirements, setConfluenceRequirements] = useState<RequirementInfo[]>([]);

  // ---- Markdown Bug Report State ----
  const [markdownReport, setMarkdownReport] = useState<string | null>(null);
  const [isLoadingMarkdown, setIsLoadingMarkdown] = useState(false);

  // ---- Active Execution State ----
  const [activeExecutionId, setActiveExecutionId] = useState<number | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [activeScreenId, setActiveScreenId] = useState<number | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);

  // ---- Local LLM (AI) Test Case Generation & Root-Cause Analysis State ----
  const [aiCommand, setAiCommand] = useState(
    "Keşfedilen tüm seçim (select), checkbox ve radyo kontrollerindeki bağımlılıkları ve görünürlük değişimlerini doğrulayan kapsamlı bir regresyon test senaryosu üret.",
  );
  const [isGeneratingAiPlan, setIsGeneratingAiPlan] = useState(false);
  const [generatedScenario, setGeneratedScenario] = useState<ScenarioInfo | null>(null);
  const [aiHypothesis, setAiHypothesis] = useState<string | null>(null);
  const [isAnalyzingAi, setIsAnalyzingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const { data: aiStatus } = useAiStatus();
  const { data: projects, refetch: refetchProjects } = useProjects();
  const { data: sessionData } = useBrowserSessions();
  const openLoginWindow = useOpenManualLoginWindow();
  const saveLoginSession = useSaveManualLoginSession();
  const continueExecution = useContinueManualLoginExecution();
  const deleteSession = useDeleteBrowserSession();

  const { data: execution } = useExecution(activeExecutionId ?? Number.NaN);
  const { data: artifacts } = useExecutionArtifacts(activeExecutionId ?? Number.NaN);
  const { data: elements } = useExecutionElements(activeExecutionId ?? Number.NaN);
  const { data: observations } = useExecutionObservations(activeExecutionId ?? Number.NaN);
  const { data: findings } = useExecutionFindings(activeExecutionId ?? Number.NaN);
  const stream = useExecutionStream(activeExecutionId);

  const gwtFullUrl = buildFullUrl(gwtBaseUrl, gwtPath);
  const reactFullUrl = buildFullUrl(reactBaseUrl, reactPath);

  const pendingManualForActive =
    sessionData?.pendingExecutions.find((item) => item.executionId === activeExecutionId) ??
    sessionData?.pendingExecutions[0] ??
    null;

  const isWaitingForManualLogin =
    Boolean(pendingManualForActive) ||
    stream.events.some((ev) => ev.message.includes("MANUAL_LOGIN_WAITING")) &&
      !stream.events.some((ev) => ev.message.includes("Manuel giriş onaylandı"));

  // ---- Preset Loader ----
  const applyPreset = (preset: "iframe-compare" | "manual-login-iframe" | "direct-compare") => {
    setLaunchError(null);
    if (preset === "iframe-compare") {
      setScreenCode("KPY68");
      setScreenName("Parametre Tanımları (Iframe Shell)");
      setMode("COMPARISON");
      setGwtBaseUrl("http://localhost:9100");
      setGwtPath("/fixtures/gwt-iframe-shell.html#KPY68");
      setGwtAuthMode("NONE");
      setReactBaseUrl("http://localhost:9100");
      setReactPath("/fixtures/react-iframe-shell.html#/kpy68");
      setReactAuthMode("NONE");
    } else if (preset === "manual-login-iframe") {
      setScreenCode("KPY68");
      setScreenName("Parametre Tanımları (Manuel Login + Iframe)");
      setMode("COMPARISON");
      setGwtBaseUrl("http://localhost:9100");
      setGwtPath("/fixtures/gwt-iframe-shell.html#KPY68");
      setGwtAuthMode("MANUAL_INTERACTIVE");
      setGwtLoginUrl("http://localhost:9100/fixtures/login.html?next=gwt-iframe-shell.html%23KPY68");
      setReactBaseUrl("http://localhost:9100");
      setReactPath("/fixtures/react-iframe-shell.html#/kpy68");
      setReactAuthMode("NONE");
    } else {
      setScreenCode("KPY68");
      setScreenName("Parametre Tanımları (Doğrudan Ekran)");
      setMode("COMPARISON");
      setGwtBaseUrl("http://localhost:9100");
      setGwtPath("/fixtures/gwt-kpy68.html");
      setGwtAuthMode("NONE");
      setReactBaseUrl("http://localhost:9100");
      setReactPath("/fixtures/react-kpy68.html");
      setReactAuthMode("NONE");
    }
    setIframeRefreshKey((k) => k + 1);
  };

  // ---- Open Manual Login Browser Window (Pre-session) ----
  const onOpenLoginBrowser = async (profileKey: string, url: string) => {
    setSessionMessage(null);
    setLaunchError(null);
    try {
      const opened = await openLoginWindow.mutateAsync({
        profileKey,
        targetUrl: url,
      });
      setSessionMessage(
        `Görünür Chromium penceresi açıldı (${opened.currentUrl}). Tarayıcıda giriş yaptıktan sonra 'Giriş Yaptım, Oturumu Kaydet' butonuna basın.`,
      );
    } catch (error) {
      setLaunchError(
        error instanceof Error ? error.message : "Giriş penceresi açılamadı.",
      );
    }
  };

  const onSaveLoginBrowser = async (profileKey: string) => {
    setSessionMessage(null);
    setLaunchError(null);
    try {
      const saved = await saveLoginSession.mutateAsync({
        profileKey,
        closeWindow: true,
      });
      setSessionMessage(
        `'${saved.profileKey}' oturumu kaydedildi (${saved.cookieCount} çerez). Artık tüm ekran testleri bu oturumla otomatik giriş yapılmış olarak çalışacak!`,
      );
    } catch (error) {
      setLaunchError(
        error instanceof Error ? error.message : "Oturum kaydedilemedi.",
      );
    }
  };

  // ---- One-Click Auto Provision & Start Execution ----
  const onStartStudioTest = async (
    modeOverride?: "COMPARISON" | "DISCOVERY" | "COMBINATION",
  ) => {
    const runMode = modeOverride ?? mode;
    setLaunchError(null);
    setSessionMessage(null);
    setMarkdownReport(null);
    setGeneratedScenario(null);

    const normalizedCode = screenCode
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]+/g, "-")
      .replace(/^[^A-Z]+/, "S");
    if (normalizedCode.length < 2) {
      setLaunchError("Geçerli bir ekran kodu girin (örn. KPY68).");
      return;
    }

    setIsLaunching(true);
    try {
      // 1) Find or create the Studio Project
      const currentProjects = projects ?? (await api.listProjects());
      let studioProject = currentProjects.find(
        (p) => p.active && p.name === "GWT-React Test Stüdyosu",
      );

      if (!studioProject) {
        const created = await api.createProject({
          name: "GWT-React Test Stüdyosu",
          description: "Tek ekrandan URL + Path + Iframe + Manuel Login test ve rapor projesi",
          environmentName: "TEST",
        });
        studioProject = created;
        await refetchProjects();
      }

      const projectId = studioProject.id;
      const existingEnvs = await api.listEnvironments(projectId);

      const documentActions = [
        "safe-exploration",
        ...(checkPdfFields ? ["document-pdf-testing"] : []),
        ...(checkDocumentWorkflows ? ["document-workflow-testing"] : []),
      ];
      const gwtAllowedActions = [
        ...documentActions,
        ...(gwtAuthMode === "MANUAL_INTERACTIVE" ? ["manual-interactive-login"] : []),
      ];
      // "İmzaya Gönder"/"Yayınla" are only permitted when the operator opted in
      // to document-workflow testing; otherwise they stay explicitly forbidden.
      const prohibitedActions = checkDocumentWorkflows
        ? ["delete"]
        : ["submit", "publish", "delete", "approve", "sign", "send"];

      // 2) Upsert GWT Environment
      const gwtEnvPayload: Record<string, unknown> = {
        appType: "LEGACY_GWT",
        displayName: "GWT Uygulaması",
        baseUrl: gwtBaseUrl.trim(),
        environmentLabel: "TEST",
        authMethod: gwtAuthMode === "TEST_ACCOUNT_FORM" ? "TEST_ACCOUNT_FORM" : "NONE",
        credentialReference:
          gwtAuthMode === "MANUAL_INTERACTIVE"
            ? "MANUAL_INTERACTIVE"
            : gwtAuthMode === "SAVED_SESSION"
              ? gwtProfileKey.trim() || "kap-gwt-session"
              : gwtAuthMode === "TEST_ACCOUNT_FORM"
                ? gwtCredRef.trim() || "kap-gwt-test-user"
                : undefined,
        loginUrl:
          gwtAuthMode === "MANUAL_INTERACTIVE" || gwtAuthMode === "TEST_ACCOUNT_FORM"
            ? gwtLoginUrl.trim() || gwtBaseUrl.trim()
            : undefined,
        usernameSelector:
          gwtAuthMode === "TEST_ACCOUNT_FORM" ? gwtUserSelector.trim() : undefined,
        passwordSelector:
          gwtAuthMode === "TEST_ACCOUNT_FORM" ? gwtPassSelector.trim() : undefined,
        submitSelector:
          gwtAuthMode === "TEST_ACCOUNT_FORM" ? gwtSubmitSelector.trim() : undefined,
        allowedActions: gwtAllowedActions,
        prohibitedActions,
        browserTimeoutMs: 45000,
        explorationMaxInteractions: 12,
        explorationMaxOptions: 3,
        screenshotEnabled: true,
      };

      const existingGwt = existingEnvs.find((e) => e.appType === "LEGACY_GWT");
      if (existingGwt) {
        await api.updateEnvironment(projectId, existingGwt.id, gwtEnvPayload);
      } else {
        await api.createEnvironment(projectId, gwtEnvPayload);
      }

      // 3) Upsert React Environment (when COMPARISON or COMBINATION)
      if (runMode === "COMPARISON" || runMode === "COMBINATION") {
        const reactEnvPayload: Record<string, unknown> = {
          appType: "REACT",
          displayName: "React Uygulaması",
          baseUrl: reactBaseUrl.trim(),
          environmentLabel: "TEST",
          authMethod: "NONE",
          credentialReference:
            reactAuthMode === "MANUAL_INTERACTIVE"
              ? "MANUAL_INTERACTIVE"
              : reactAuthMode === "SAVED_SESSION"
                ? reactProfileKey.trim() || "kap-react-session"
                : undefined,
          loginUrl:
            reactAuthMode === "MANUAL_INTERACTIVE"
              ? reactLoginUrl.trim() || reactBaseUrl.trim()
              : undefined,
          allowedActions: [
            ...documentActions,
            ...(reactAuthMode === "MANUAL_INTERACTIVE" ? ["manual-interactive-login"] : []),
          ],
          prohibitedActions,
          browserTimeoutMs: 45000,
          explorationMaxInteractions: 12,
          explorationMaxOptions: 3,
          screenshotEnabled: true,
        };

        const existingReact = existingEnvs.find((e) => e.appType === "REACT");
        if (existingReact) {
          await api.updateEnvironment(projectId, existingReact.id, reactEnvPayload);
        } else {
          await api.createEnvironment(projectId, reactEnvPayload);
        }
      }

      // 4) Upsert Screen Definition with legacyRoute (GWT Path) & reactRoute (React Path)
      const existingScreens = await api.listScreens(projectId);
      let targetScreen = existingScreens.find(
        (s) => s.screenCode.toUpperCase() === normalizedCode,
      );
      const screenPayload = {
        screenCode: normalizedCode,
        name: screenName.trim() || normalizedCode,
        legacyRoute: gwtPath.trim() || undefined,
        reactRoute: reactPath.trim() || undefined,
        navigationNotes: `Stüdyo üzerinden çalıştırıldı. GWT: ${gwtFullUrl} | React: ${reactFullUrl}`,
      };

      if (targetScreen) {
        targetScreen = await api.updateScreen(projectId, targetScreen.id, screenPayload);
      } else {
        targetScreen = await api.createScreen(projectId, screenPayload);
      }

      // 5) Start the Execution!
      setActiveProjectId(projectId);
      setActiveScreenId(targetScreen.id);
      setAiHypothesis(null);
      setAiError(null);
      const started = await api.startExecution(projectId, {
        screenId: targetScreen.id,
        mode: runMode,
      });
      setActiveExecutionId(started.id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Test başlatılırken bir hata oluştu.";
      setLaunchError(message);
    } finally {
      setIsLaunching(false);
    }
  };

  const onGenerateAiScenario = async () => {
    setAiError(null);
    const projectId = activeProjectId ?? execution?.projectId;
    const screenId = activeScreenId ?? execution?.screenId;
    if (!projectId || !screenId) {
      setAiError("Önce ekranı en az bir kez keşfedin veya çalıştırın ki AI ekran elemanlarını görsün.");
      return;
    }
    setIsGeneratingAiPlan(true);
    try {
      const proposed = await api.proposeAiPlan(projectId, screenId, aiCommand.trim());
      const approved = await api.approveScenario(proposed.id);
      setGeneratedScenario(approved);
    } catch (error) {
      setAiError(
        error instanceof Error
          ? error.message
          : "Local LLM üzerinden test senaryosu üretilemedi. AI Ayarlarını kontrol edin.",
      );
    } finally {
      setIsGeneratingAiPlan(false);
    }
  };

  const onAnalyzeWithAi = async () => {
    if (!activeExecutionId) return;
    setAiError(null);
    setIsAnalyzingAi(true);
    try {
      const res = await api.analyzeExecution(activeExecutionId);
      setAiHypothesis(res.hypothesis ?? "Local LLM analizi tamamlandı.");
    } catch (error) {
      setAiError(
        error instanceof Error
          ? error.message
          : "Local LLM kök neden analizi başarısız oldu. AI Ayarlarını kontrol edin.",
      );
    } finally {
      setIsAnalyzingAi(false);
    }
  };

  const onCheckConfluence = async () => {
    setAiError(null);
    const projectId = activeProjectId ?? execution?.projectId;
    const normalizedCode = screenCode.trim().toUpperCase();
    if (!projectId || !normalizedCode) {
      setAiError("Confluence kontrolü için önce bu ekranı bir kez çalıştırın veya keşfedin.");
      return;
    }
    if (
      !confluenceRawContent.trim() &&
      (!confluenceBaseUrl.trim() || !confluencePageId.trim())
    ) {
      setAiError("Confluence sayfa URL'si + sayfa ID'si veya yeni geliştirme metni girin.");
      return;
    }

    setIsCheckingConfluence(true);
    try {
      const result = await api.checkConfluenceDevelopments(projectId, normalizedCode, {
        confluenceBaseUrl: confluenceBaseUrl.trim() || undefined,
        confluencePageId: confluencePageId.trim() || undefined,
        confluenceToken: confluenceToken.trim() || undefined,
        rawContent: confluenceRawContent.trim() || undefined,
      });
      setConfluenceResult(result);
      setConfluenceRequirements(await api.listRequirements(projectId, normalizedCode));
    } catch (error) {
      setAiError(
        error instanceof Error
          ? error.message
          : "Confluence yeni geliştirme kontrolü başarısız oldu.",
      );
    } finally {
      setIsCheckingConfluence(false);
    }
  };

  const onLoadMarkdownReport = async () => {
    if (!activeExecutionId) return;
    setIsLoadingMarkdown(true);
    try {
      setMarkdownReport(await api.getMarkdownReport(activeExecutionId));
    } catch (error) {
      setAiError(
        error instanceof Error ? error.message : "Markdown raporu yüklenemedi.",
      );
    } finally {
      setIsLoadingMarkdown(false);
    }
  };

  const onCopyMarkdownReport = async () => {
    if (!markdownReport) return;
    try {
      await navigator.clipboard.writeText(markdownReport);
      setSessionMessage("Markdown hata raporu panoya kopyalandı.");
    } catch {
      setAiError("Panoya kopyalama izni verilmedi. Raporu ekrandan seçerek kopyalayabilirsiniz.");
    }
  };

  const onContinueManualLogin = async (skipNavigation: boolean) => {
    const targetExecId = pendingManualForActive?.executionId ?? activeExecutionId;
    if (!targetExecId) return;
    try {
      await continueExecution.mutateAsync({
        executionId: targetExecId,
        skipNavigation,
      });
    } catch (error) {
      setLaunchError(
        error instanceof Error ? error.message : "Devam sinyali gönderilemedi.",
      );
    }
  };

  const liveStatus =
    stream.connected && stream.status ? stream.status : execution?.status;
  const iframeElementCount = (elements ?? []).filter((el) =>
    el.domPath?.startsWith("[iframe:"),
  ).length;
  const reportBase = activeExecutionId ? `${API_BASE}/executions/${activeExecutionId}` : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Ekran Test & Rapor Stüdyosu (GWT ↔ React & Iframe)"
        description="GWT ve React uygulama URL'sini ve ekranın path'ini verin; giriş aşamasını ister elinizle geçin ister oturumu kaydedin, şirket içi Local LLM (AI) ile test senaryoları üretip karşılaştırma raporunu tek ekrandan çıkartın."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/ai-config"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-2 px-3 text-xs font-medium hover:bg-surface-2/70"
            >
              <IconCpu width={14} height={14} className="text-primary" />
              {aiStatus?.configured
                ? `● Local LLM Aktif (${aiStatus.model})`
                : "○ Local LLM Bağla (AI Ayarları)"}
            </Link>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => applyPreset("iframe-compare")}
            >
              Şablon 1: Iframe Kabukta GWT ↔ React
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => applyPreset("manual-login-iframe")}
            >
              Şablon 2: Elle Login + Iframe Testi
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => applyPreset("direct-compare")}
            >
              Şablon 3: Doğrudan Ekran
            </Button>
          </div>
        }
      />

      {/* ---- LIVE MANUAL LOGIN GATE BANNER (WHEN PAUSED FOR USER LOGIN) ---- */}
      {isWaitingForManualLogin && activeExecutionId ? (
        <Card className="border-2 border-warning bg-warning/10 shadow-lg">
          <CardHeader className="flex-row items-start gap-3 space-y-0">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning text-black">
              <IconAlert width={22} height={22} />
            </span>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">
                  Tarayıcı Penceresi Açıldı — Giriş İşlemini Elinizle Tamamlayın
                </CardTitle>
                <Badge tone="warning">Manuel Giriş Bekleniyor</Badge>
              </div>
              <CardDescription className="mt-1 text-foreground/90">
                Worker bilgisayarınızda görünür bir Chromium penceresi açtı. Kullanıcı adı,
                şifre, Captcha, SMS veya kurumsal SSO girişinizi o pencerede tamamlayın.
                Ardından aşağıdaki butonlardan birine basarak testi başlatın (oturumunuz
                sonraki testler için de otomatik kaydedilir).
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => void onContinueManualLogin(false)}
              disabled={continueExecution.isPending}
            >
              <IconCheck />
              Giriş Yaptım → Verilen Ekran Path&apos;ine Git ve Testi Başlat
            </Button>
            <Button
              variant="secondary"
              onClick={() => void onContinueManualLogin(true)}
              disabled={continueExecution.isPending}
            >
              <IconPlay />
              Giriş Yaptım ve Ekranı Kendim Açtım → Olduğum Ekranda Test Et
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* ---- STEP 1: SCREEN CODE, MODE & URL + PATH CONFIGURATION ---- */}
      <Card>
        <CardHeader>
          <CardTitle>1. Test Edilecek Ekran, Path ve Giriş (Login) Ayarları</CardTitle>
          <CardDescription>
            Sunucu adresini (Base URL) ve test edilecek ekranın path/hash değerini girin.
            Hedef ekran bir <code>&lt;iframe&gt;</code> içinde çalışıyorsa otomatik algılanır
            ve içine girilerek test edilir.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="studio-screen-code">Ekran Kodu</Label>
              <Input
                id="studio-screen-code"
                className="font-mono"
                placeholder="KPY68"
                value={screenCode}
                onChange={(e) => setScreenCode(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="studio-screen-name">Ekran Adı / Senaryo Başlığı</Label>
              <Input
                id="studio-screen-name"
                placeholder="Parametre Tanımları"
                value={screenName}
                onChange={(e) => setScreenName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="studio-mode">Test & Rapor Modu</Label>
              <Select
                id="studio-mode"
                value={mode}
                onChange={(e) =>
                  setMode(e.target.value as "COMPARISON" | "DISCOVERY" | "COMBINATION")
                }
              >
                <option value="COMPARISON">
                  GWT ↔ React Karşılaştırma & Fark Raporu (Önerilen)
                </option>
                <option value="DISCOVERY">
                  Sadece GWT Ekran Keşfi & Etkileşim Raporu
                </option>
                <option value="COMBINATION">
                  Tam Kombinasyon Testi (GWT ↔ React)
                </option>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* ---- GWT APPLICATION CONFIG CARD ---- */}
            <div className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface-2/30 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AppTypeBadge appType="LEGACY_GWT" />
                  <span className="text-sm font-semibold">Eski Uygulama (GWT)</span>
                </div>
                <Badge tone="info">Kaynak / Beklenen Davranış</Badge>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="gwt-base-url">GWT Sunucu URL (Base URL)</Label>
                  <Input
                    id="gwt-base-url"
                    className="font-mono text-xs"
                    placeholder="http://localhost:9100"
                    value={gwtBaseUrl}
                    onChange={(e) => setGwtBaseUrl(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="gwt-path">Test Edilecek Ekran Path&apos;i / Hash</Label>
                  <Input
                    id="gwt-path"
                    className="font-mono text-xs"
                    placeholder="/fixtures/gwt-iframe-shell.html#KPY68"
                    value={gwtPath}
                    onChange={(e) => setGwtPath(e.target.value)}
                  />
                </div>
              </div>

              <p className="truncate rounded-md border border-border-subtle bg-surface px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
                Hedef Ekran Adresi: <span className="text-primary">{gwtFullUrl}</span>
              </p>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="gwt-auth-mode">GWT Giriş (Login) Yöntemi</Label>
                <Select
                  id="gwt-auth-mode"
                  value={gwtAuthMode}
                  onChange={(e) => setGwtAuthMode(e.target.value as StudioAuthMode)}
                >
                  <option value="NONE">
                    Giriş Gerekmiyor (veya Kayıtlı Oturum Varsa Otomatik Kullan)
                  </option>
                  <option value="MANUAL_INTERACTIVE">
                    Elimle Giriş Yapacağım (Test Başlarken Görünür Tarayıcı Aç & Bekle)
                  </option>
                  <option value="SAVED_SESSION">
                    Önceden Tarayıcıda Giriş Yap & Kaydettiğim Oturumu Kullan
                  </option>
                  <option value="TEST_ACCOUNT_FORM">
                    Otomatik Form Girişi (Seçiciler ve Kayıtlı Hesap ile)
                  </option>
                </Select>
              </div>

              {gwtAuthMode === "MANUAL_INTERACTIVE" ? (
                <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
                  <Label htmlFor="gwt-manual-login-url">
                    Giriş (Login) Sayfası URL&apos;si (Tarayıcı ilk burayı açar)
                  </Label>
                  <Input
                    id="gwt-manual-login-url"
                    className="font-mono text-xs"
                    placeholder="http://localhost:9100/fixtures/login.html"
                    value={gwtLoginUrl}
                    onChange={(e) => setGwtLoginUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    &quot;Testi Başlat&quot; dediğinizde görünür Chromium penceresi bu adresi
                    açar. Elinizle giriş yaptıktan sonra ekranda belirecek{" "}
                    <strong>&quot;Giriş Yaptım, Teste Başla&quot;</strong> butonuna
                    bastığınızda worker otomatik olarak{" "}
                    <code className="text-primary">{gwtPath || gwtBaseUrl}</code> ekranına
                    gidip testi koşturur.
                  </p>
                </div>
              ) : null}

              {gwtAuthMode === "SAVED_SESSION" ? (
                <div className="flex flex-col gap-2.5 rounded-lg border border-primary/40 bg-primary/5 p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="gwt-login-url-pre">Giriş URL&apos;si</Label>
                      <Input
                        id="gwt-login-url-pre"
                        className="font-mono text-xs"
                        value={gwtLoginUrl}
                        onChange={(e) => setGwtLoginUrl(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="gwt-profile-key">Oturum Profil Adı</Label>
                      <Input
                        id="gwt-profile-key"
                        className="font-mono text-xs"
                        value={gwtProfileKey}
                        onChange={(e) => setGwtProfileKey(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        void onOpenLoginBrowser(
                          gwtProfileKey,
                          gwtLoginUrl.trim() || gwtFullUrl,
                        )
                      }
                      disabled={openLoginWindow.isPending}
                    >
                      1. Tarayıcıda Giriş Penceresi Aç
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void onSaveLoginBrowser(gwtProfileKey)}
                      disabled={saveLoginSession.isPending}
                    >
                      2. Giriş Yaptım, Oturumu Kaydet
                    </Button>
                  </div>
                </div>
              ) : null}

              {gwtAuthMode === "TEST_ACCOUNT_FORM" ? (
                <div className="grid gap-2 rounded-lg border border-border-subtle bg-surface p-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <Label htmlFor="gwt-form-login-url">Login URL</Label>
                    <Input
                      id="gwt-form-login-url"
                      className="font-mono text-xs"
                      value={gwtLoginUrl}
                      onChange={(e) => setGwtLoginUrl(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="gwt-cred-ref">Kimlik Referansı</Label>
                    <Input
                      id="gwt-cred-ref"
                      className="font-mono text-xs"
                      value={gwtCredRef}
                      onChange={(e) => setGwtCredRef(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="gwt-user-sel">Kullanıcı Seçicisi</Label>
                    <Input
                      id="gwt-user-sel"
                      className="font-mono text-xs"
                      value={gwtUserSelector}
                      onChange={(e) => setGwtUserSelector(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="gwt-pass-sel">Şifre Seçicisi</Label>
                    <Input
                      id="gwt-pass-sel"
                      className="font-mono text-xs"
                      value={gwtPassSelector}
                      onChange={(e) => setGwtPassSelector(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="gwt-sub-sel">Gönder Seçicisi</Label>
                    <Input
                      id="gwt-sub-sel"
                      className="font-mono text-xs"
                      value={gwtSubmitSelector}
                      onChange={(e) => setGwtSubmitSelector(e.target.value)}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            {/* ---- REACT APPLICATION CONFIG CARD ---- */}
            <div
              className={`flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface-2/30 p-4 ${
                mode === "DISCOVERY" ? "opacity-50" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AppTypeBadge appType="REACT" />
                  <span className="text-sm font-semibold">Yeni Uygulama (React)</span>
                </div>
                <Badge tone={mode === "DISCOVERY" ? "muted" : "success"}>
                  {mode === "DISCOVERY"
                    ? "Keşif Modunda Kullanılmaz"
                    : "Karşılaştırılan Hedef"}
                </Badge>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="react-base-url">React Sunucu URL (Base URL)</Label>
                  <Input
                    id="react-base-url"
                    className="font-mono text-xs"
                    placeholder="http://localhost:9100"
                    value={reactBaseUrl}
                    disabled={mode === "DISCOVERY"}
                    onChange={(e) => setReactBaseUrl(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="react-path">React Ekran Path&apos;i / Route</Label>
                  <Input
                    id="react-path"
                    className="font-mono text-xs"
                    placeholder="/fixtures/react-iframe-shell.html#/kpy68"
                    value={reactPath}
                    disabled={mode === "DISCOVERY"}
                    onChange={(e) => setReactPath(e.target.value)}
                  />
                </div>
              </div>

              <p className="truncate rounded-md border border-border-subtle bg-surface px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
                Hedef Ekran Adresi: <span className="text-primary">{reactFullUrl}</span>
              </p>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="react-auth-mode">React Giriş (Login) Yöntemi</Label>
                <Select
                  id="react-auth-mode"
                  value={reactAuthMode}
                  disabled={mode === "DISCOVERY"}
                  onChange={(e) => setReactAuthMode(e.target.value as StudioAuthMode)}
                >
                  <option value="NONE">
                    Giriş Gerekmiyor (veya Kayıtlı Oturum Varsa Otomatik Kullan)
                  </option>
                  <option value="MANUAL_INTERACTIVE">
                    Elimle Giriş Yapacağım (Test Başlarken Görünür Tarayıcı Aç & Bekle)
                  </option>
                  <option value="SAVED_SESSION">
                    Önceden Tarayıcıda Giriş Yap & Kaydettiğim Oturumu Kullan
                  </option>
                </Select>
              </div>

              {reactAuthMode === "MANUAL_INTERACTIVE" && mode !== "DISCOVERY" ? (
                <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
                  <Label htmlFor="react-manual-login-url">React Giriş URL&apos;si</Label>
                  <Input
                    id="react-manual-login-url"
                    className="font-mono text-xs"
                    placeholder={reactBaseUrl}
                    value={reactLoginUrl}
                    onChange={(e) => setReactLoginUrl(e.target.value)}
                  />
                </div>
              ) : null}

              {reactAuthMode === "SAVED_SESSION" && mode !== "DISCOVERY" ? (
                <div className="flex flex-col gap-2.5 rounded-lg border border-primary/40 bg-primary/5 p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="react-login-url-pre">React Giriş URL</Label>
                      <Input
                        id="react-login-url-pre"
                        className="font-mono text-xs"
                        value={reactLoginUrl || reactFullUrl}
                        onChange={(e) => setReactLoginUrl(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="react-profile-key">Oturum Profil Adı</Label>
                      <Input
                        id="react-profile-key"
                        className="font-mono text-xs"
                        value={reactProfileKey}
                        onChange={(e) => setReactProfileKey(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        void onOpenLoginBrowser(
                          reactProfileKey,
                          reactLoginUrl.trim() || reactFullUrl,
                        )
                      }
                      disabled={openLoginWindow.isPending}
                    >
                      1. Tarayıcıda Giriş Penceresi Aç
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void onSaveLoginBrowser(reactProfileKey)}
                      disabled={saveLoginSession.isPending}
                    >
                      2. Giriş Yaptım, Oturumu Kaydet
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* ---- SAVED SESSIONS BAR ---- */}
          {sessionData && sessionData.sessions.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-success">● Hazır Kayıtlı Oturumlar:</span>
                {sessionData.sessions.map((sess) => (
                  <span
                    key={sess.profileKey}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-surface px-2 py-0.5 font-mono"
                  >
                    <strong>{sess.profileKey}</strong> ({sess.cookieCount} çerez
                    {sess.windowOpen ? " · pencere açık" : ""})
                    <button
                      type="button"
                      className="text-danger hover:underline"
                      title="Oturumu sil"
                      onClick={() => void deleteSession.mutateAsync(sess.profileKey)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {sessionMessage ? (
            <p className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
              {sessionMessage}
            </p>
          ) : null}

          {launchError ? (
            <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {launchError}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface-2/40 p-3">
            <div className="flex flex-wrap items-center gap-5 text-sm">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border-subtle bg-surface"
                  checked={checkPdfFields}
                  onChange={(event) => setCheckPdfFields(event.target.checked)}
                />
                <span>
                  <strong>Form → PDF alan kontrolü</strong>
                  <span className="ml-1 text-xs text-muted-foreground">
                    (doldurulan alanların PDF çıktısında eksik/yanlış olup olmadığı)
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border-subtle bg-surface"
                  checked={checkDocumentWorkflows}
                  onChange={(event) => setCheckDocumentWorkflows(event.target.checked)}
                />
                <span>
                  <strong>İmzaya Gönder / Yayınla akışını da test et</strong>
                  <span className="ml-1 text-xs text-warning">
                    (yalnızca test ortamında; gerçek iş akışı tetikleyebilir)
                  </span>
                </span>
              </label>
            </div>
            {checkDocumentWorkflows ? (
              <p className="rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
                Dikkat: Bu seçenek her iki uygulamada da “İmzaya Gönder” ve “Yayınla”
                butonlarını gerçekten tıklar. Yalnızca izole test ortamında kullanın.
              </p>
            ) : null}
          </div>

          {/* ---- ACTION BAR ---- */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => void onStartStudioTest()}
                disabled={isLaunching}
              >
                <IconPlay />
                {isLaunching
                  ? "Hazırlanıyor ve Başlatılıyor…"
                  : mode === "COMPARISON"
                    ? "Ekranları Karşılaştır & Rapor Çıkart"
                    : mode === "COMBINATION"
                      ? "Kombinasyon Testini Başlat & Rapor Çıkart"
                      : "GWT Ekranını Test Et & Rapor Çıkart"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  void onOpenLoginBrowser(
                    gwtProfileKey,
                    gwtLoginUrl.trim() || gwtFullUrl,
                  )
                }
                disabled={openLoginWindow.isPending}
              >
                <IconLayers />
                GWT Tarayıcısını Şimdi Aç (Elle Giriş Yap)
              </Button>
              {sessionData?.sessions.some((s) => s.windowOpen) ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void onSaveLoginBrowser(gwtProfileKey)}
                  disabled={saveLoginSession.isPending}
                >
                  <IconCheck />
                  Açık Tarayıcıdaki Oturumu Kaydet
                </Button>
              ) : null}
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowIframePreview((v) => !v)}
            >
              {showIframePreview ? "Canlı İframe Önizlemeyi Gizle" : "Canlı İframe Önizlemeyi Göster"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ---- CONFLUENCE NEW DEVELOPMENT & REQUIREMENT CHECK ---- */}
      <Card className="border-info/40">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <IconFileText className="text-info" />
            <CardTitle>Confluence Yeni Geliştirme & Gereksinim Kontrolü</CardTitle>
            {confluenceResult ? (
              <Badge
                tone={
                  confluenceResult.missingOrReviewCount > 0 ? "warning" : "success"
                }
              >
                {confluenceResult.missingOrReviewCount > 0
                  ? `${confluenceResult.missingOrReviewCount} madde ekranda eksik / inceleme gerekli`
                  : "Tüm maddeler ekranda doğrulandı"}
              </Badge>
            ) : null}
          </div>
          <CardDescription>
            Confluence sayfasını canlı çekin veya yeni geliştirme maddelerini doğrudan
            yapıştırın. Sistem bunları en son keşfedilen GWT/React ekran elemanlarıyla
            karşılaştırır; eksik geliştirmeler Markdown raporuna da işlenir.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confluence-base-url">Confluence Base URL</Label>
              <Input
                id="confluence-base-url"
                className="font-mono text-xs"
                placeholder="https://confluence.sirket.local"
                value={confluenceBaseUrl}
                onChange={(event) => setConfluenceBaseUrl(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confluence-page-id">Sayfa ID</Label>
              <Input
                id="confluence-page-id"
                className="font-mono text-xs"
                placeholder="123456"
                value={confluencePageId}
                onChange={(event) => setConfluencePageId(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confluence-token">Bearer Token (isteğe bağlı)</Label>
              <Input
                id="confluence-token"
                type="password"
                autoComplete="off"
                className="font-mono text-xs"
                placeholder="Sunucu ortam değişkeni varsa boş bırakın"
                value={confluenceToken}
                onChange={(event) => setConfluenceToken(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confluence-raw-content">
              Yeni Geliştirme / Gereksinim Maddeleri (her satırda bir madde)
            </Label>
            <Textarea
              id="confluence-raw-content"
              className="min-h-28 font-mono text-xs"
              placeholder={"- KPY68 ekranına 'Son Geçerlilik Tarihi' alanı eklenecek.\n- İmzaya Gönder butonu zorunlu alanlar dolu olduğunda etkinleşmeli.\n- Oluşan PDF'te Açıklama ve Başlangıç Tarihi yer almalı."}
              value={confluenceRawContent}
              onChange={(event) => setConfluenceRawContent(event.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => void onCheckConfluence()}
              disabled={isCheckingConfluence || !activeProjectId}
            >
              <IconSparkles />
              {isCheckingConfluence
                ? "Confluence & Ekran Karşılaştırılıyor…"
                : "Confluence Yeni Geliştirmeleri Kontrol Et"}
            </Button>
            {!activeProjectId ? (
              <span className="text-xs text-muted-foreground">
                Önce ekranı bir kez çalıştırın; karşılaştırma keşfedilen elemanları kullanır.
              </span>
            ) : null}
            {confluenceResult ? (
              <span className="text-xs text-muted-foreground">
                {confluenceResult.imported} yeni madde import edildi ·{" "}
                {confluenceResult.verifiedCount}/{confluenceResult.totalRequirements} doğrulandı
              </span>
            ) : null}
          </div>

          {confluenceRequirements.length > 0 ? (
            <div className="max-h-72 overflow-y-auto rounded-xl border border-border-subtle">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Durum</TableHead>
                    <TableHead>Confluence / Gereksinim Maddesi</TableHead>
                    <TableHead>Eşleşen Ekran Elemanları</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {confluenceRequirements.map((requirement) => {
                    const matched = requirement.coverage?.matchedElements;
                    const verified = requirement.status === "VERIFIED";
                    return (
                      <TableRow key={requirement.id}>
                        <TableCell>
                          <Badge tone={verified ? "success" : "warning"}>
                            {verified
                              ? "Ekranda mevcut"
                              : requirement.status === "PENDING"
                                ? "Keşif bekliyor"
                                : "Eksik / inceleme gerekli"}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-xl text-xs">
                          <p className="font-medium">{requirement.title}</p>
                          {requirement.sourceUrl ? (
                            <a
                              href={requirement.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-primary hover:underline"
                            >
                              Confluence kaynağı ↗
                            </a>
                          ) : null}
                        </TableCell>
                        <TableCell className="max-w-sm font-mono text-[11px] text-muted-foreground">
                          {Array.isArray(matched) && matched.length > 0
                            ? matched.join(", ")
                            : "Eşleşme yok"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* ---- STEP 2: LIVE IFRAME SCREEN PREVIEW (SIDE BY SIDE) ---- */}
      {showIframePreview ? (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <div>
              <CardTitle>2. Canlı İframe Ekran Önizlemesi</CardTitle>
              <CardDescription>
                Verdiğiniz URL ve ekran path&apos;inin canlı iframe görünümü. İframe içinden
                ekranları inceleyebilir ve etkileşimleri elle de deneyebilirsiniz.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIframeRefreshKey((k) => k + 1)}
              >
                İframe&apos;leri Yenile
              </Button>
              <a
                href={gwtFullUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center rounded-lg border border-border-subtle bg-surface-2 px-3 text-xs font-medium hover:bg-surface-2/70"
              >
                GWT Yeni Sekmede Aç ↗
              </a>
              {mode !== "DISCOVERY" ? (
                <a
                  href={reactFullUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center rounded-lg border border-border-subtle bg-surface-2 px-3 text-xs font-medium hover:bg-surface-2/70"
                >
                  React Yeni Sekmede Aç ↗
                </a>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            <div
              className={`grid gap-4 ${
                mode === "DISCOVERY" ? "grid-cols-1" : "lg:grid-cols-2"
              }`}
            >
              <div className="flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface">
                <div className="flex items-center justify-between border-b border-border-subtle bg-surface-2 px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <AppTypeBadge appType="LEGACY_GWT" />
                    <span className="font-mono text-muted-foreground">{gwtPath || "/"}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">Canlı Iframe</span>
                </div>
                <iframe
                  key={`gwt-${iframeRefreshKey}-${gwtFullUrl}`}
                  src={toPreviewIframeSrc(gwtFullUrl)}
                  title="GWT Live Screen Preview"
                  className="h-[430px] w-full border-0 bg-white"
                />
              </div>

              {mode !== "DISCOVERY" ? (
                <div className="flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface">
                  <div className="flex items-center justify-between border-b border-border-subtle bg-surface-2 px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <AppTypeBadge appType="REACT" />
                      <span className="font-mono text-muted-foreground">
                        {reactPath || "/"}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">Canlı Iframe</span>
                  </div>
                  <iframe
                    key={`react-${iframeRefreshKey}-${reactFullUrl}`}
                    src={toPreviewIframeSrc(reactFullUrl)}
                    title="React Live Screen Preview"
                    className="h-[430px] w-full border-0 bg-white"
                  />
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* ---- STEP 3: LIVE EXECUTION & REPORT OUTPUT ---- */}
      {activeExecutionId ? (
        <div className="flex flex-col gap-6">
          <Card className="border-primary/40">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <CardTitle>
                    3. Ekran Test Raporu — Çalıştırma #{activeExecutionId} ({screenCode})
                  </CardTitle>
                  {liveStatus ? <StatusBadge status={liveStatus} /> : null}
                  <Badge tone="muted">{MODE_LABELS[mode] ?? mode}</Badge>
                </div>
                <CardDescription className="mt-1">
                  {execution
                    ? `Süre: ${formatDuration(execution.startedAt, execution.finishedAt)} · ${
                        stream.connected ? "● Canlı SSE akışı aktif" : "○ Tamamlandı"
                      }`
                    : "Çalıştırma verileri yükleniyor…"}
                </CardDescription>
              </div>

              {reportBase ? (
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={`${reportBase}/report.md`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-info/40 bg-info/10 px-4 text-sm font-medium text-info hover:bg-info/20"
                  >
                    <IconFileText />
                    Hata Raporu (.md İndir)
                  </a>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void onLoadMarkdownReport()}
                    disabled={isLoadingMarkdown}
                  >
                    {isLoadingMarkdown ? "Yükleniyor…" : "Markdown Raporunu Gör"}
                  </Button>
                  <a
                    href={`${reportBase}/report.pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    <IconFileText />
                    PDF Raporu İndir
                  </a>
                  <a
                    href={`${reportBase}/report`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-subtle bg-surface-2 px-4 text-sm font-medium hover:bg-surface-2/70"
                  >
                    JSON Raporu
                  </a>
                  <Link
                    href={`/executions/${activeExecutionId}`}
                    className="inline-flex h-9 items-center gap-1 rounded-lg border border-border-subtle bg-surface-2 px-3 text-sm font-medium hover:bg-surface-2/70"
                  >
                    Tam Ekran Rapor
                    <IconChevronRight width={14} height={14} />
                  </Link>
                </div>
              ) : null}
            </CardHeader>

            <CardContent className="flex flex-col gap-5">
              {/* Summary Metrics */}
              <div className="grid gap-4 sm:grid-cols-4">
                <StatCard
                  label="Keşfedilen Eleman"
                  value={elements?.length ?? 0}
                  hint={
                    iframeElementCount > 0
                      ? `${iframeElementCount} tanesi <iframe> içinden`
                      : "Ana DOM + Iframe"
                  }
                />
                <StatCard
                  label="Yürütülen Adım"
                  value={execution?.totalSteps ?? 0}
                  hint={`Geçen: ${execution?.passedSteps ?? 0}`}
                />
                <StatCard
                  label="Bağımlılık Gözlemi"
                  value={observations?.length ?? 0}
                  hint="Alan etkileşim kuralları"
                />
                <StatCard
                  label="Tespit Edilen Fark / Hata"
                  value={findings?.length ?? execution?.failedSteps ?? 0}
                  hint={
                    (findings?.length ?? 0) > 0
                      ? "GWT ↔ React davranış farkı"
                      : "Henüz fark yok"
                  }
                />
              </div>

              {markdownReport ? (
                <div className="flex flex-col gap-2 rounded-xl border border-info/40 bg-info/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-info">
                      Geliştiriciye Yönelik Markdown Hata & Fark Raporu
                    </h3>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => void onCopyMarkdownReport()}
                    >
                      Markdown Panoya Kopyala
                    </Button>
                  </div>
                  <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border-subtle bg-surface p-3 font-mono text-[11px] leading-relaxed">
                    {markdownReport}
                  </pre>
                </div>
              ) : null}

              {/* ---- LOCAL LLM (AI) TEST CASE GENERATOR & ROOT CAUSE ANALYZER ---- */}
              <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <IconSparkles className="text-primary" />
                    <span className="text-sm font-semibold">
                      Şirket İçi Local LLM (AI) — Test Case Üretimi & Fark Analizi
                    </span>
                    <Badge tone={aiStatus?.configured ? "success" : "warning"}>
                      {aiStatus?.configured
                        ? `Bağlı: ${aiStatus.model}`
                        : "AI Yapılandırılmadı"}
                    </Badge>
                  </div>
                  <Link
                    href="/ai-config"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Local LLM URL / Model Ayarları →
                  </Link>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={aiCommand}
                    onChange={(e) => setAiCommand(e.target.value)}
                    placeholder="Local LLM'e üretmesini istediğiniz test senaryosunu yazın..."
                    className="flex-1 text-xs"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void onGenerateAiScenario()}
                    disabled={isGeneratingAiPlan || !elements || elements.length === 0}
                  >
                    <IconSparkles />
                    {isGeneratingAiPlan
                      ? "Local LLM Test Case Üretiyor…"
                      : "AI ile Test Case Çıkart & Onayla"}
                  </Button>
                  {findings && findings.length > 0 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => void onAnalyzeWithAi()}
                      disabled={isAnalyzingAi}
                    >
                      <IconCpu />
                      {isAnalyzingAi ? "Analiz Ediliyor…" : "Farkları AI ile Analiz Et"}
                    </Button>
                  ) : null}
                </div>

                {aiError ? (
                  <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                    {aiError}
                  </p>
                ) : null}

                {generatedScenario ? (
                  <div className="flex flex-col gap-2 rounded-lg border border-success/40 bg-surface p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold text-success">
                          ✓ Local LLM Test Case Üretti ve Onaylandı:
                        </span>{" "}
                        <strong>{generatedScenario.name}</strong>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void onStartStudioTest("COMPARISON")}
                        disabled={isLaunching}
                      >
                        <IconPlay />
                        Bu AI Test Case&apos;ini GWT ↔ React Üzerinde Koştur
                      </Button>
                    </div>
                    <pre className="max-h-40 overflow-y-auto rounded bg-surface-2 p-2 font-mono text-[11px]">
                      {JSON.stringify(generatedScenario.plan, null, 2)}
                    </pre>
                  </div>
                ) : null}

                {aiHypothesis ? (
                  <div className="rounded-lg border border-primary/40 bg-surface p-3 text-xs">
                    <p className="mb-1 font-semibold text-primary">
                      Local LLM Kök Neden Analizi (GWT ↔ React Farkları):
                    </p>
                    <p className="whitespace-pre-wrap text-foreground/90">{aiHypothesis}</p>
                  </div>
                ) : null}
              </div>

              {/* Behavioral Differences / Findings */}
              {findings && findings.length > 0 ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-danger">
                      Tespit Edilen GWT ↔ React Davranış Farkları ({findings.length})
                    </h3>
                    <Link className="text-xs text-primary hover:underline" href="/bugs">
                      Tüm Hata Raporları →
                    </Link>
                  </div>
                  <div className="grid gap-3">
                    {findings.map((finding) => (
                      <div
                        key={finding.id}
                        className={`flex flex-col gap-2 rounded-lg border border-border-subtle px-3.5 py-3 ${
                          finding.severity === "HIGH"
                            ? "border-l-4 border-l-danger bg-danger/5"
                            : "border-l-4 border-l-warning bg-warning/5"
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-primary/15 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                            {finding.bugCode}
                          </span>
                          <Badge
                            tone={finding.severity === "HIGH" ? "danger" : "warning"}
                          >
                            {finding.severity === "HIGH" ? "Yüksek" : "Orta"} ·{" "}
                            {finding.category}
                          </Badge>
                          <p className="min-w-0 flex-1 text-sm font-semibold">
                            {finding.title}
                          </p>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <p className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-xs">
                            <span className="font-semibold text-success">
                              Eski (GWT) Beklenen:
                            </span>{" "}
                            <span>{finding.expectedBehavior ?? "—"}</span>
                          </p>
                          <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-xs">
                            <span className="font-semibold text-danger">
                              Yeni (React) Gerçekleşen:
                            </span>{" "}
                            <span>{finding.actualBehavior ?? "—"}</span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Side-by-Side Screenshots Evidence */}
              {artifacts &&
              artifacts.filter((a) => a.artifactType === "SCREENSHOT").length > 0 ? (
                <div className="flex flex-col gap-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Kanıt Ekran Görüntüleri
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {artifacts
                      .filter((a) => a.artifactType === "SCREENSHOT")
                      .map((shot) => (
                        <figure
                          key={shot.id}
                          className="flex flex-col gap-1.5 overflow-hidden rounded-xl border border-border-subtle bg-surface-2/30 p-2"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={artifactContentUrl(shot.id)}
                            alt={shot.displayName}
                            className="max-h-80 w-full rounded-lg border border-border-subtle object-contain bg-white"
                          />
                          <figcaption className="px-1 font-mono text-xs text-muted-foreground">
                            {shot.displayName}
                          </figcaption>
                        </figure>
                      ))}
                  </div>
                </div>
              ) : null}

              {/* Generated PDF Evidence (real downloads captured by the worker) */}
              {artifacts && artifacts.filter((a) => a.artifactType === "PDF").length > 0 ? (
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Üretilen PDF Kanıtları (form → PDF doğrulaması)
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {artifacts
                      .filter((a) => a.artifactType === "PDF")
                      .map((pdf) => (
                        <a
                          key={pdf.id}
                          href={artifactContentUrl(pdf.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-lg border border-info/40 bg-info/10 px-3 py-2 text-xs font-medium text-info hover:bg-info/20"
                        >
                          <IconFileText />
                          {pdf.displayName}
                          <span className="font-mono text-[11px] opacity-80">
                            ({Math.round((pdf.byteSize ?? 0) / 1024)} KB)
                          </span>
                        </a>
                      ))}
                  </div>
                </div>
              ) : null}

              {/* Discovered Elements (with Iframe Badges) */}
              {elements && elements.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Keşfedilen Ekran Elemanları ({elements.length})
                  </h3>
                  <div className="max-h-80 overflow-y-auto rounded-xl border border-border-subtle">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ref</TableHead>
                          <TableHead>Etiket</TableHead>
                          <TableHead>Tip</TableHead>
                          <TableHead>Değer</TableHead>
                          <TableHead>Konum (DOM / Iframe)</TableHead>
                          <TableHead>Durum</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {elements.map((el) => {
                          const iframeMatch = el.domPath?.match(/^\[iframe:\s*([^\]]+)\]/);
                          return (
                            <TableRow key={el.ref}>
                              <TableCell className="font-mono text-xs text-primary">
                                {el.ref}
                              </TableCell>
                              <TableCell className="max-w-44 truncate font-medium">
                                {el.label ?? "—"}
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {el.elementType}
                              </TableCell>
                              <TableCell className="max-w-40 truncate text-xs text-muted-foreground">
                                {el.value ?? "—"}
                              </TableCell>
                              <TableCell className="text-xs">
                                {iframeMatch ? (
                                  <Badge tone="info">{iframeMatch[1]}</Badge>
                                ) : (
                                  <span className="text-muted-foreground">Ana Sayfa</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  <Badge tone={el.enabled ? "success" : "muted"}>
                                    {el.enabled ? "etkin" : "pasif"}
                                  </Badge>
                                  <Badge tone={el.visible ? "info" : "warning"}>
                                    {el.visible ? "görünür" : "gizli"}
                                  </Badge>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : null}

              {/* Live Event Stream */}
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Canlı Yürütme Günlüğü ({stream.events.length} adım)
                </h3>
                <div className="max-h-64 overflow-y-auto rounded-xl border border-border-subtle bg-surface-2/20 divide-y divide-border-subtle">
                  {stream.events.map((ev) => (
                    <div key={ev.seq} className="flex items-start gap-2.5 px-3 py-2 text-xs">
                      <span className="font-mono text-muted-foreground">#{ev.seq}</span>
                      <Badge
                        tone={
                          ev.type === "ERROR"
                            ? "danger"
                            : ev.type === "WARNING"
                              ? "warning"
                              : ev.type === "RESULT"
                                ? "success"
                                : "muted"
                        }
                      >
                        {ev.type}
                      </Badge>
                      <span className="flex-1">{ev.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
