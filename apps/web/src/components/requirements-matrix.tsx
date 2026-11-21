"use client";

import { useState } from "react";

import { EmptyState } from "@/components/page-parts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRequirementInfo } from "@/lib/requirements";
import { formatDate } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Bekliyor",
  VERIFIED: "Karşılandı ✓",
  UNSATISFIED: "Karşılanmadı ✕",
  PARTIAL: "Kısmen",
  MANUAL_REVIEW: "İnceleme Gerekli",
};

const STATUS_EXPLANATIONS: Record<string, string> = {
  PENDING: "Henüz kapsam analizi çalıştırılmadı.",
  VERIFIED: "Eski ekranda karşılığı bulundu, yeni ekranda da alan mevcut.",
  UNSATISFIED: "Yeni ekranda bu gereksinim karşılanmıyor.",
  PARTIAL: "Gereksinimin bir kısmı karşılanıyor.",
  MANUAL_REVIEW: "Otomatik eşleştirme bulamadı; insan onayı gerekli.",
};

/**
 * Requirement traceability matrix: old app behavior vs. new app, with
 * "is the requirement satisfied?" verdict per row.
 *
 * The screen selector can be controlled from the parent (so the whole tab
 * follows a single selection); omit the props for standalone use.
 */
export function RequirementsMatrix({
  projectId,
  screens,
  screenCode,
  onScreenChange,
}: {
  projectId: number;
  screens: Array<{ id: number; screenCode: string; name: string }>;
  screenCode?: string;
  onScreenChange?: (screenCode: string) => void;
}) {
  const [internalScreen, setInternalScreen] = useState(screens[0]?.screenCode ?? "");
  const selectedScreen = screenCode ?? internalScreen;
  const selectScreen = onScreenChange ?? setInternalScreen;
  const { data: requirements, isLoading } = useRequirementInfo(projectId, selectedScreen);


  const verified = (requirements ?? []).filter((req) => req.status === "VERIFIED").length;
  const unsatisfied = (requirements ?? []).filter((req) => req.status === "UNSATISFIED").length;
  const review = (requirements ?? []).filter((req) => req.status === "MANUAL_REVIEW").length;

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Gereksinim Uygunluk Matrisi</CardTitle>
          <CardDescription>
            Confluence&apos;dan aktarılan veya elle eklenen gereksinimlerin yeni ekranda
            karşılanma durumu
          </CardDescription>
        </div>
        {(screenCode === undefined || onScreenChange === undefined) ? (
          <select
            className="h-9 rounded-lg border border-border-subtle bg-surface-2 px-3 text-sm"
            value={selectedScreen}
            onChange={(event) => selectScreen(event.target.value)}
          >
            {screens.map((screen) => (
              <option key={screen.id} value={screen.screenCode}>
                {screen.screenCode} — {screen.name}
              </option>
            ))}
          </select>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border-subtle bg-surface p-3 text-center">
            <p className="text-xs text-muted-foreground">Toplam Gereksinim</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {(requirements ?? []).length}
            </p>
          </div>
          <div className="rounded-lg border border-success/40 bg-success/10 p-3 text-center">
            <p className="text-xs text-success">Karşılandı</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-success">{verified}</p>
          </div>
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-center">
            <p className="text-xs text-danger">Karşılanmadı</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-danger">{unsatisfied}</p>
          </div>
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-center">
            <p className="text-xs text-warning">İnceleme</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-warning">{review}</p>
          </div>
        </div>

        {isLoading ? (
          <div className="h-24 animate-pulse rounded-xl bg-surface-2/50" />
        ) : !requirements || requirements.length === 0 ? (
          <EmptyState
            title="Bu ekran için gereksinim kaydı yok"
            description="Confluence sayfa ID ile aktarın veya elle ekleyin."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gereksinim</TableHead>
                <TableHead>Kaynak</TableHead>
                <TableHead>Eski (GWT)</TableHead>
                <TableHead>Yeni (React)</TableHead>
                <TableHead>Karşılanıyor mu?</TableHead>
                <TableHead>Açıklama</TableHead>
                <TableHead>Tarih</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requirements.map((req) => (
                <TableRow key={req.id}>
                  <TableCell className="max-w-72 text-sm">{req.title}</TableCell>
                  <TableCell>
                    <Badge tone={req.confluenceId ? "info" : "muted"}>
                      {req.confluenceId ? "Confluence" : "Elle"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-success">
                    {req.status === "VERIFIED" ? "Mevcut" : req.status === "MANUAL_REVIEW" ? "?" : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {req.status === "VERIFIED" ? (
                      <span className="text-success">Mevcut ✓</span>
                    ) : req.status === "UNSATISFIED" ? (
                      <span className="text-danger">Eksik ✕</span>
                    ) : (
                      <span className="text-muted-foreground">?</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      tone={
                        req.status === "VERIFIED"
                          ? "success"
                          : req.status === "UNSATISFIED"
                            ? "danger"
                            : req.status === "MANUAL_REVIEW"
                              ? "warning"
                              : "muted"
                      }
                    >
                      {STATUS_LABELS[req.status] ?? req.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-48 text-xs text-muted-foreground">
                    {STATUS_EXPLANATIONS[req.status] ?? ""}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(req.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
