"use client";

import { useState } from "react";

import { IconSparkles } from "@/components/icons";
import { EmptyState, PageHeader } from "@/components/page-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Select, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProjects, useProposeAiPlan, useScenarios, useScreens } from "@/lib/api-hooks";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";

export default function AiDiscoveryPage() {
  const { data: projects } = useProjects();
  const [projectId, setProjectId] = useState<string>("");
  const { data: screens } = useScreens(Number(projectId) || -1);
  const [screenId, setScreenId] = useState<string>("");
  const [command, setCommand] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const propose = useProposeAiPlan();
  const { data: scenarios } = useScenarios(Number(projectId) || undefined);

  const onPropose = async () => {
    setError(null);
    try {
      await propose.mutateAsync({
        projectId: Number(projectId),
        screenId: Number(screenId),
        command,
      });
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      if (apiError?.code === "AI_NOT_CONFIGURED") {
        setError(
          "AI sağlayıcısı yapılandırılmadı. AI Ayarları sayfasından Local LLM URL ve model adını tanımlayın.",
        );
      } else if (apiError?.code === "NO_DISCOVERY_DATA") {
        setError(
          "Bu ekran için önce bir keşif çalıştırması yapın — AI planı, keşfedilen eleman metadata'sını bağlam olarak kullanır.",
        );
      } else if (apiError?.code === "AI_INVALID_PLAN") {
        setError("AI yanıtı politika doğrulamasından geçemedi: " + apiError.message);
      } else {
        setError("Plan üretilemedi: " + (apiError?.message ?? "bilinmeyen hata"));
      }
    }
  };

  const latestProposal = propose.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="AI Keşif & Test"
        description="Doğal dilden (Türkçe) test komutu yazın; AI, keşfedilen eleman metadata'sını kullanarak doğrulanabilir bir senaryo planı önerir. Öneriler insan onayına düşer."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconSparkles className="text-primary" />
            Doğal Dil Test Komutu
          </CardTitle>
          <CardDescription>
            Örnek: &quot;KPY68&apos;de DIGER seçildiğinde Parametre Değeri alanının
            etkinleştiğini doğrula.&quot;
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ai-project">Proje</Label>
              <Select
                id="ai-project"
                value={projectId}
                onChange={(event) => {
                  setProjectId(event.target.value);
                  setScreenId("");
                }}
              >
                <option value="">Proje seçin…</option>
                {(projects ?? []).map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ai-screen">Ekran</Label>
              <Select
                id="ai-screen"
                value={screenId}
                onChange={(event) => setScreenId(event.target.value)}
                disabled={!projectId}
              >
                <option value="">Ekran seçin…</option>
                {(screens ?? []).map((screen) => (
                  <option key={screen.id} value={screen.id}>
                    {screen.screenCode} — {screen.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="ai-command">Komut</Label>
            <Textarea
              id="ai-command"
              rows={3}
              placeholder="Test KPY68: DIGER seçildiğinde değer alanının etkinleşmesini ve otomatik doldurulmasını doğrula."
              value={command}
              onChange={(event) => setCommand(event.target.value)}
            />
          </div>

          {error ? (
            <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <Button
            className="w-fit"
            onClick={() => void onPropose()}
            disabled={propose.isPending || !projectId || !screenId || !command.trim()}
          >
            <IconSparkles />
            {propose.isPending ? "Plan üretiliyor…" : "Plan Üret (AI)"}
          </Button>

          {latestProposal ? (
            <Card className="border-primary/40">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle>{String(latestProposal.plan.scenarioName ?? latestProposal.name)}</CardTitle>
                  <Badge tone="warning">ÖNERİLDİ — onay bekliyor</Badge>
                </div>
                <CardDescription>
                  Politika doğrulamasından geçti (kapalı aksiyon sözlüğü). Senaryo
                  Kütüphanesi&apos;nden onaylayın.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="max-h-56 overflow-auto rounded-lg bg-surface-2/60 p-3 font-mono text-xs">
                  {JSON.stringify(latestProposal.plan, null, 2)}
                </pre>
              </CardContent>
            </Card>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Senaryolar (seçili proje)</h2>
        {!scenarios || scenarios.length === 0 ? (
          <EmptyState
            title="Henüz senaryo yok"
            description="Bir keşif çalıştırması yaptıktan sonra doğal dil komutuyla plan üretin."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {scenarios.map((scenario) => (
              <Card key={scenario.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{scenario.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(scenario.createdAt)} · kaynak: {scenario.source}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      tone={
                        scenario.status === "APPROVED"
                          ? "success"
                          : scenario.status === "REJECTED"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {scenario.status}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      {(scenario.plan as { steps?: unknown[] }).steps?.length ?? 0} adım
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
