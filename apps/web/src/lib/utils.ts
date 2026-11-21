import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import type { ExecutionStatus } from "@ars/shared-contracts";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatDuration(
  startedAt: string | null,
  finishedAt: string | null,
): string {
  if (!startedAt || !finishedAt) return "—";
  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "—";
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) return `${seconds} sn`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes} dk ${rest} sn`;
}

export type StatusVisual = {
  label: string;
  tone: "success" | "warning" | "danger" | "info" | "muted";
};

const STATUS_VISUALS: Record<ExecutionStatus, StatusVisual> = {
  CREATED: { label: "Oluşturuldu", tone: "info" },
  QUEUED: { label: "Kuyrukta", tone: "info" },
  RUNNING: { label: "Çalışıyor", tone: "warning" },
  COMPLETED: { label: "Tamamlandı", tone: "success" },
  FAILED: { label: "Başarısız", tone: "danger" },
  NOT_SUPPORTED: { label: "Desteklenmiyor", tone: "muted" },
  ERROR: { label: "Altyapı Hatası", tone: "danger" },
  CANCELLED: { label: "İptal Edildi", tone: "muted" },
};

export function statusVisual(status: ExecutionStatus): StatusVisual {
  return STATUS_VISUALS[status] ?? { label: status, tone: "muted" };
}

/** Turkish explanations for machine-readable worker error codes. */
const WORKER_ERROR_EXPLANATIONS: Record<string, string> = {
  WORKER_NOT_CONFIGURED:
    "Tarayıcı worker servisi yapılandırılmadı (ARS_WORKER_BASE_URL boş). Tarayıcı otomasyonu yapılandırılmadan test çalıştırılamaz.",
  WORKER_CAPABILITY_NOT_IMPLEMENTED:
    "İstek worker'a iletildi ancak tarayıcı otomasyonu henüz uygulanmadı (Faz 2 kapsamında). Bu çalıştırma hiçbir test sonucu üretmedi ve sistem bunu gizlemedi.",
  WORKER_UNAVAILABLE:
    "Tarayıcı worker servisine ulaşılamadı. Servisin çalıştığından ve ARS_WORKER_BASE_URL adresinin doğru olduğundan emin olun.",
  WORKER_UNEXPECTED_RESPONSE:
    "Tarayıcı worker beklenmeyen bir yanıt döndürdü. Worker sürümünün API ile uyumlu olup olmadığını kontrol edin.",
};

export function explainWorkerError(code: string | null | undefined): string | null {
  if (!code) return null;
  return WORKER_ERROR_EXPLANATIONS[code] ?? null;
}

export const MODE_LABELS: Record<string, string> = {
  DISCOVERY: "Keşif (GWT)",
  COMPARISON: "Karşılaştırma (GWT ↔ React)",
  COMBINATION: "Kombinasyon (tüm alanlar)",
};

export const MODE_DESCRIPTIONS: Record<string, string> = {
  DISCOVERY:
    "Eski (GWT) uygulamanın ekranını güvenli biçimde keşfeder: alanları listeler, etkileşim bağımlılıklarını gözlemler. Yeni uygulama gerekmez.",
  COMPARISON:
    "Onaylı senaryoyu eski (GWT) ve yeni (React) uygulamada sırayla yürütür ve yalnızca davranış farklarını kanıtla raporlar.",
  COMBINATION:
    "Keşfedilen tüm alanların değer kombinasyonlarını sınırlı bütçe içinde her iki uygulamada dener; bağımlılık hatalarını ortaya çıkarır. GWT + React ortamlarının ikisi de gerekir.",
};
