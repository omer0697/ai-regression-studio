import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface SectionInfo {
  title: string;
  phase: string;
  summary: string;
  bullets: string[];
}

const SECTIONS: Record<string, SectionInfo> = {
  comparison: {
    title: "GWT ↔ React Karşılaştırma",
    phase: "Faz 5",
    summary:
      "Eşdeğer senaryoların iki uygulamada da çalıştırılıp davranışsal olarak karşılaştırılması.",
    bullets: [
      "Alan varlığı, durum, değer ve doğrulama farkları",
      "AI destekli semantik eleman eşleme (düşük güvenli eşlemeler insan onayına düşer)",
      "Kanıt destekli bulgu (bug finding) üretimi",
    ],
  },
  pdf: {
    title: "PDF Karşılaştırma",
    phase: "Faz 6",
    summary:
      "GWT ve React tarafından üretilen PDF'lerin yapısal ve görsel karşılaştırması.",
    bullets: [
      "Apache PDFBox ile metin/alan çıkarımı ve sayfa karşılaştırması",
      "Eksik alan, boş değer ve kesilmiş içerik tespiti",
      "İşaretli fark görünümü ve PDF kanıt arşivi",
    ],
  },
  bugs: {
    title: "Hata Raporları",
    phase: "Faz 5–7",
    summary:
      "Doğrulanmış farkların kanıt destekli, Türkçe hata raporları halinde sunulması.",
    bullets: [
      "Yeniden üretim adımları ve GWT/React ekran görüntüleri",
      "AI kök-neden hipotezleri (gözlemle net biçimde ayrıştırılır)",
      "PDF/JSON dışa aktarımı",
    ],
  },
  "ai-config": {
    title: "AI Ayarları",
    phase: "Faz 4",
    summary:
      "Şirket içi DeepSeek uç noktası için temel URL, model, zaman aşımı ve yetenek yapılandırması.",
    bullets: [
      "OpenAI uyumlu yapılandırılabilir adaptör (AI_BASE_URL, AI_MODEL, AI_API_KEY)",
      "Vision desteği olmayan modeller için DOM/anlık görüntü modu",
      "API anahtarları asla arayüzde gösterilmez",
    ],
  },
  settings: {
    title: "Sistem Ayarları",
    phase: "Faz 8",
    summary: "Platform genel ayarları: kullanıcı yönetimi, denetim kayıtları ve politikalar.",
    bullets: [
      "Kullanıcı/rol yönetimi (RBAC)",
      "Denetim (audit) kaydı görüntüleyici",
      "Etki alanı kural setleri ve veri temizleme politikaları",
    ],
  },
};

export default async function ComingSoonPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const section = SECTIONS[slug];
  if (!section) {
    notFound();
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{section.title}</h1>
        <Badge tone="warning">{section.phase}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bu bölüm henüz devrede değil</CardTitle>
          <CardDescription>{section.summary}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Planlanan kapsamda neler olacak?
          </p>
          <ul className="list-inside list-disc space-y-1.5 text-sm text-muted-foreground">
            {section.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Ayrıntılar için{" "}
            <Link className="text-primary hover:underline" href="/">
              yol haritası
            </Link>{" "}
            ve <code className="font-mono">docs/progress.md</code> dosyasına bakın. Hazırlanmayan
            özellikler için sahte veri gösterilmez.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
