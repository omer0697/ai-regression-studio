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
    diğer localhost uygulamaları varsayılan `XSRF-TOKEN` adlı CSRF çerezini ezebiliyordu.
    Çerezler isim alanına taşındı: `ARS-XSRF-TOKEN` + `ARS-SESSIONID`; web istemcisi yeni
    adı okur (eski ad yedek olarak), entegrasyon testi güncellendi. Ayrıca derleme sırasında
    çalışan konteynerin jar kilidi tespit edildi → yeniden derleme öncesi konteyner durdurulmalı.
13. **Gerçek tarayıcıda girişin 403 reddi (kök neden):** Tarayıcılar her POST fetch'e
    `Origin` başlığı ekler (same-origin olsa bile). Next proxy bu başlığı API'ye aynen
    taşır; Spring CORS filtresi izin listesinde olmayan `http://localhost:3100` kökenini
    "Invalid CORS request" ile 403'e çeviriyordu. curl `Origin` göndermediği için tüm
    sunucu tarafı testler geçiyordu — **Playwright MCP ile gerçek tarayıcıda yeniden
    üretilip teşhis edildi.** Çözüm: desen bazlı CORS listesi
    (`http://localhost:*,http://127.0.0.1:*`; üretimde `ARS_WEB_ORIGINS` ile sıkılaştırılır),
    yanıltıcı "CSRF" hata mesajı düzeltildi, favicon eklendi (konsol gürültüsü kesildi).
    Doğrulama: Origin başlıklı login 200 ✓, kötü niyetli origin 403 ✓,
    **Playwright ile gerçek Chromium'da login → panel → çalıştırma detayı + SSE olayları
    render edildi, konsol hatası 0** (kanıt: `ars-login-success.png`, `ars-execution-detail.png`).
    Not: `@playwright/mcp` OpenCode MCP sunucusu olarak projeye eklendi (`opencode mcp list`).

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

## Faz 2 — Browser Automation ✅ (21 Kasım 2026)

### Tamamlananlar

**Browser worker (`apps/browser-worker`)**
- **Playwright 1.65 entegrasyonu:** singleton Chromium yaşam döngüsü (`BrowserLifecycle`),
  iş başına **tam izole** tarayıcı context'i (ayrı cookie/depo), her zaman `finally` ile
  kapatma, zarif kapanma sinyalleri
- **Güvenli test girişi:** kimlik bilgisi yalnızca *referans adıyla* çözülür
  (`WORKER_CREDENTIALS_FILE` yerel depo; üretimde şirket sır deposu). Giriş akışı:
  login sayfası → seçicilerle doldur → durum-bazlı bekleme (URL değişimi) → reddedilen
  girişte dürüst `FAILED`
- **GWT ve React adaptörleri:** ayrı DOM stratejileri (GWT: tablo hücresi etiketi,
  `gwt-*` hazır bulma; React: `ant-form-item` etiketleri) — ortak DOM varsayımı yok;
  state-bazlı hazır beklemeleri, **rastgele sleep yok**
- **Normalize eleman kaydı (sayfa-içi keşif):** etiket/erişilebilir ad/değer/durum
  (etkin, görünür, zorunlu)/seçenekler/DOM yolu/**güven skoru**; gizli alanlar kaydedilir
  ama görünmez işaretlenir; DOM içeriği yalnızca **veri** olarak okunur (prompt
  injection'a dirençli)
- **Kanıt üretimi:** tam sayfa screenshot, Playwright trace (zip), konsol/sayfa hatası
  ve başarısız ağ isteği tanılamaları
- **Geri bildirim kanalı (`ExecutionReporter`):** olay/durum/eleman/kanıt gönderimleri
  sabit içerik jetonuyla API'ye; geçici hata için 1 yeniden deneme; kayıp olay akışı
  asla tarayıcı oturumunu düşürmez
- **İş sözleşmesi:** geçerli discover işi → 202 + tek-uçuş kuyruk + yinelenen dağıtım
  reddi (409); `execute` ve `COMPARISON` → dürüst 501 (Faz 5)
- **Fixture uygulamaları (master prompt §20):** GWT-vari KPY68 (tablo yerleşimi,
  pasif bağımlı alan, gizli alan, seçenekli dropdown, radio, tablo), React-vari KPY68
  (antd benzeri), JS-şifreli login sayfası; worker `/fixtures/*` üzerinden servis eder

**API (`apps/api`)**
- **Flyway V2:** `discovered_element` + `artifact` tabloları (indeksler + CHECK'ler)
- **Internal callback kanalı:** `/api/internal/executions/{id}/events|status|elements|artifacts`
  — `X-ARS-Internal-Token` sabit-zamanlı karşılaştırma filtresiyle korunur; jeton
  yapılandırılmamışsa uçlar tamamen kapalı; **CSRF internal yollar için devre dışı**
  (kanal token'la kimlik doğrulur, tarayıcı oturumu değildir)
- **Durum makinesi güncellemeleri:** worker `RUNNING` (startedAt) → `COMPLETED/FAILED`
  (finishedAt + adım sayaçları); terminal durumlar idempotent (tekrar gönderim no-op),
  geri dönüş (terminal → CREATED vb.) reddedilir
- **MinIO kanıt deposu (`ArtifactStorageService`, minio 8.5.17):** byte'lar PostgreSQL
  yerine nesne deposunda; bucket yoksa otomatik oluşturulur; depo erişilemezse
  `ARTIFACT_STORAGE_UNAVAILABLE` (asla sessiz başarı yok); 25 MB üst sınırı
- **Kullanıcıya dönük kanıt uçları:** `GET /executions/{id}/artifacts|elements`,
  `GET /artifacts/{id}/content` (nesne depodan akış, oturumla korunur)

**Panel (`apps/web`)**
- Çalıştırma detayına **"Keşfedilen Elemanlar"** tablosu (etiket/tip/değer/etkin-görünür-
  zorunlu rozetleri) ve **"Kanıtlar"** bölümü (inline screenshot + trace/konsol linkleri)
- Süre gösterimi (`startedAt→finishedAt`), canlı adım sayaçları

### Doğrulama (çalıştırıldı ve geçti)

| Komut | Sonuç |
| --- | --- |
| `npm test -w apps/browser-worker` | **13/13** — gerçek Chromium E2E: GWT fixture'da etiketli alanlar, pasif alan, dropdown seçenekleri, gizli alan, tablolar; React fixture keşfi; runner'ın 4 senaryosu (tamamlanma, form girişi, eksik kimlik → FAILED, erişilemez hedef → FAILED) |
| `mvn -B package` (Docker) | BUILD SUCCESS — 13 birim testi |
| `mvn -B verify` (Testcontainers) | BUILD SUCCESS — entegrasyon testi (V2 migrasyonu + yeni entity doğrulamaları dahil) |
| **Canlı uçtan uca** | API(worker'a 202) → worker gerçek Chromium → fixture login kabulü → 14 eleman keşfi → screenshot (22,8 KB PNG, PNG imzası doğrulandı) + trace (126 KB) → MinIO `ars-artifacts/executions/3/` → API `COMPLETED` (13 geçen / 1 atlanan-gizli / 0 başarısız) |
| **Playwright MCP (gerçek tarayıcı)** | Panel → giriş → çalıştırma #3: "Tamamlandı · 2 sn", keşif tablosu render, kanıt görseli inline, **konsol hatası 0** (kanıt: `ars-phase2-execution.png`) |

### Giderilen Sorunlar

1. `confidence` kolonu Hibernate `Double`↔DB `numeric` uyuşmazlığı → entity `BigDecimal`'a
   çevrildi (migrasyon sabit kaldı; V2 zaten uygulanmıştı).
2. **Internal callback'ler 403:** `permitAll` yapılan yollarda CSRF filtresi yine
   çalışıyordu (permitAll filtre atlatmaz). CSRF internal kanal için
   `ignoringRequestMatchers` ile devre dışı bırakıldı; kanal token filtresiyle korunur.
   (Canlı keşifte yakalandı: worker tarayıcı işini bitirmiş ama API'de çalıştırma
   QUEUED'da kalmıştı.)
3. Worker kuyruk durumu (`activeExecutions`) modül-seviyesindeydi → route kaydı başına
   instance'a taşındı (test izolasyonu + çoklu app instance doğruluğu).
4. Test fixture yolları derinlik hatası (`apps/fixtures` → `apps/browser-worker/fixtures`).
5. Fixture login'i native GET form'dan JS-yönlendirmeliye çevrildi (kimlik bilgisi
   URL'ye sızmıyor — trace kayıtlarında sızma riski).

### Faz 2 Kapsamı Dışında (dürüstlük)

- **COMPARISON modu:** worker 501 verir — karşılaştırma motoru Faz 5.
- **Etkileşimli keşif (bağımlılık tespiti):** Faz 3 (güvenli etkileşim bütçesiyle);
  bu faz yalnızca pasif tarama yapar — hiçbir iş eylemi gerçekleştirilmez.
- **Doğal dil komutları / AI:** Faz 4.

---


## Yapılacaklar Listesi (teknik borç, fazlara dağıtılmış)

- [ ] Surefire/failsafe raporlarının CI dostu özeti (Faz 2)
- [ ] Rate limiting + sır deposu entegrasyonu (Faz 8 öncesi zorunlu)
- [ ] MinIO imajının iç registry sürümüne geçişi (şirket dağıtımı öncesi)
- [ ] Spring Boot 4.x değerlendirmesi (3.5 EOL notu; Faz 8 sonrası ayrı çalışma)
- [ ] Vitest config'lerindeki `configLoader: native` uyum uyarısının giderilmesi (kozmetik)
