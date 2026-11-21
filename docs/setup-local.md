# Yerel Kurulum — Docker Gerekmez (AI uyumlu talimat)

> Bu doküman, bir yapay zekâ agent'ının veya bir insanın **harfiyen takip
> ederek** uygulamayı bir geliştirme makinesinde Docker **olmadan** çalıştırmasını
> sağlar. Her adım: bir komut, beklenen çıktı ve doğrulama içerir. Adımları
> atlamayın; sırayla çalıştırın.

---

## 0. Bileşen haritası (mantık)

```text
ai-regression-studio/
├── apps/api/             → Spring Boot 3.5 (Java 21) — http://localhost:8080
│                           Tüm iş mantığı, veritabanı, oturum, SSE, kanıt deposu.
├── apps/web/             → Next.js 16 panel — http://localhost:3000
│                           Tarayıcı arayüzü (projeler, sohbet, hata raporları…).
├── apps/browser-worker/  → Fastify + Playwright worker — http://localhost:9100
│                           Gerçek Chromium ile eski/yeni uygulamayı test eder.
├── packages/*            → Paylaşılan TS kontratları (derlenmiş, npm ile gelir).
└── docs/                 → Bu dokümantasyon.
```

Üç süreç ayrı terminalde çalışır: `api`, `web`, `worker`.
Worker'a ihtiyaç yoksa platform ayakta kalır; çalıştırmalar dürüstçe
`WORKER_NOT_CONFIGURED` ile sonuçlanır (sahte sonuç üretmez).

---

## 1. Ön koşullar

| Yazılım | Sürüm | Kontrol komutu | Beklenen |
| --- | --- | --- | --- |
| Node.js | ≥ 20.9 (22 LTS önerilir) | `node -v` | `v20.x` veya üstü |
| JDK | 21 | `java -version` | `openjdk version "21…"` |
| Maven | 3.9+ | `mvn -version` | `Apache Maven 3.9.x` |
| Git | güncel | `git --version` | herhangi bir sürüm |

> **Docker/Kubernetes gerekmez.** Veritabanı olarak gömülü SQLite kullanılır
> (Seçenek A) veya kendi sunucunuzdaki PostgreSQL'e bağlanırsınız (Seçenek B).
> Kanıt dosyaları (screenshot/trace) MinIO yerine yerel klasöre yazılır.

---

## 2. Depoyu hazırla

```powershell
git clone <repo-url>
cd ai-regression-studio
npm install          # monorepo kökünde; packages/* otomatik derlenir
npm run build        # shared-contracts + browser-worker derlemesi
```

**Doğrulama:** `npm run build` hatasız bitmeli; `packages/shared-contracts/dist/index.js` var olmalı.

---

## 3. Veritabanı seçimi (tam birini seçin)

### Seçenek A — Gömülü SQLite (önerilen; hiçbir dış servis gerekmez)

Tek dosyalık veritabanı, uygulama klasöründe oluşur. Flyway şemayı kurar
(`db/sqlite` altındaki tek betik; PostgreSQL betikleriyle karışmaz).
**Ek kurulum adımı yoktur.**

```powershell
cd apps/api
$env:SPRING_PROFILES_ACTIVE="sqlite"     # Windows PowerShell
mvn spring-boot:run
```

- Veritabanı dosyası: `apps/api/data/ars.sqlite` (ilk açılışta otomatik oluşur;
  taşınabilir/yedeklenebilir tek dosya).
- Kanıt klasörü: `apps/api/data/artifacts/`.
- Değiştirmek isterseniz: `ARS_SQLITE_FILE` (JDBC URL'i, örn.
  `jdbc:sqlite:C:/ars/ars.sqlite`) ve `ARS_STORAGE_DIR`.

**Beklenen çıktı (ilk satırlar):** Flyway `Successfully applied 1 migration`
(veya `Schema is up to date`) + sonunda `Started ArsApiApplication`.
Tarayıcıdan <http://localhost:8080/api/auth/me> → `401` dönerse API ayaktadır.

### Seçenek B — Sunucudaki PostgreSQL (mevcut kurumsal veritabanı)

```powershell
cd apps/api
$env:ARS_DATASOURCE_URL="jdbc:postgresql://SUNUCU:5432/ars"
$env:ARS_DATASOURCE_USERNAME="ars"
$env:ARS_DATASOURCE_PASSWORD="********"
mvn spring-boot:run
```

- Flyway, `db/migration` altındaki V1…V9 betiklerini PostgreSQL'e uygular.
- Doğrulama aynı: `/api/auth/me` → `401`.

> Her iki seçenekte de ilk açılışta ilk yönetici hesabı oluşturulur:
> `admin / admin123!` (değiştirmek için: `ARS_SEED_ADMIN_USERNAME`,
> `ARS_SEED_ADMIN_PASSWORD` — yalnız ilk açılışta etkili).

---

## 4. API'yi çalıştır (3. adımdaki komut zaten bunu yapar)

Terminal 1 açık kalsın. Ayakta olduğunu doğrula:

```powershell
curl.exe -s -o NUL -w "%{http_code}" http://localhost:8080/api/auth/me
# beklenen çıktı: 401
```

---

## 5. Tarayıcı worker'ı çalıştır (Playwright)

Terminal 2 (monorepo kökünde):

```powershell
npx playwright install chromium          # ilk kez: tarayıcı ikilisi (~150 MB)

$env:WORKER_API_BASE_URL="http://localhost:8080"
$env:WORKER_INTERNAL_TOKEN="ars-dev-internal-token"
$env:WORKER_CREDENTIALS_FILE="apps/browser-worker/fixtures/credentials.example.json"
node apps/browser-worker/dist/index.js
```

**Doğrulama:** `curl.exe -s http://localhost:9100/api/health` → `"ready": true`.
Fixture test uygulamaları: `http://localhost:9100/fixtures/gwt-kpy68.html`.

> Bu adım opsiyoneldir: worker kapalıyken de panel/sohbet/raporlar çalışır;
> yalnız gerçek tarayıcı testleri bekletilir.

---

## 6. Paneli (web) çalıştır

Terminal 3 (monorepo kökünde):

```powershell
npm run dev:web
```

- URL: <http://localhost:3000> (port doluysa Next boş portu seçer — konsola bakın).
- Giriş: `admin` / `admin123!`.

**Doğrulama:** Tarayıcıda panel açılır, "Toplam Proje" görünür, konsolda hata yok.

---

## 7. İlk test verisi (60 saniyede uçtan uca)

1. **Projeler** → `Yeni Proje` → ad: `KAP Migration` → oluştur.
2. Proje detayı → **Ortamlar** → `Ortam Ekle` (iki kez):
   - GWT: temel URL `http://localhost:9100/fixtures/gwt-kpy68.html`,
     kimlik `TEST_ACCOUNT_FORM`, login URL `/fixtures/login.html` yerine
     `http://localhost:9100/fixtures/login.html`, seçiciler
     `input[name='username']`, `input[name='password']`, `button[type='submit']`,
     kimlik referansı `kap-gwt-test-user`.
   - React: `http://localhost:9100/fixtures/react-kpy68.html`, giriş gerekmiyor.
3. **Ekranlar** → `Ekran Ekle`: kod `KPY68`, ad `Parametre Tanımları`.
4. **Çalıştırmalar** → ekran + `Keşif (GWT)` → `Çalıştır` → canlı akışı izle.
5. **Hata Raporları**: karşılaştırma/kombinasyon sonrası farklar kart olarak listelenir.

---

## 8. AI sağlayıcısını panelden bağla (kod gerektirmez)

**AI Ayarları** sayfası artık ekrandan düzenlenebilir:

1. Panelde **Sistem → AI Ayarları**.
2. `Temel URL` (örn. `https://deepseek.sirket.local/v1`), `Model`
   (örn. `deepseek-chat`), `API anahtarı` girin → `Kaydet`.
3. `Bağlantıyı Test Et` → sağlayıcıdan `OK` yanıtı gelmelidir.

- Ayarlar `ai_provider_setting` tablosunda tutulur; `AI_*` ortam değişkenlerinin
  **yerine geçer**, yeniden başlatma gerekmez.
- Anahtar hiçbir API yanıtında geri döndürülmez; yalnızca `AI Ayarları`
  ekranından değiştirilir. **Paylaşılan ortamda anahtarı ortam değişkeni
  olarak tutun ve bu satırı hiç yazmayın.**
- AI kapalıyken platform dürüst çalışır: AI uçları `AI_NOT_CONFIGURED` döner,
  sohbet deterministik komut yorumlayıcısıyla aynı gerçek verilerle yanıt verir.

---

## 9. Sık karşılaşılan sorunlar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| API açılmıyor, `Flyway ... Unsupported Database` | `SPRING_PROFILES_ACTIVE=sqlite` verilmemiş | Terminalde profili tanımlayıp yeniden `mvn spring-boot:run` |
| `data/ars.sqlite: database is locked` | Aynı dosyayı ikinci API süreci kullanıyor | Tek API örneği çalıştırın |
| Web'de API'ye ulaşılamıyor | API ayakta değil / farklı port | `API_PROXY_TARGET` ortam değişkeni (`http://localhost:8080`) |
| Çalıştırma `WORKER_NOT_CONFIGURED` | Worker tanımlı değil | Adım 5 + API'de `ARS_WORKER_BASE_URL=http://localhost:9100` |
| Çalıştırma `WORKER_UNAVAILABLE` | Worker kapalı | Worker terminalini kontrol edin (`/api/health`) |
| Login 403 (POST) | CORS/Origin desen dışı | API'de `ARS_WEB_ORIGINS` desenine `http://localhost:*` ekle |
| `browserType executable doesn't exist` | Chromium inmedi | `npx playwright install chromium` |
| Testler veri tabanına yazmıyor | FK/kaskad kapalı | SQLite profili `foreign_keys=true` ister; profile komutuyla çalıştırın |

---

## 10. Üretim/sunucu notları

- SQLite modu **tek kullanıcılı yerel** kullanım içindir; eşzamanlı çok yazıcıda
  PostgreSQL'e geçin (Seçenek B).
- Kanıt klasörünü (`data/artifacts`) yedekleyin; DB ile birlikte taşınır.
- Paylaşılan kurulumda: `ARS_SEED_ADMIN_PASSWORD` güçlü, `ARS_INTERNAL_TOKEN`
  rastgele uzun, `ARS_WEB_ORIGINS` daraltılmış olmalı; AI anahtarı DB yerine
  `AI_*` ortam değişkenlerinde tutulmalı.
