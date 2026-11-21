"use client";

import Link from "next/link";

import { IconFolder } from "@/components/icons";
import { CreateProjectDialog } from "@/components/project-forms";
import { EmptyState, PageHeader } from "@/components/page-parts";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useProjects } from "@/lib/api-hooks";
import { formatDate } from "@/lib/utils";

export default function ProjectsPage() {
  const { data, isLoading } = useProjects();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Projeler"
        description="Her proje bir migration kapsamıdır: eski GWT ve yeni React ortamları, hedef ekranlar ve test çalıştırmaları."
        actions={<CreateProjectDialog />}
      />

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-surface-2/50" />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={<IconFolder width={28} height={28} />}
          title="Henüz proje yok"
          description="İlk projenizi oluşturarak GWT ve React ortamlarını tanımlamaya başlayın."
          action={<CreateProjectDialog />}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Proje</TableHead>
              <TableHead>Test Ortamı</TableHead>
              <TableHead>Uygulama Ortamları</TableHead>
              <TableHead>Ekranlar</TableHead>
              <TableHead>Çalıştırma</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead>Oluşturma</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((project) => (
              <TableRow key={project.id}>
                <TableCell>
                  <Link
                    className="font-medium text-primary hover:underline"
                    href={`/projects/${project.id}`}
                  >
                    {project.name}
                  </Link>
                  {project.description ? (
                    <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">
                      {project.description}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="text-muted-foreground">{project.environmentName}</TableCell>
                <TableCell className="tabular-nums">{project.environmentCount}</TableCell>
                <TableCell className="tabular-nums">{project.screenCount}</TableCell>
                <TableCell className="tabular-nums">{project.executionCount}</TableCell>
                <TableCell>
                  {project.active ? (
                    <Badge tone="success">Aktif</Badge>
                  ) : (
                    <Badge tone="muted">Pasif</Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(project.createdAt)}</TableCell>
                <TableCell>
                  <Link
                    className="text-sm text-primary hover:underline"
                    href={`/projects/${project.id}`}
                  >
                    Aç
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
