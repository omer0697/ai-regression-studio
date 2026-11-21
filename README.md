# AI Regression Studio

GWT tabanlı eski kurumsal uygulamalar ile React tabanlı yenileri arasında **fonksiyonel regresyon testleri** üretip karşılaştıran, yapay zekâ destekli, kanıt odaklı bir test platformudur. İlk hedef uygulama **KAP** (KPY68, KPY50, KPY33 ekranları); platform, ekran tanımı üzerinden başka kurumsal uygulamalar için de kullanılabilir şekilde tasarlanmıştır.

> **Dürüstlük ilkesi:** Platform, henüz devreye alınmamış yetenekler için asla "geçti" sonucu üretmez. Tarayıcı otomasyonu (Faz 2) devreye girene kadar çalıştırmalar makine-okunabilir `NOT_SUPPORTED` durum koduyla sonuçlanır ve olay kayıtları bunu açıkça belgeler.

---

## Mimari Bakış

```text
ai-regression-studio/
├── apps/
│   ├── web/                   # Next.js 16 (App Router) — panel, proje/ortam yönetimi, canlı akış
│   ├── api/                   # Spring Boot 3.5 (Java 21) — orkestrasyon, RBAC, kalıcılık, SSE
│   └── browser-worker/        # Fastify + Playwright worker (Faz 2'de otomasyon devreye girer)
├── packages/
│   ├── shared-contracts/      # TS tipleri + durum/enum kontratları (web ↔ worker)
│   └── test-schemas/          # Zod iş şemaları: kapalı aksiyon sözlüğü, iş yükü doğrulama
├── infrastructure/
│   ├── docker-compose.yml     # PostgreSQL 17 + MinIO (yerel geliştirme altyapısı)
│   └── docker-compose.full.yml# Tüm yığın (api + web + worker) konteynerde
└── docs/                      # mimari, güvenlik, test stratejisi, ilerleme
```

Ayrıntılı tasarım için `docs/architecture.md` dosyasına bakın.

## Gereksinimler

| Bileşen | Sürüm | Not |
| --- | --- | --- |
| Node.js | ≥ 20.9 (22 LTS önerilir) | web + worker |
| JDK 21 + Maven 3.9 | güncel | API; yerelde yoksa derleme Docker ile yapılır (aşağıda) |
| Docker Desktop | güncel | **Yalnız** tam yığın konteyner kurulumu ve entegrasyon testleri için; yerel çalıştırma için gerekmez |
| Git | güncel | sürüm kontrolü |

> Docker'sız, hiçbir dış servis gerektirmeyen kurulum için
> **`docs/setup-local.md`** dosyasını okuyun: gömülü **SQLite** veritabanı
> (`SPRING_PROFILES_ACTIVE=sqlite`) ve dosya sistemi tabanlı kanıt deposu
> (`ARS_STORAGE_MODE=filesystem`) ile üç terminal komutuyla çalışır.

## Hızlı Başlangıç

### Yol 1 — Docker'sız yerel kurulum (önerilen; ayrıntı: `docs/setup-local.md`)

```powershell
npm install                 # monorepo kökünde, ilk kez
npm run build               # packages + worker derlemesi

# Terminal 1 — API (gömülü SQLite + dosya tabanlı kanıt deposu)
cd apps/api
$env:SPRING_PROFILES_ACTIVE="sqlite"
mvn spring-boot:run

# Terminal 2 — worker (opsiyonel; gerçek tarayıcı testi için)
npx playwright install chromium
$env:WORKER_API_BASE_URL="http://localhost:8080"
$env:WORKER_INTERNAL_TOKEN="ars-dev-internal-token"
$env:WORKER_CREDENTIALS_FILE="apps/browser-worker/fixtures/credentials.example.json"
node apps/browser-worker/dist/index.js

# Terminal 3 — panel
npm run dev:web             # http://localhost:3000
```

Kendi PostgreSQL sunucunuz varsa Terminal 1'de profil yerine
`ARS_DATASOURCE_URL` verin; ayrıntılar ve doğrulama adımları kurulum
dokümanındadır.

### Yol 2 — Docker tabanlı kurulum (tam yığın / altyapı)

### 1) Altyapıyı kaldırın

```powershell
cd infrastructure
copy .env.example .env      # varsayılanlar yerel geliştirme için uygundur
docker compose up -d        # PostgreSQL (5432) + MinIO (9000/9001) + ars-artifacts bucket
```

> **MinIO notu:** MinIO resmi imajları Docker Hub'tan kaldırıldı ve quay.io anonim çekmeye izin
> vermiyor. Geliştirme compose'u `bitnamilegacy/minio` aynasını kullanır. Şirket ortamında imajı
> iç registry'nize alıp etiketi sabitleyin.

### 2) API'yi derleyin ve çalıştırın

Java yerelde kuruluysa:

```powershell
cd apps/api
mvn spring-boot:run
```

Java yerelde yoksa (Docker):

```powershell
docker run --rm -it -p 8080:8080 `
  -v "${PWD}\apps\api:/app" -v ars-maven-cache:/root/.m2 -w /app `
  -e ARS_WORKER_BASE_URL=http://host.docker.internal:9100 `
  maven:3.9-eclipse-temurin-21 mvn spring-boot:run
```

İlk açılışta Flyway şemayı kurar ve ilk yönetici hesabını oluşturur
(`ARS_SEED_ADMIN_USERNAME` / `ARS_SEED_ADMIN_PASSWORD`, varsayılan `admin` / `admin123!`).
**Ortak ortamlara taşımadan önce mutlaka güçlü bir parola belirleyin.**

### 3) Browser worker'ı çalıştırın

```powershell
npm install                 # monorepo kökünde, ilk kez
npm run build               # packages + worker derlemesi
npx playwright install chromium   # ilk kez: tarayıcı ikilileri

# Geliştirme: API callback + fixture kimlikleri ile
$env:WORKER_API_BASE_URL="http://localhost:8080"
$env:WORKER_INTERNAL_TOKEN="ars-dev-internal-token"
$env:WORKER_CREDENTIALS_FILE="apps/browser-worker/fixtures/credentials.example.json"
node apps/browser-worker/dist/index.js    # http://localhost:9100
```

Worker hazır olduğunda `/api/health` → `"ready": true` döner; **fixture uygulamaları**
`http://localhost:9100/fixtures/gwt-kpy68.html` adresinden servis edilir. Projedeki
ortamı bu adrese + `TEST_ACCOUNT_FORM` girişine yönlendirip (loginUrl:
`/fixtures/login.html`, seçiciler `input[name='username']`, `input[name='password']`,
`button[type='submit']`, kimlik referansı `kap-gwt-test-user`) **Çalıştır** dediğinizde
worker gerçek Chromium ile giriş yapar, KPY68 ekranını pasif olarak keşfeder ve
screenshot + trace kanıtlarını MinIO'ya yükler; panelde canlı izlersiniz.

> **Sır yönetimi:** `credentials.example.json` yalnızca fixture demo hesabıdır
> (`testuser / test-pass-123`). Gerçek ortamlar için git-ignore'lı
> `credentials.local.json` kullanın (`WORKER_CREDENTIALS_FILE`); üretimde bunun yerini
> şirket sır deposu alır.

### 4) Paneli açın

```powershell
npm run dev:web             # http://localhost:3000 (port doluysa Next bir sonraki boş portu kullanır)
```

Tarayıcıdan panele girin, ilk yöneticiyle oturum açın ve **Projeler** sayfasından:
proje oluşturun → GWT ve React ortamlarını tanımlayın → KPY68 ekranını kaydedin → çalıştırma başlatın.

### Tüm yığını tek komutta (opsiyonel)

```powershell
cd infrastructure
docker compose -f docker-compose.yml -f docker-compose.full.yml up -d --build
```

## Ortam Değişkenleri

### API (`apps/api`)

| Değişken | Varsayılan | Açıklama |
| --- | --- | --- |
| `SPRING_PROFILES_ACTIVE` | *(boş)* | `sqlite` = gömülü tek dosyalık veritabanı + dosya tabanlı kanıt deposu; hiçbir dış servis gerekmez (bkz. `docs/setup-local.md`) |
| `ARS_DATASOURCE_URL` | `jdbc:postgresql://localhost:5432/ars` | PostgreSQL bağlantısı (`sqlite` profili aktifken yerine `ARS_SQLITE_FILE` geçer) |
| `ARS_SQLITE_FILE` | `jdbc:sqlite:./data/ars.sqlite` | SQLite profilinde veritabanı dosyası |
| `ARS_DATASOURCE_USERNAME` / `ARS_DATASOURCE_PASSWORD` | `ars` / `ars` | PostgreSQL kimliği |
| `ARS_SEED_ADMIN_USERNAME` / `ARS_SEED_ADMIN_PASSWORD` | `admin` / `admin123!` | İlk yönetici (yalnız ilk açılış) |
| `ARS_WORKER_BASE_URL` | *(boş)* | Boşsa platform ayakta kalır; çalıştırmalar `WORKER_NOT_CONFIGURED` ile dürüstçe sonuçlanır |
| `ARS_STORAGE_MODE` | `s3` | `s3` (MinIO) veya `filesystem` (yerel klasör; sqlite profiliyle birlikte varsayılan) |
| `ARS_STORAGE_DIR` | `./data/artifacts` | `filesystem` modunda kanıt klasörü |
| `ARS_MINIO_ENDPOINT` / `ARS_MINIO_ACCESS_KEY` / `ARS_MINIO_SECRET_KEY` / `ARS_MINIO_BUCKET` | bkz. yml | S3 modu için MinIO ayarları |
| `ARS_WEB_ORIGINS` | `http://localhost:*` | Yalnız doğrudan (proxy'siz) erişim için CORS |
| `ARS_API_PORT` | `8080` | HTTP portu |

### Web (`apps/web`)

| Değişken | Varsayılan | Açıklama |
| --- | --- | --- |
| `API_PROXY_TARGET` | `http://localhost:8080` | `/backend/*` rewrite hedefi (same-origin cookie/CSRF için) |
| `NEXT_PUBLIC_API_BASE_URL` | *(boş = `/backend`)* | API'ye doğrudan erişim modu (CORS + SameSite gerektirir) |

### Worker (`apps/browser-worker`)

| Değişken | Varsayılan | Açıklama |
| --- | --- | --- |
| `WORKER_PORT` | `9100` | HTTP portu |
| `WORKER_HOST` | `0.0.0.0` | Bağlanacak arayüz |

### AI (Faz 4)

```text
AI_BASE_URL=           # şirket içi DeepSeek uç noktası
AI_MODEL=
AI_API_KEY=
AI_TIMEOUT_SECONDS=
AI_MAX_OUTPUT_TOKENS=
```

Bu değişkenler hâlâ çalışır; ayrıca **AI Ayarları ekranından** sağlayıcı
artık yönetilebilir (`ai_provider_setting` tablosu, ekran ayarları ortam
değişkenlerinin yerine geçer, yeniden başlatma gerekmez; anahtar yalnızca
yazılır, hiçbir yanıtta geri döndürülmez). AI hiç yapılandırılmadığında
platform çalışmaya devam eder; AI destekli adımlar açıkça
`NOT_SUPPORTED`/`AI_NOT_CONFIGURED` olarak raporlanır.

## Testleri Çalıştırma

```powershell
# TypeScript: 36 test (kontratlar, şemalar, worker, web formları)
npm test

# Java birim testleri (13 test) — Docker ile, JDK gerekmez:
docker run --rm -v "${PWD}\apps\api:/app" -v ars-maven-cache:/root/.m2 -w /app `
  maven:3.9-eclipse-temurin-21 mvn -B package

# Java entegrasyon testi (Testcontainers + PostgreSQL, tam uçtan uca):
docker run --rm -v "${PWD}\apps\api:/app" -v ars-maven-cache:/root/.m2 `
  -v //var/run/docker.sock:/var/run/docker.sock `
  -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal `
  -w /app maven:3.9-eclipse-temurin-21 mvn -B verify
```

## Yol Haritası

| Faz | Kapsam | Durum |
| --- | --- | --- |
| 1 — Foundation | Monorepo, web/api/worker iskeletleri, auth+RBAC, proje/ortam/ekran yönetimi, çalıştırma API'si, SSE, altyapı, testler | ✅ |
| 2 — Browser Automation | Playwright yaşam döngüsü, izole context'ler, güvenli test girişi, GWT/React adaptörleri, pasif keşif, screenshot/trace/kanıt (MinIO), canlı ilerleme | ✅ |
| 3 — UI Discovery | Güvenli etkileşimli keşif, bağımlılık gözlemleri, keşif bütçeleri, locator adayları | ✅ |
| 4 — DeepSeek Agent | OpenAI-uyumlu adaptör, doğal dil plan üretimi, insan onay kapısı, dürüst AI_NOT_CONFIGURED | ✅ |
| 5 — Differential Engine | GWT ↔ React karşılaştırma, eşleme, kanıt destekli bulgular, hata raporları | ✅ |
| 6 — Document Workflows | PDFBox yapısal PDF karşılaştırma, sentetik PDF doğrulaması, imza/şifreleme dürüst durumu | ✅ |
| 7 — Reporting | Özet/kırılım raporları, doğrulanmamış kapsam bölümü, JSON + PDF dışa aktarma | ✅ |
| 8 — Hardening | Rate limiting, imza/şifreleme dürüst durumu, UTF-8 derleme, dokümantasyon | ✅ |
| 9 — Local Experience | Docker'sız SQLite profili, filesystem kanıt deposu, ortam/ekran düzenleme, hata kartları, sohbet yeniden tasarımı, ekrandan AI ayar yönetimi, kurulum dokümanı | ✅ |

Ayrıntılı durum: `docs/progress.md`.

## API Dokümantasyonu

API ayağıkken Springdoc OpenAPI: `http://localhost:8080/swagger-ui.html`
(oturum açıldıktan sonra erişilir).
