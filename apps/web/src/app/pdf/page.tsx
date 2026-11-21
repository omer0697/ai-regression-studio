"use client";

import { useRef, useState } from "react";

import { IconFileText } from "@/components/icons";
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
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProjects } from "@/lib/api-hooks";
import { ApiError, artifactContentUrl, comparePdfs, type PdfComparisonResult } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";

const KIND_LABELS: Record<string, string> = {
  MISSING_FIELD: "Eksik Alan",
  VALUE_MISMATCH: "Değer Farkı",
  PAGE_COUNT: "Sayfa Sayısı Farkı",
  MISSING_IN_REFERENCE: "Referansta Eksik",
  WRONG_IN_REFERENCE: "Referansta Yanlış",
};

export default function PdfComparisonPage() {
  const { data: projects } = useProjects();
  const [projectId, setProjectId] = useState("");
  const [pdfA, setPdfA] = useState<File | null>(null);
  const [pdfB, setPdfB] = useState<File | null>(null);
  const [screenCode, setScreenCode] = useState("KPY68");
  const [expectedFields, setExpectedFields] = useState(
    '{\n  "Parametre Kodu": "KPY-001",\n  "Parametre Tipi": "OZEL",\n  "Parametre Degeri": "ABC-123"\n}',
  );
  const [result, setResult] = useState<PdfComparisonResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const onCompare = async () => {
    setError(null);
    setResult(null);
    setPending(true);
    try {
      const response = await comparePdfs(
        Number(projectId),
        pdfA as File,
        pdfB as File,
        screenCode,
        expectedFields,
      );
      setResult(response);
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      setError(
        apiError?.message ?? "PDF karşılaştırması başarısız oldu. API servislerini kontrol edin.",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="PDF Karşılaştırma"
        description="İki PDF belgesini yapısal olarak karşılaştırır (Apache PDFBox): beklenen alanlar, sayfa sayıları ve değerler. Dinamik tarih/kayıt numaraları normalleştirilir."
      />

      <Card>
        <CardHeader>
          <CardTitle>Belgeleri Yükleyin</CardTitle>
          <CardDescription>
            GWT ve React tarafından üretilen PDF&apos;leri karşılaştırın. Her iki belge
            kanıt olarak MinIO&apos;ya kaydedilir.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form ref={formRef} className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pdf-project">Proje</Label>
              <select
                id="pdf-project"
                className="h-9 rounded-lg border border-border-subtle bg-surface-2 px-3 text-sm"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
              >
                <option value="">Proje seçin…</option>
                {(projects ?? []).map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pdf-screen">Ekran Kodu</Label>
              <Input
                id="pdf-screen"
                value={screenCode}
                onChange={(event) => setScreenCode(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pdf-a">Belge A (GWT / referans)</Label>
              <input
                id="pdf-a"
                type="file"
                accept="application/pdf"
                className="text-sm"
                onChange={(event) => setPdfA(event.target.files?.[0] ?? null)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pdf-b">Belge B (React / test edilen)</Label>
              <input
                id="pdf-b"
                type="file"
                accept="application/pdf"
                className="text-sm"
                onChange={(event) => setPdfB(event.target.files?.[0] ?? null)}
              />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="pdf-fields">Beklenen Alanlar (JSON: etiket → değer)</Label>
              <Textarea
                id="pdf-fields"
                rows={4}
                className="font-mono text-xs"
                value={expectedFields}
                onChange={(event) => setExpectedFields(event.target.value)}
              />
            </div>
          </form>

          {error ? (
            <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <Button
            className="w-fit"
            onClick={() => void onCompare()}
            disabled={pending || !projectId || !pdfA || !pdfB}
          >
            <IconFileText />
            {pending ? "Karşılaştırılıyor…" : "PDF'leri Karşılaştır"}
          </Button>
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Sonuç</CardTitle>
              <CardDescription>
            {formatDate(result.createdAt)} · {result.pagesA}/{result.pagesB} sayfa
              </CardDescription>
            </div>
            <Badge tone={result.verdict === "MATCH" ? "success" : "danger"}>
              {result.verdict === "MATCH" ? "EŞLEŞİYOR" : "FARKLILIK TESPİT EDİLDİ"}
            </Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {result.differences.length === 0 ? (
              <p className="text-sm text-success">
                Beklenen alanların tümü her iki belgede de doğru.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {result.differences.map((difference, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-border-subtle bg-surface-2/40 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{difference.field}</span>
                      <Badge tone="danger">
                        {KIND_LABELS[difference.kind] ?? difference.kind}
                        {difference.page ? ` · s.${difference.page}` : ""}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Beklenen: <span className="text-success">{difference.expected}</span>
                      {" → "}Gerçekleşen:{" "}
                      <span className="text-danger">{difference.actual}</span>
                    </p>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-4 text-sm">
              <a
                className="text-primary hover:underline"
                href={artifactContentUrl(result.artifactAId)}
                target="_blank"
                rel="noreferrer"
              >
                Belge A kanıtı (PDF)
              </a>
              <a
                className="text-primary hover:underline"
                href={artifactContentUrl(result.artifactBId)}
                target="_blank"
                rel="noreferrer"
              >
                Belge B kanıtı (PDF)
              </a>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!result && !pending ? (
        <EmptyState
          icon={<IconFileText width={28} height={28} />}
          title="Henüz karşılaştırma yok"
          description="İki PDF belge seçip beklenen alanları tanımlayın."
        />
      ) : null}
    </div>
  );
}
