# İlerleme Günlüğü

Bu döküman her kilometre taşından sonra güncellenir. Buradaki her iddia, çalıştırılmış
komut çıktılarıyla desteklenir; doğrulanmamış hiçbir şey "tamamlandı" yazılmaz.

---

## Faz 1 — Foundation ✅ (21 Kasım 2026)

### Tamamlananlar

**Monorepo**
- npm workspaces: `apps/{web,api,browser-worker}` + `packages/{shared-contracts,test-schemas}`
- Kök script'leri: `build`, `test`, `typecheck`, `lint`, `dev:web`, `dev:worker`

**Web (apps/web)**
- Next.js 16.4.6 (App Router, Turbopack, React 19.3), TypeScript strict
- Tailwind CSS v4 (oklch tabanlı koyu tema), shadcn/ui tarzı elle yazılmış UI bileşenleri
  (button, card, input, label, badge, table, tabs, dialog, select) — Radix primitive'ler yalnız
  dialog/tabs/label için
- TanStack Query v5, React Hook Form + Zod (v4) formları
- Sayfalar: Panel (canlı worker durumu + son çalıştırmalar), Giriş, Projeler, Proje detayı
  (Genel/Ortamlar/Ekranlar/Çalıştırmalar sekmeleri), Çalıştırma listesi, Çalıştırma detayı
  (SSE canlı olay akışı + dürüst kanıt-yok notu + yeniden çalıştırma), yol haritası sayfaları
- `/backend/*` reverse proxy (same-origin cookie/CSRF) — SSE buffer'lanmadan akacak
  biçimde doğrulandı

**API (apps/api)**
- Spring Boot 3.5.16, Java 21, Spring Security (oturum + SPA CSRF cookie deseni + RBAC:
  ADMIN/TESTER/VIEWER), Spring Data JPA, Flyway (V1: 7 tablo + indeksler + kısmi unique),
  Bean Validation, Springdoc OpenAPI 2.8.17, Actuator
- CRUD: projeler, uygulama ortamları (GWT/React; tip başına tekil, form-giriş bütünlük kontrolü),
  ekran kaydı (KPY68 desenli kod)
- Çalıştırma API'si: benzersiz aktif çalıştırma koruması, ortam önkoşul kontrolleri, worker'a
  iş gönderimi, **dürüüst durum makinesi** (`NOT_SUPPORTED`/`WORKER_UNAVAILABLE`/`CAPABILITY...`),
  sıralı olay günlüğü, SSE yayını (500 ms poll; Faz 2'de worker itmesi ile değişecek) + JSON
  anlık görüntü alternatifi
- Denetim izi (append-only): giriş başarısı/başarısızlığı, proje/ekran/ortam değişiklikleri,
  çalıştırma kararları
- Tohumlama: ilk yönetici hesabı ortam değişkenlerinden (yalnız ilk açılış + uyarı log'u)

**Browser Worker (apps/browser-worker)**
- Fastify 5 (ESM, TS strict) iskeleti: `/api/health` (dürüüst yetenek raporu, `ready: false`),
  `/api/jobs` (Zod şema doğrulama → kapalı aksiyon sözlüğü → yapısal `501 CAPABILITY_NOT_IMPLEMENTED`)
- Playwright entegrasyonu Faz 2'ye kadar bilinçli olarak devre dışı; yetenekler tek gerçek
  kaynaktan (`capabilities.ts`) okunur

**Altyapı**
- `infrastructure/docker-compose.yml`: PostgreSQL 17 + MinIO (`bitnamilegacy/minio` aynası,
  `ars-artifacts` bucket otomatik oluşturuluyor) + healthcheck'ler
- `docker-compose.full.yml`: api + worker + web konteynerle (BuildKit cache mount'lu Dockerfile'lar)
- Not: MinIO resmi imajları Docker Hub'tan kaldırıldı; quay.io anonim çekmeye izin vermiyor.
  Geliştirme için Bitnami legacy aynası kullanıldı — şirket dağıtımında iç registry önerilir.

**Dokümantasyon**
- `README.md` (kurulum, ortam değişkenleri, komutlar), `docs/architecture.md`,
  `docs/security.md`, `docs/testing-strategy.md`, bu döküman

### Doğrulama (çalıştırıldı ve geçti)

| Komut | Sonuç |
| --- | --- |
| `npm install` | 0 zafiyet (vitest 3→5 yükseltmesi sonrası `npm audit` temiz) |
| `npm test` | **36 test geçti** (kontratlar 2, şemalar 14, worker 5, web 15) |
| `npm run build` | packages + worker tsc + `next build` başarılı (8 route) |
| `npm run typecheck` | strict mod, temiz |
| `npm run lint` | temiz (ESLint 9 + eslint-config-next 16 flat config) |
| `mvn -B package` (Docker) | **BUILD SUCCESS** — 13 birim testi geçti |
| `mvn -B verify` (Docker + docker.sock) | **BUILD SUCCESS** — `ArsApiApplicationIT` geçti (Testcontainers ile gerçek PostgreSQL; uçtan uca: CSRF → login → yapılandırma → `NOT_SUPPORTED`) |
| Full-stack duman testi | PostgreSQL + MinIO + worker + API ile gerçek HTTP: login 200, token'sız POST 403, yanlış kimlik 401, ortamlar 201, yinelenen ortam 409, çalıştırma → **`NOT_SUPPORTED / WORKER_CAPABILITY_NOT_IMPLEMENTED`** (worker'dan gerçek 501), dashboard worker yetenekleri, olay kaydı, **SSE akışı doğrudan ve Next proxy üzerinden** doğrulandı |

### Giderilen Sorunlar (düzeltme-döngüsü kanıtı)

1. `next` bağımlılığı web package.json'da eksikti → eklendi (16.4.6).
2. vitest 3.x'te kritik tinypool zafiyetleri → vitest 5.1.1'e yükseltildi, audit temiz.
3. CSRF sınıfları yanlış paketten import edilmişti (`web.authentication.csrf` → `web.csrf`).
4. `SecurityContextHolderStrategy` bean olarak tanımlı değildi → SecurityConfig'e eklendi.
5. `spring-security-test` bağımlılığı eksikti → pom'a eklendi.
6. React 19 `useSearchParams` statik prerender'ı → login formu Suspense içine alındı.
7. `z.coerce.number()` RHF resolver tip uyumsuzluğu → `valueAsNumber` + düz `z.number()`.
8. ESLint 16 flat-config geçişi + `set-state-in-effect` kuralı → session bootstrap yeniden yazıldı.
9. Mock'lu ID sorunu (`anyLong` vs null) → save stub'ı gerçek ID atar hale getirildi.
10. MinIO Hub imajı kaldırılmış → Bitnami legacy aynası + bucket otomatik kurulum.
11. PowerShell 5.1 curl JSON kaçışması → duman testinde dosyadan gövde (`-d @file`).
12. **localhost cookie çakışması:** Çerezler porta göre ayrılmadığı için aynı makinedeki
    diğer localhost uygulamaları varsayılan `XSRF-TOKEN` adlı CSRF çerezini ezebiliyordu
    (gerçek oturumda giriş 403 verdi). Çerezler isim alanına taşındı:
    `ARS-XSRF-TOKEN` + `ARS-SESSIONID`; web istemcisi yeni adı okur (eski ad yedek olarak),
    entegrasyon testi güncellendi. Ayrıca derleme sırasında çalışan konteynerin jar kilidi
    tespit edildi → yeniden derleme öncesi konteyner durdurulmalı (Windows dosya kilidi).

### Yol Ayrımı Kararları

- **Java 21 + Spring Boot 3.5.16:** Ana talimat "3.x uyumlu stabil sürüm" istediğinden 3.5.x'in
  son OSS sürümü seçildi. Not: 3.5 hattının OSS desteği Haziran 2026'da sona erdi; ileride
  4.x'e geçiş ayrı bir madde olarak planlanmalı (Spring Boot 4.1 Java 17–27 destekler).
- **Yerel JDK yok:** Tüm Java derleme/test Docker üzerinden yürütüldü; sistem JDK kurulumu
  yapılmadı (kullanıcı makinesine dokunulmadı).
- **8080/3000 portları dolu:** Duman testi 18080/3001 üzerinden yapıldı; kullanıcı makinesindeki
  diğer uygulamalara (port 8080 ve 3000 sahipleri) **dokunulmadı**.

### Sonraki Adım — Faz 2: Browser Automation

1. Playwright + Chromium kurulumu worker'a; `browserAutomation=true` yeteneği
2. Tarayıcı yaşam döngüsü (izole context, state-based wait, konfigüre timeout — arbitrary sleep yok)
3. Güvenli test girişi (credential reference çözümleme kanalı üzerinden)
4. GWT ve React DOM adaptörleri (ayrı eleman çözümleme stratejileri; ortak CSS seçici varsayımı yok)
5. Screenshot/trace/kanıt üretimi → MinIO; worker → API geri bildirim kanalı (olay + durum itmesi)
6. İlk gerçek keşif çalıştırması: KPY68 DOM'unu tarayıp normalize eleman kaydı (Faz 3'ün girdisi)

---

## Yapılacaklar Listesi (teknik borç, fazlara dağıtılmış)

- [ ] Surefire/failsafe raporlarının CI dostu özeti (Faz 2)
- [ ] Rate limiting + sır deposu entegrasyonu (Faz 8 öncesi zorunlu)
- [ ] MinIO imajının iç registry sürümüne geçişi (şirket dağıtımı öncesi)
- [ ] Spring Boot 4.x değerlendirmesi (3.5 EOL notu; Faz 8 sonrası ayrı çalışma)
- [ ] Vitest config'lerindeki `configLoader: native` uyum uyarısının giderilmesi (kozmetik)
