"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import type { RequirementInfo } from "@/lib/api-client";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Bekliyor",
  VERIFIED: "Doğrulandı",
  UNSATISFIED: "Karşılanmadı",
  PARTIAL: "Kısmi",
  MANUAL_REVIEW: "İnsan İncelemesi",
};

/**
 * Confluence requirement panel: import by page id, add manually, and run the
 * deterministic coverage analysis against discovered elements.
 */
export function RequirementsPanel({
  projectId,
  screenCode,
}: {
  projectId: number;
  screenCode: string;
}) {
  const [requirements, setRequirements] = useState<RequirementInfo[] | null>(null);
  const [pageId, setPageId] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setRequirements(
        await api.listRequirements(projectId, screenCode),
      );
    } catch {
      setRequirements([]);
    }
  };

  useState(() => {
    void refresh();
  });

  const importFromConfluence = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.importRequirements(projectId, screenCode, pageId);
      setMessage(
        result.imported > 0
          ? `${result.imported} gereksinim aktarıldı ve kapsam analizi çalıştı.`
          : "Yeni gereksinim bulunamadı (hepsi zaten kayıtlı olabilir).",
      );
      await refresh();
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      setMessage(
        apiError?.code === "CONFLUENCE_NOT_CONFIGURED"
          ? "Confluence yapılandırılmadı (ARS_CONFLUENCE_BASE_URL + ARS_CONFLUENCE_TOKEN). Gereksinimleri elle de ekleyebilirsiniz."
          : (apiError?.message ?? "Aktarım başarısız oldu."),
      );
    } finally {
      setBusy(false);
    }
  };

  const addManual = async () => {
    if (!manualTitle.trim()) {
      return;
    }
    setBusy(true);
    try {
      await api.addManualRequirement(projectId, screenCode, manualTitle);
      setManualTitle("");
      setMessage("Gereksinim eklendi.");
      await refresh();
    } catch {
      setMessage("Gereksinim eklenemedi.");
    } finally {
      setBusy(false);
    }
  };

  const analyze = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.analyzeRequirements(projectId, screenCode);
      setMessage(`${result.analyzed} gereksinim analiz edildi.`);
      await refresh();
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      setMessage(apiError?.message ?? "Analiz başarısız oldu.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle>Gereksinimler ({screenCode})</CardTitle>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void analyze()}>
          Kapsamı Yeniden Analiz Et
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Input
            className="max-w-48"
            placeholder="Confluence sayfa ID"
            value={pageId}
            onChange={(event) => setPageId(event.target.value)}
          />
          <Button size="sm" disabled={busy || !pageId.trim()} onClick={() => void importFromConfluence()}>
            Confluence&apos;tan Aktar
          </Button>
          <Input
            className="max-w-64"
            placeholder="Elle gereksinim başlığı"
            value={manualTitle}
            onChange={(event) => setManualTitle(event.target.value)}
          />
          <Button size="sm" variant="secondary" disabled={busy || !manualTitle.trim()} onClick={() => void addManual()}>
            Elle Ekle
          </Button>
        </div>

        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

        {requirements === null ? (
          <p className="text-sm text-muted-foreground">Yükleniyor…</p>
        ) : requirements.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Henüz gereksinim yok. Confluence sayfa ID girip aktarın veya elle ekleyin.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {requirements.map((requirement) => (
              <div
                key={requirement.id}
                className="rounded-lg border border-border-subtle bg-surface-2/40 px-3 py-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm">{requirement.title}</p>
                  <Badge
                    tone={
                      requirement.status === "VERIFIED"
                        ? "success"
                        : requirement.status === "MANUAL_REVIEW"
                          ? "warning"
                          : "muted"
                    }
                  >
                    {STATUS_LABELS[requirement.status] ?? requirement.status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {requirement.confluenceId ? "Confluence: " : "Elle eklenen — "}
                  {formatDate(requirement.createdAt)}
                  {requirement.coverage
                    ? " · eşleşen alanlar: " +
                      String(
                        (requirement.coverage as { matchedElements?: unknown[] })
                          .matchedElements?.length ?? 0,
                      )
                    : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
