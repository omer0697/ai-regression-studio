"use client";

import { useState } from "react";

import { EmptyState, PageHeader } from "@/components/page-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  useApproveScenario,
  useRejectScenario,
  useScenarios,
} from "@/lib/api-hooks";
import { formatDate } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  PROPOSED: "Onay Bekliyor",
  APPROVED: "Onaylandı",
  REJECTED: "Reddedildi",
  EXECUTED: "Çalıştırıldı",
};

export default function ScenariosPage() {
  const { data: scenarios, isLoading } = useScenarios();
  const approve = useApproveScenario();
  const reject = useRejectScenario();
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Senaryo Kütüphanesi"
        description="AI önerileri ve insan onayı: yalnızca ONAYLANMIŞ senaryolar çalıştırılabilir. Politika dışı aksiyonlar öneri aşamasında reddedilir."
      />

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-surface-2/50" />
      ) : !scenarios || scenarios.length === 0 ? (
        <EmptyState
          title="Kütüphane boş"
          description="AI Keşif & Test sayfasından doğal dil komutuyla plan üretin."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {scenarios.map((scenario) => (
            <Card key={scenario.id}>
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                <div className="min-w-0">
                  <CardTitle className="truncate text-base">{scenario.name}</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(scenario.createdAt)} · kaynak: {scenario.source}
                    {scenario.approvedBy ? ` · onaylayan: ${scenario.approvedBy}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    tone={
                      scenario.status === "APPROVED"
                        ? "success"
                        : scenario.status === "REJECTED"
                          ? "danger"
                          : scenario.status === "EXECUTED"
                            ? "info"
                            : "warning"
                    }
                  >
                    {STATUS_LABELS[scenario.status] ?? scenario.status}
                  </Badge>
                  {scenario.status === "PROPOSED" ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() => void approve.mutateAsync(scenario.id)}
                        disabled={approve.isPending}
                      >
                        Onayla
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const reason = prompt("Red gerekçesi (isteğe bağlı):") ?? undefined;
                          void reject.mutateAsync({ id: scenario.id, reason });
                        }}
                        disabled={reject.isPending}
                      >
                        Reddet
                      </Button>
                    </>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setExpanded(expanded === scenario.id ? null : scenario.id)}
                  >
                    {expanded === scenario.id ? "Planı Gizle" : "Planı Gör"}
                  </Button>
                </div>
              </CardHeader>
              {expanded === scenario.id ? (
                <CardContent>
                  <pre className="max-h-72 overflow-auto rounded-lg bg-surface-2/60 p-3 font-mono text-xs">
                    {JSON.stringify(scenario.plan, null, 2)}
                  </pre>
                </CardContent>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
