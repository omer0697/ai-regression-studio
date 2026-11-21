"use client";

import Link from "next/link";

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

export default function DashboardPage() {
  const { data, isLoading, isError } = useDashboard();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Panel"
        description="Migration projelerinin regresyon test durumunu tek ekrandan takip edin."
      />

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

          <Card>
            <CardHeader>
              <CardTitle>Worker Yetenekleri</CardTitle>
              <CardDescription>
                Platform, henüz devreye alınmamış yetenekleri asla &quot;çalıştı&quot; olarak
                göstermez. Tarayıcı otomasyonu 2. Fazda geliyor.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {Object.entries(data.worker.capabilities).map(([capability, enabled]) => (
                <Badge key={capability} tone={enabled ? "success" : "muted"}>
                  {capability}: {enabled ? "hazır" : "hayır"}
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
                    test başlatabilirsiniz.
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
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
