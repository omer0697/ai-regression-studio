"use client";

import { IconCpu, IconSparkles } from "@/components/icons";
import { PageHeader } from "@/components/page-parts";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAiStatus } from "@/lib/api-hooks";

export default function AiConfigPage() {
  const { data: status, isLoading } = useAiStatus();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="AI Ayarları"
        description="Şirket içi DeepSeek uç noktası için yapılandırma durumu. Anahtar asla arayüzde gösterilmez."
      />

      {isLoading || !status ? (
        <div className="h-32 animate-pulse rounded-xl bg-surface-2/50" />
      ) : (
        <>
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-2">
                <IconCpu className="text-primary" />
                <div>
                  <CardTitle>Sağlayıcı Durumu</CardTitle>
                  <CardDescription>
                    OpenAI-uyumlu sohbet tamamlama adaptörü (vision gerekmez;
                    istemler DOM/eleman anlık görüntüsünden üretilir).
                  </CardDescription>
                </div>
              </div>
              <Badge tone={status.configured ? "success" : "warning"}>
                {status.configured ? "Yapılandırıldı" : "Yapılandırılmadı"}
              </Badge>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              <p className="text-muted-foreground">
                Temel URL:{" "}
                <span className="font-mono text-foreground">
                  {status.baseUrl || "—"}
                </span>
              </p>
              <p className="text-muted-foreground">
                Model:{" "}
                <span className="font-mono text-foreground">{status.model || "—"}</span>
              </p>
              <p className="text-muted-foreground">
                Zaman aşımı:{" "}
                <span className="text-foreground">{status.timeoutSeconds ?? "—"} sn</span>
              </p>
              <p className="text-muted-foreground">
                Maks. çıktı jetonu:{" "}
                <span className="text-foreground">{status.maxOutputTokens ?? "—"}</span>
              </p>
              <p className="text-muted-foreground">
                API anahtarı:{" "}
                <span className="text-foreground">
                  {status.apiKeyPresent ? "mevcut (gösterilmez)" : "—"}
                </span>
              </p>
            </CardContent>
          </Card>

          {!status.configured ? (
            <Card className="border-warning/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IconSparkles className="text-warning" />
                  AI yapılandırılmadı — platform dürüst çalışıyor
                </CardTitle>
                <CardDescription>
                  AI özellikleri (plan üretimi, kök-neden analizi){" "}
                  <span className="font-medium">AI_NOT_CONFIGURED</span> ile net biçimde
                  reddedilir; hiçbir AI çıktısı uydurulmaz. Platformun geri kalanı (keşif,
                  bağımlılık gözlemi, kanıt üretimi) tam çalışır durumdadır.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Etkinleştirmek için API ortam değişkenleri
                </p>
                <pre className="rounded-lg bg-surface-2/60 p-3 font-mono text-xs">{`AI_BASE_URL=https://deepseek.sirket.local
AI_MODEL=deepseek-chat
AI_API_KEY=********
AI_TIMEOUT_SECONDS=60
AI_MAX_OUTPUT_TOKENS=2048`}</pre>
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
              {status.allowedActions.map((action) => (
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
