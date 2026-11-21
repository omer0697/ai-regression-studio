"use client";

import { EmptyState, PageHeader } from "@/components/page-parts";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useDashboard } from "@/lib/api-hooks";
import { formatDate } from "@/lib/utils";

export default function SettingsPage() {
  const { data: dashboard } = useDashboard();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Ayarlar"
        description="Platform durumu ve sistem bilgileri. Kullanıcı yönetimi ve denetim kaydı görüntüleyici 8. Fazda geliyor."
      />

      {dashboard ? (
        <Card>
          <CardHeader>
            <CardTitle>Tarayıcı Worker</CardTitle>
            <CardDescription>
              Worker yetenekleri ve erişim durumu — platform hiçbir yeteneği hazır
              olmadığı halde &quot;hazır&quot; göstermez.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Badge tone={dashboard.worker.configured ? "success" : "warning"}>
              {dashboard.worker.configured ? "yapılandırıldı" : "yapılandırılmadı"}
            </Badge>
            <Badge tone={dashboard.worker.reachable ? "success" : "danger"}>
              {dashboard.worker.reachable ? "erişilebilir" : "erişilemiyor"}
            </Badge>
            {Object.entries(dashboard.worker.capabilities).map(([capability, enabled]) => (
              <Badge key={capability} tone={enabled ? "success" : "muted"}>
                {capability}: {enabled ? "hazır" : "hayır"}
              </Badge>
            ))}
          </CardContent>
        </Card>
      ) : (
        <EmptyState title="Veri yükleniyor…" />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Son Çalıştırmalar</CardTitle>
          <CardDescription>En güncel çalıştırma durumları.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          {(dashboard?.recentExecutions ?? []).map((execution) => (
            <div key={execution.id} className="flex justify-between gap-2">
              <span>#{execution.id} · {execution.screenCode}</span>
              <span>{formatDate(execution.createdAt)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
