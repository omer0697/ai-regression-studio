# Mimari

## Genel Bakış

AI Regression Studio, eski GWT uygulaması ile yeni React uygulaması arasında **davranışsal eşdeğerlik** doğrulayan bir regresyon test platformudur. Platformun temel ilkesi şudur:

> Gözlenen gerçek davranış ile doğrulanabilen kanıt arasındaki fark raporlanır;
> doğrulanamayan her şey "doğrulanamadı" olarak işaretlenir, asla "geçti" olarak gösterilmez.

## Bileşenler ve Sorumluluklar

| Bileşen | Teknoloji | Sorumluluk |
| --- | --- | --- |
| **web** | Next.js 16 (App Router, Turbopack), React 19, TS strict, Tailwind v4, TanStack Query, RHF+Zod | Panel, proje/ortam/ekran yönetimi, canlı çalıştırma takibi (SSE), hata görüntüleme |
| **api** | Spring Boot 3.5.16, Java 21, Spring Security, JPA, Flyway, PostgreSQL | Kimlik/RBAC, orkestrasyon, kalıcılık, olay kaydı, worker gateway'i, SSE yayını, denetim izi |
| **browser-worker** | Node 22, Fastify 5, Zod (Playwright: Faz 2) | Tarayıcı oturumları, keşif, senaryo yürütme, kanıt üretimi |
| **DeepSeek** (Faz 4) | OpenAI-uyumlu yapılandırılabilir adaptör | Senaryo planlama, semantik eşleme, kök-neden hipotezleri |
| **Karşılaştırma motoru** (Faz 5) | Deterministik | Pass/fail kararları — AI'nın ürettiği hiçbir sonuç tek başına "geçti" sayılmaz |
| **PostgreSQL** | 17 | Konfigürasyon, senaryo, çalıştırma, olay, denetim verileri |
| **MinIO** | S3-uyumlu | Screenshot, trace, PDF kanıtları (Faz 2'den itibaren) |

## İstek Akışı (Faz 1)

```text
Browser ── /backend/* (Next rewrite, same-origin) ──▶ Spring Boot API
                                                        │
                                              CSRF cookie pattern (XSRF-TOKEN)
                                                        │
                                          WorkerClient (RestClient) ──▶ browser-worker /api/jobs
                                                        │                     │
                                                        │              Zod şema doğrulama
                                                        │              kapalı aksiyon sözlüğü
                                                        │                        │
                             SSE (poll → push, Faz 2) ◀─┘                 501 (henüz yok) / 202
```

**Kritik kararlar:**

1. **Same-origin proxy:** Next.js `/backend/*` rewrite'ı API'ye taşır. Böylece oturum cookie'leri
   `SameSite=Lax` ile güvenli kalır, CORS yalnızca alternatif doğrudan-erişim modunda gerekir.
   `compress: false` sayesinde SSE proxy'de buffer'lanmadan akar (doğrulandı).
2. **SPA CSRF pattern:** `CookieCsrfTokenRepository.withHttpOnlyFalse()` + zorunlu token çözümlemesi;
   web istemcisi cookie'yi `X-XSRF-TOKEN` başlığıyla yansıtır. Girişsiz POST'lar 403 alır.
3. **Dürüst durum makinesi:** `ExecutionStatus` → `CREATED → QUEUED → RUNNING → (COMPLETED|FAILED)`;
   altyapı eksikse `NOT_SUPPORTED`, worker hatasında `ERROR`. `NOT_SUPPORTED` **terminal** bir
   durumdur ve UI'da Türkçe açıklamayla gösterilir.
4. **Worker sözleşmesi:** `/api/jobs` gövdesi `@ars/test-schemas` ile doğrulanır. Yapılamayan işler
   yapısal `501 CAPABILITY_NOT_IMPLEMENTED` yanıtı alır; API bunu
   `WORKER_CAPABILITY_NOT_IMPLEMENTED` olarak kaydeder. Sır taşıyan değerler şemada reddedilir.
5. **Şema sahipliği:** DDL Flyway'e aittir; Hibernate yalnız `validate` yapar. JSONB alanları
   (izinli alan adları, yasaklı eylemler, olay payload'ı) PostgreSQL'de yerel saklanır.

## Veri Modeli (Faz 1)

```text
app_user ──┐
           ├── project ──┬── application_environment (app_type: LEGACY_GWT|REACT)
           │             ├── screen_definition (screen_code: KPY68, ...)
           │             └── test_execution ──┬── execution_event (seq sıralı)
           │                                    └── (Faz 5+: step results, findings)
           └── audit_event (append-only denetim izi)
```

- `application_environment`: yalnızca **referans adı** (`credential_reference`) saklar; asla sırlar.
- `uq_exec_active_screen` kısmi unique index: bir ekranda aynı anda tek aktif çalıştırma
  (yinelenen çalıştırma koruması, Madde 17).
- `execution_event`: çalıştırma başına `seq` ile tam sıralı olay günlüğü; SSE ve JSON snapshot
  aynı kaynağı okur.

## Canlı İlerleme (SSE)

`GET /api/executions/{id}/events` iki modda çalışır:

- `Accept: text/event-stream` → `SseEmitter`; 500 ms'de bir yeni olayları ve durum değişikliklerini
  yayar, terminal durumda kısa bir süre tanıdıktan sonra akışı kapatır.
- `Accept: application/json` → kayıtlı olayların anlık görüntüsü (UI için yeniden bağlanma yedeği).

Faz 2'de worker `POST /internal/executions/{id}/events` ile geri itme yapacak; istemci sözleşmesi
değişmeyecek, sunucu içi poll kalkacak.

## Yol Ayrımları ve Fazlar

Faz planı ana prompt'taki sekiz fazdır. Her faz kendi `docs/progress.md` girdisini alır.
Faz 1'de hazır olmayan her yetenek UI'da "yakında" sayfası olarak **plan bilgisiyle** listelenir;
sahte veri gösterilmez. Worker `/api/health` uçları gerçek yetenek durumunu raporlar ve panelde
olduğu gibi gösterilir.

## Genişletilebilirlik

- Yeni hedef ekran = `screen_definition` kaydı; kod değişikliği gerekmez.
- Yeni hedef uygulama = yeni `project`; ortamlar proje bazlı tanımlanır.
- Yeni uygulama çerçevesi (ör. Angular'a migrasyon) = worker'a yeni bir adaptör (Faz 2'de
  `GwtAdapter`/`ReactAdapter` ayrımının genişletilmesi).
