"use client";

import Link from "next/link";

import { EmptyState, PageHeader } from "@/components/page-parts";
import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useExecutions } from "@/lib/api-hooks";
import { MODE_LABELS, formatDate } from "@/lib/utils";

export default function ExecutionsPage() {
  const { data, isLoading } = useExecutions();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Çalıştırmalar"
        description="Tüm projelerdeki test çalıştırmaları ve canlı durumları."
      />

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-surface-2/50" />
      ) : !data || data.length === 0 ? (
        <EmptyState
          title="Kayıt yok"
          description="Bir proje detay sayfasından çalıştırma başlatın."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead>Proje / Ekran</TableHead>
              <TableHead>Mod</TableHead>
              <TableHead>Hata Kodu</TableHead>
              <TableHead>Başlatan</TableHead>
              <TableHead>Tarih</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((execution) => (
              <TableRow key={execution.id}>
                <TableCell className="tabular-nums text-muted-foreground">
                  {execution.id}
                </TableCell>
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
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {execution.errorCode ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {execution.createdBy ?? "—"}
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
  );
}
