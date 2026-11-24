"use client";

import Link from "next/link";

import { IconChat, IconChevronRight, IconLayers, IconPlay } from "@/components/icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState, PageHeader, StatCard } from "@/components/page-parts";
import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useDashboard } from "@/lib/api-hooks";
import { MODE_LABELS, formatDate } from "@/lib/utils";

const CAPABILITY_LABELS: Record<string, string> = {
  browserAutomation: "Tarayıcı otomasyonu",
  elementDiscovery: "Eleman keşfi",
  screenshot: "Ekran görüntüsü",
  traceRecording: "Trace kaydı",
  networkObservation: "Ağ gözlemi",
};

function OnboardingCard() {
  const steps = [
    {
      title: "Proje oluşturun",
      description: "Her proje bir migration kapsamıdır (örn. KAP GWT → React).",
      href: "/projects",
      linkLabel: "Projeler",
    },
    {
      title: "Ortamları tanımlayın",
      description:
        "Proje detayında eski (GWT) ve yeni (React) uygulamanın adreslerini ekleyin; yerelde çalışan uygulamayı da test edebilirsiniz.",
    },
    {
      title: "Ekran ekleyip çalıştırın",
      description:
        "Hedef ekranı kaydedin, Keşif / Karşılaştırma / Kombinasyon modunda çalıştırın.",
    },
    {
      title: "Farkları inceleyin",
      description:
        "Tespit edilen hatalar kanıtlarıyla Hata Raporları sayfasında listelenir.",
      href: "/bugs",
      linkLabel: "Hata Raporları",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Başlangıç Rehberi</CardTitle>
        <CardDescription>
          Dört adımda ilk regresyon karşılaştırmanızı çalıştırın.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-4">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{step.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>
                {step.href && step.linkLabel ? (
                  <Link
                    className="mt-1 inline-block text-xs text-primary hover:underline"
                    href={step.href}
                  >
                    {step.linkLabel} →
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { data, isLoading, isError } = useDashboard();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Panel"
        description="Migration projelerinin regresyon test durumunu tek ekrandan takip edin."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              href="/studio"
            >
              <IconPlay />
              Ekran Test & Rapor Stüdyosu
            </Link>
            <Link
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-subtle bg-surface-2 px-4 text-sm font-medium hover:bg-surface-2/70"
              href="/chat"
            >
              <IconChat />
              Proje Sohbeti
            </Link>
          </div>
        }
      />

      <Card className="border-primary/40 bg-primary/5">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-4 space-y-0">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <IconLayers width={20} height={20} />
            </span>
            <div>
              <CardTitle>Hızlı GWT ↔ React Ekran & Iframe Test Stüdyosu</CardTitle>
              <CardDescription className="mt-1">
                Uygulama URL&apos;sini ve test edilecek ekranın path&apos;ini verin, login
                aşamasını ister elinizle görünür tarayıcıda geçin ister oturumu kaydedin,
                iframe ekranlarını canlı izleyip karşılaştırma ve PDF/JSON raporunu tek
                ekrandan çıkartın.
              </CardDescription>
            </div>
          </div>
          <Link
            href="/studio"
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <IconPlay />
            Stüdyoyu Aç
          </Link>
        </CardHeader>
      </Card>

      {isError ? (
        <EmptyState
          title="API'ye ulaşılamıyor"
          description="Spring Boot servisinin (varsayılan http://localhost:8080) çalıştığından emin olun."
        />
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((key) => (
            <div key={key} className="h-28 animate-pulse rounded-xl bg-surface-2/50" />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Toplam Proje" value={data.totalProjects} />
            <StatCard label="Aktif Proje" value={data.activeProjects} />
            <StatCard label="Toplam Çalıştırma" value={data.totalExecutions} />
            <StatCard
              label="Tarayıcı Worker"
              value={data.worker.configured ? "Yapılandırıldı" : "Yapılandırılmadı"}
              hint={
                data.worker.configured
                  ? data.worker.reachable
                    ? "Worker ayakta."
                    : "Worker'a şu anda ulaşılamıyor."
                  : "ARS_WORKER_BASE_URL ile tanımlayın."
              }
            />
          </div>

          {data.totalProjects === 0 ? <OnboardingCard /> : null}

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Worker Yetenekleri</CardTitle>
                <CardDescription>
                  Platform, devreye alınmamış yetenekleri asla &quot;çalıştı&quot; olarak
                  göstermez; tarayıcı otomasyonu gerçek Chromium ile çalışır.
                </CardDescription>
              </div>
              <Badge tone={data.worker.reachable ? "success" : "warning"}>
                {data.worker.reachable ? "Erişilebilir" : "Erişilemiyor"}
              </Badge>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {Object.entries(data.worker.capabilities).map(([capability, enabled]) => (
                <Badge key={capability} tone={enabled ? "success" : "muted"}>
                  {CAPABILITY_LABELS[capability] ?? capability}: {enabled ? "hazır" : "hayır"}
                </Badge>
              ))}
              {Object.keys(data.worker.capabilities).length === 0 ? (
                <Badge tone="muted">Worker yanıtı alınamadı</Badge>
              ) : null}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Son Çalıştırmalar</h2>
              <Link className="text-sm text-primary hover:underline" href="/executions">
                Tümünü gör
              </Link>
            </div>

            {data.recentExecutions.length === 0 ? (
              <EmptyState
                title="Henüz çalıştırma yok"
                description={
                  <>
                    Bir proje oluşturup ekran ekledikten sonra{" "}
                    <Link className="text-primary hover:underline" href="/projects">
                      proje detayından
                    </Link>{" "}
                    test başlatabilirsiniz. Sorularınız için{" "}
                    <Link className="text-primary hover:underline" href="/chat">
                      Proje Sohbeti
                    </Link>{" "}
                    her zaman açık.
                  </>
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Durum</TableHead>
                    <TableHead>Proje / Ekran</TableHead>
                    <TableHead>Mod</TableHead>
                    <TableHead>Oluşturma</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentExecutions.map((execution) => (
                    <TableRow key={execution.id}>
                      <TableCell>
                        <StatusBadge status={execution.status} />
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{execution.projectName}</span>
                        <span className="text-muted-foreground"> · {execution.screenCode}</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {MODE_LABELS[execution.mode] ?? execution.mode}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(execution.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Link
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                          href={`/executions/${execution.id}`}
                        >
                          Detay
                          <IconChevronRight width={14} height={14} />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
