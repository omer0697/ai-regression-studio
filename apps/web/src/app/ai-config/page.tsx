"use client";

import { useState } from "react";

import { IconCheck, IconCpu, IconX } from "@/components/icons";
import { PageHeader } from "@/components/page-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-client";
import type { AiSettingsInfo } from "@/lib/api-client";
import {
  useAiSettings,
  useAiStatus,
  useTestAiSettings,
  useUpdateAiSettings,
} from "@/lib/api-hooks";
import { useSession } from "@/lib/session";
import { formatDate } from "@/lib/utils";

type Feedback = { kind: "idle" } | { kind: "success"; detail: string } | { kind: "error"; detail: string };

function FeedbackBanner({ feedback }: { feedback: Feedback }) {
  if (feedback.kind === "idle") {
    return null;
  }
  return (
    <p
      className={
        feedback.kind === "success"
          ? "flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success"
          : "rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
      }
    >
      {feedback.kind === "success" ? <IconCheck /> : <IconX />}
      {feedback.detail}
    </p>
  );
}

/**
 * The editable settings form. Mounts only after the effective settings have
 * loaded, so the initial values come straight from props (no effect-based
 * prefill). Re-keyed by updatedAt after each save to show the stored values.
 */
function SettingsForm({
  initial,
  isAdmin,
  onSaved,
}: {
  initial: AiSettingsInfo;
  isAdmin: boolean;
  onSaved: () => void;
}) {
  const updateSettings = useUpdateAiSettings();
  const testSettings = useTestAiSettings();

  const [enabled, setEnabled] = useState(initial.configured || initial.enabled);
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl ?? "");
  const [model, setModel] = useState(initial.model ?? "");
  const [apiKey, setApiKey] = useState("");
  const [timeoutSeconds, setTimeoutSeconds] = useState(String(initial.timeoutSeconds ?? 60));
  const [maxOutputTokens, setMaxOutputTokens] = useState(String(initial.maxOutputTokens ?? 2048));
  const [saveFeedback, setSaveFeedback] = useState<Feedback>({ kind: "idle" });
  const [testFeedback, setTestFeedback] = useState<Feedback>({ kind: "idle" });

  const onSave = async () => {
    setSaveFeedback({ kind: "idle" });
    try {
      await updateSettings.mutateAsync({
        enabled,
        baseUrl: baseUrl.trim() || undefined,
        model: model.trim() || undefined,
        apiKey: apiKey.trim() || undefined,
        timeoutSeconds: Number(timeoutSeconds) || undefined,
        maxOutputTokens: Number(maxOutputTokens) || undefined,
      });
      setApiKey("");
      setSaveFeedback({ kind: "success", detail: "Ayarlar kaydedildi." });
      onSaved();
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      setSaveFeedback({
        kind: "error",
        detail:
          apiError?.code === "AI_CONFIG_INCOMPLETE"
            ? "AI'ı etkinleştirmek için temel URL, model ve API anahtarı zorunludur."
            : (apiError?.message ?? "Ayarlar kaydedilemedi."),
      });
    }
  };

  const onTest = async () => {
    setTestFeedback({ kind: "idle" });
    try {
      const result = await testSettings.mutateAsync();
      setTestFeedback(
        result.ok
          ? { kind: "success", detail: result.detail }
          : { kind: "error", detail: result.detail },
      );
    } catch {
      setTestFeedback({ kind: "error", detail: "Test isteği gönderilemedi." });
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <IconCpu className="text-primary" />
          <div>
            <CardTitle>Sağlayıcı Yapılandırması</CardTitle>
            <CardDescription>
              Kaydettiğinizde ortam değişkenlerinin yerine geçer; API yeniden
              başlatma gerektirmeden bu ayarları kullanır.
              {initial.updatedAt ? ` Son güncelleme: ${formatDate(initial.updatedAt)}.` : ""}
            </CardDescription>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border-subtle bg-surface-2"
            checked={enabled}
            disabled={!isAdmin}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          AI etkin
        </label>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="ai-base-url">Temel URL</Label>
            <Input
              id="ai-base-url"
              placeholder="https://deepseek.sirket.local/v1"
              value={baseUrl}
              disabled={!isAdmin}
              onChange={(event) => setBaseUrl(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              OpenAI-uyumlu /chat/completions uç noktasının temel adresi.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="ai-model">Model</Label>
            <Input
              id="ai-model"
              placeholder="deepseek-chat"
              value={model}
              disabled={!isAdmin}
              onChange={(event) => setModel(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="ai-api-key">API anahtarı</Label>
            <Input
              id="ai-api-key"
              type="password"
              autoComplete="off"
              placeholder={
                initial.apiKeyPresent
                  ? "Kayıtlı — değiştirmek istemiyorsanız boş bırakın"
                  : "Anahtarı buraya girin"
              }
              value={apiKey}
              disabled={!isAdmin}
              onChange={(event) => setApiKey(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Yalnızca yazılır; hiçbir yanıtta geri döndürülmez. Boş bırakırsanız
              kayıtlı anahtar korunur.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="ai-timeout">Zaman aşımı (sn)</Label>
            <Input
              id="ai-timeout"
              type="number"
              min={1}
              max={600}
              value={timeoutSeconds}
              disabled={!isAdmin}
              onChange={(event) => setTimeoutSeconds(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="ai-max-tokens">Maks. çıktı jetonu</Label>
            <Input
              id="ai-max-tokens"
              type="number"
              min={64}
              max={32768}
              value={maxOutputTokens}
              disabled={!isAdmin}
              onChange={(event) => setMaxOutputTokens(event.target.value)}
            />
          </div>
        </div>

        <FeedbackBanner feedback={saveFeedback} />

        {!isAdmin ? (
          <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
            Bu ekranı yalnızca ADMIN rolü düzenleyebilir.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void onSave()} disabled={!isAdmin || updateSettings.isPending}>
            {updateSettings.isPending ? "Kaydediliyor…" : "Kaydet"}
          </Button>
          <Button
            variant="outline"
            onClick={() => void onTest()}
            disabled={!isAdmin || testSettings.isPending || !initial.configured}
          >
            {testSettings.isPending ? "Test ediliyor…" : "Bağlantıyı Test Et"}
          </Button>
          <span className="text-xs text-muted-foreground">
            {initial.configured
              ? "Test, kayıtlı ayarlarla küçük bir istek gönderir."
              : "Test için önce geçerli ayarları kaydedin."}
          </span>
        </div>

        <FeedbackBanner feedback={testFeedback} />
      </CardContent>
    </Card>
  );
}

export default function AiConfigPage() {
  const { user } = useSession();
  const isAdmin = user?.role === "ADMIN";
  const { data: settings, isLoading } = useAiSettings();
  const { data: status } = useAiStatus();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="AI Ayarları"
        description="OpenAI-uyumlu sağlayıcıyı (örn. şirket içi DeepSeek) ekrandan yönetin. Anahtar asla arayüzde gösterilmez veya geri döndürülmez."
        actions={
          status ? (
            <Badge tone={status.configured ? "success" : "warning"}>
              {status.configured ? "Yapılandırıldı" : "Yapılandırılmadı"} ·{" "}
              {status.source === "DATABASE" ? "Ekran Ayarları" : "Ortam Değişkenleri"}
            </Badge>
          ) : null
        }
      />

      {isLoading || !settings ? (
        <div className="h-32 animate-pulse rounded-xl bg-surface-2/50" />
      ) : (
        <>
          <SettingsForm
            key={settings.updatedAt ?? "initial"}
            initial={settings}
            isAdmin={isAdmin}
            onSaved={() => undefined}
          />

          {!settings.configured ? (
            <Card className="border-warning/40">
              <CardHeader>
                <CardTitle>AI yapılandırılmadı — platform dürüst çalışıyor</CardTitle>
                <CardDescription>
                  AI özellikleri (plan üretimi, kök-neden analizi){" "}
                  <span className="font-medium">AI_NOT_CONFIGURED</span> ile net biçimde
                  reddedilir; hiçbir AI çıktısı uydurulmaz. Platformun geri kalanı (keşif,
                  bağımlılık gözlemi, kanıt üretimi) tam çalışır durumdadır.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Yukarıdaki forma sağlayıcı bilgilerini girip kaydedin; ayarlar
                  veritabanında saklanır ve yeniden başlatma gerekmeden devreye girer.
                </p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Politika: İzinli Aksiyon Sözlüğü</CardTitle>
              <CardDescription>
                AI yanıtları yalnızca bu kapalı sözlükle doğrulanır; sözlük dışı
                aksiyonlar, bilinmeyen alanlar ve seçici-benzeri hedefler reddedilir.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {(status?.allowedActions ?? []).map((action) => (
                <Badge key={action} tone="info">
                  {action}
                </Badge>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
