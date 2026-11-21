# Test Stratejisi

## İlk İlke

> Bu platformun kendisi de sınanır ve platform asla test sonucu **uydurmaz**.
> Her iddia, yürütülebilen bir testle desteklenir; desteklenmeyenler `NOT_SUPPORTED`
> olarak raporlanır.

## Test Piramidi

```text
            ┌─────────────────────────┐
            │  E2E (Playwright)        │  Faz 2+: platformun kendi UI'ı + fixture uygulamalar
            ├─────────────────────────┤
            │  Entegrasyon (IT)        │  Testcontainers ile gerçek PostgreSQL; tam uçtan uca HTTP
            ├─────────────────────────┤
            │  Web katmanı (MockMvc)   │  Doğrulama/404/409 sözleşmeleri, güvenlik filtreleri kapalı
            ├─────────────────────────┤
            │  Birim (JUnit+Mockito)   │  Servis iş kuralları, durum makinesi, hata sınıflaması
            ├─────────────────────────┤
            │  TS şema testleri (Vitest)│ Kapalı aksiyon sözlüğü, iş yükü doğrulaması, formlar
            └─────────────────────────┘
```

## Mevcut Durum (Faz 1) — Doğrulanmış

### TypeScript (36 test, `npm test`)

| Paket | Kapsam |
| --- | --- |
| `shared-contracts` | Terminal durum makinesi (`NOT_SUPPORTED` terminal), hata kodu biçimleri |
| `test-schemas` | Kapalı aksiyon sözlüğü (shell/eval/yıkıcı eylem reddi), hedef tanımlayıcı kısıtları, iş yükü şeması, **sır kaçakçılığı reddi** |
| `browser-worker` | Sağlık raporunun dürüstlüğü, 501 yapısal yanıtı, geçersiz/zararlı iş reddi (400) |
| `web` | Form şemaları (proje/ortam/ekran/çalıştırma), listeye dönüştürme, durum etiketleme |

### Java (14 test, `mvn package` / `mvn verify`)

| Sınıf | Kapsam |
| --- | --- |
| `ProjectServiceTest` | Yinelenen isim → 409; kalıcılık + denetim; olmayan kayıt → 404 |
| `ExecutionServiceTest` | Worker yok → `NOT_SUPPORTED/WORKER_NOT_CONFIGURED`; worker 501 → `NOT_SUPPORTED/WORKER_CAPABILITY_NOT_IMPLEMENTED`; worker erişilemez → `ERROR/WORKER_UNAVAILABLE`; aktif çalıştırma → 409; COMPARISON + eksik React ortamı → 409; kuyruğa alma → `QUEUED` |
| `ProjectControllerTest` | Boş gövde → 400 + alan hataları; geçerli → 201; 409/404 sözleşmesi |
| `ArsApiApplicationIT` | **Tam uçtan uca:** sağlık → CSRF cookie → token'sız login 403 → hatalı kimlik 401 → gerçek login → proje → GWT+React ortamları → yinelenen ortam 409 → KPY68 → çalıştırma → `NOT_SUPPORTED` → olay kaydı bunu belgeler → anonim erişim 401 |

### Uçtan Uca Duman Testi (elle doğrulandı, gerçek altyapıda)

PostgreSQL + MinIO + worker + API ayağa kaldırıldı; gerçek HTTP akışı (curl ile):
login → proje → ortamlar → KPY68 → çalıştırma → `WORKER_CAPABILITY_NOT_IMPLEMENTED`
(worker'dan gerçek 501) → dashboard worker yetenek raporu → olay anlık görüntüsü →
**SSE akışı** (hem doğrudan hem Next proxy üzerinden, buffer'lanmadan).

## Fixture Stratejisi (Faz 5–8 Hazırlığı)

Platformun hata **bulma** yeteneği, bilinçli hata yerleştirilmiş sentetik uygulamalarla kanıtlanacak:

| Fixture | Bilinçli Hata |
| --- | --- |
| GWT-vari fixture | Referans davranış (doğru bağımlılık, doğrulama, tablo, PDF) |
| React-vari fixture | Eksik alan, yanlış disabled durumu, eksik zorunlu doğrulama, bozuk dropdown bağımlılığı, API değeri forma yansımayan alan, hatalı tablo verisi, eksik/hatalı PDF alanı |
| İmza/şifreleme fixture | Onaylı test anahtarları ile başarısız imza, yetkisiz belge erişimi |

Bu fixture'ler `apps/browser-worker/test-fixtures/` altına (Faz 5) eklenecek; karşılaştırma
motorunun bilinen hataları **tümünü** yakaladığı otomatik E2E testlerle kanıtlanacak.
Yanlış-pozitif senaryoları (belirsiz eşleme, zararsız normalizasyon farkları) da ayrıca sınanacak.

## Komutlar

```powershell
npm test                          # 36 TS testi
npm run build                     # typecheck + tüm paketler + web production build
npm run lint                      # ESLint (next/core-web-vitals + typescript)

# Java (Docker üzerinden, JDK gerekmez):
docker run --rm -v "${PWD}\apps\api:/app" -v ars-maven-cache:/root/.m2 -w /app `
  maven:3.9-eclipse-temurin-21 mvn -B package   # 13 birim testi

docker run --rm -v "${PWD}\apps\api:/app" -v ars-maven-cache:/root/.m2 `
  -v //var/run/docker.sock:/var/run/docker.sock `
  -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal `
  -w /app maven:3.9-eclipse-temurin-21 mvn -B verify   # + entegrasyon testi
```

JDK 21 yerelde kuruluysa doğrudan `mvn test` / `mvn verify` de çalışır;
entegrasyon testi yalnızca Docker'ın erişilebilir olduğu ortamlarda koşar (`@Tag("integration")`).

## Sonuç Politikası

| Durum | Anlamı | Kaynak |
| --- | --- | --- |
| `COMPLETED` + adım sonuçları | Deterministik doğrulama geçti | Karşılaştırma motoru (Faz 5) |
| `FAILED` | Doğrulama başarısız, kanıt üretildi | Karşılaştırma motoru |
| `NOT_SUPPORTED` | Platform bu adımı henüz yerine getiremiyor | Yapı/banka kodu (uydurma yok) |
| `ERROR` | Altyapı hatası (worker erişilemez vb.) | Sistem |
| Beklemede kapsam | Doğrulanamayan senaryolar raporda ayrıca listelenir | Faz 7 raporlama |
