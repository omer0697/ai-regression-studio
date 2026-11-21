# İlerleme Günlüğü

Bu döküman her kilometre taşından sonra güncellenir. Buradaki her iddia, çalıştırılmış
komut çıktılarıyla desteklenir; doğrulanmamış hiçbir şey "tamamlandı" yazılmaz.

---

## Faz 8 — Hardening ✅ (21 Kasım 2026)

### Tamamlananlar

- **Rate limiting (`RateLimitFilter`):** IP başına dakikalık token bucket —
  login/AI uçlarına daha düşük limit (varsayılan 30/dk; `ARS_RATE_LIMIT_SENSITIVE`),
  genel uçlara 600/dk (`ARS_RATE_LIMIT_DEFAULT`); 429 `RATE_LIMITED` yanıtı.
  Birim testi: bütçe aşımında 429 + JSON hata gövdesi.
- **Belge iş akışı dürüstlüğü (`DocumentWorkflowController`):** imza ve şifreleme
  akışları `REQUIRES_MANUAL_VERIFICATION` olarak raporlanır — anahtar yönetimi ve
  donanım token entegrasyonu tamamlanana kadar "geçti" **asla** iddia edilmez
  (master prompt §11/§12).
- **Maven UTF-8 kaynak kodlaması** zorunlu kılındı (PDFBox font kodlaması Türkçe
  karakterleri doğru yorumlasın diye).
- **İlerleme/yol haritası dokümantasyonu** tüm fazları kapsayacak şekilde güncellendi.

### Doğrulama

- `mvn -B package` → BUILD SUCCESS, **38 Java testi** (13→38: PDF 4, parser 13,
  plan/analiz 6, senaryo 3, rate limit 1 + öncekiler)
- Rate limit birim testi: 3 istek → 200; 4. istek → 429 `RATE_LIMITED`

---

## Faz 7 — Reporting ✅ (21 Kasım 2026)

- **ReportService:** yürütme raporu (özet adım sayaçları, bulgu kategori/ağırlık
  kırılımı, keşif kapsamı, tam bulgu listesi) + **dürüst "doğrulanmamış kapsam"**
  bölümü (makine bulguları insan onayı bekler; dinamik eklenen elemanlar kapsam dışı)
- **Dışa aktarma:** `GET /executions/{id}/report` (JSON) ve `report.pdf`
  (PDFBox ile üretilen Türkçe rapor)
- **UI:** çalıştırma detayında "Rapor (JSON)" + "Rapor (PDF)" düğmeleri
- **Canlı doğrulama:** #8 karşılaştırması → 7 bulgu (3 DEPENDENCY/2 FIELD_MISSING/
  1 VALUE/1 TABLE), PDF raporu `%PDF` imzasıyla 1993 bayt

## Faz 6 — Document Workflows (PDF) ✅ (21 Kasım 2026)

- **PdfComparisonService (PDFBox 3.0.5):** sayfa sayısı, başlık ve etiket→değer alan
  çıkarımı; dinamik tarih/kayıt no normalizasyonu (asla fark sayılmaz); byte-eşitlik
  **gerekmez**
- **4 birim testi PDF'leri kendisi üretir:** eksik alan, yanlış değer, sayfa sayısı
  farkı, zaman damgası normalizasyonu (master prompt §23'ün açık şartı)
- **Flyway V6/V7:** `pdf_comparison` tablosu; artifact tablosuna `PDF` tipi ve
  nullable `execution_id`
- **Uç:** multipart `POST /projects/{id}/pdf/compare` + geçmiş listesi; iki belge
  de kanıt olarak MinIO'ya kaydedilir
- **UI:** PDF Karşılaştırma sayfası (dosya seçicileri, beklenen alanlar JSON,
  karar rozeti, alan bazlı fark listesi, kanıt linkleri)
- **Canlı doğrulama:** sentetik GWT-vari ve hatalı React-vari PDF'ler →
  `DIFFERENT` + 3 enjekte edilmiş hata tespit edildi

## Faz 5 — Differential Engine ✅ (21 Kasım 2026)

- **Karşılaştırma işi (worker):** iki izole Chromium oturumu, aynı doğrulanmış plan
  GWT ve React'te sırayla yürütülür; yalnızca **davranış** karşılaştırılır (HTML/CSS
  asla); React tarafında hedefler eşleme üzerinden çözülür
- **Eşleme:** etiket bazlı (tam/tip 0.95, fuzzy 0.5+needsReview); veri tabloları
  **başlık imzasıyla** eşlenir; başlıksız GWT yerleşim tabloları gürültü üretmez
- **Bulgu üretimi:** FIELD_MISSING (plan ile ortaya çıkan koşullu bölümler dahil),
  STATE_MISMATCH, VALUE_MISMATCH, DEPENDENCY_MISMATCH, TABLE_MISMATCH — her biri
  beklenen/gerçekleşen metni + kanıt setiyle (4 screenshot) kalıcı
- **API:** Flyway V5; internal mapping/findings callback'leri; `BUG-SCREEN-NNN`
  kodları; CONFIRMED/DISMISSED insan kararı; AI hipotezi gözlemden ayrı alan
- **COMPARISON planı:** onaylı senaryo → yoksa Faz 3 gözlemlerinden deterministik
  türetme → ikisi de yoksa dürüst `NO_PLAN_DATA` reddi
- **UI:** Hata Raporları sayfası (filtreler, detay, onayla/yok say) + çalıştırma
  bulguları kartı
- **Şema:** `setCheckbox` açık hedef durum taşıyabilir (TS + Java senkron)
- **Canlı doğrulama (#8):** 7 bulgu `BUG-KPY68-001`…`007` + 4 kanıt MinIO'da

## Faz 4 — DeepSeek Agent ✅ (21 Kasım 2026)

- OpenAI-uyumlu adaptör (`AI_BASE_URL/AI_MODEL/AI_API_KEY/...`); vision asla
  varsayılmaz — istemler temizlenmiş eleman/gözlem metadata'sı; anahtar hiçbir uçta
  gösterilmez
- **ScenarioPlanParser:** kapalı aksiyon sözlüğü, bilinmeyen-alan reddi,
  iş-tanımlayıcı hedefler; 13 test
- Doğal dil (Türkçe) plan üretimi → PROPOSED senaryo; **insan onay kapısı**;
  AI analizleri (plan, kök-neden hipotezi) `AiAnalysis` kayıtlarıyla denetlenebilir
- AI yapılandırılmadığında: dürüst `409 AI_NOT_CONFIGURED` — hiçbir çıktı uydurulmaz
- UI: AI Keşif, Senaryo Kütüphanesi, AI Ayarları (durum + politika sözlüğü)

## Faz 3 — UI Discovery ✅ (21 Kasım 2026)

- Bütçeli güvenli etkileşim keşfi (yalnızca seçim/checkbox/radyo; **iş eylemi asla**);
  her adımda durum fotoğrafı → fark → kanıt → **orijinale döndür + doğrula**
- Bağımlılık gözlemi kaydı (etkin/görünür/değer/seçenekler); locator adayları;
  ortam bazlı keşif bütçesi; gerçek davranışlı fixture (DIGER→etkinleşme+otodoldurma,
  Aktif kapalı→tarih pasifleşir, Manuel→koşullu bölüm görünür)
- Canlı #4: 15 eleman + 4 etkileşim = 19 adım, 4 gözlem, hepsi geri döndürüldü

## Faz 2 — Browser Automation ✅ (21 Kasım 2026)

- Playwright 1.65: singleton Chromium + iş başına izole context; referansla çözülen
  güvenli test girişi; GWT/React adaptörleri; pasif keşif → normalize eleman
  kayıtları; screenshot + trace + konsol/ağ tanılamaları; tek uçuşlu kuyruk
- API: V2 (discovered_element, artifact), internal callback kanalı (token filtresi,
  CSRF kanal için kapalı), MinIO kanıt deposu; durum makinesi idempotent terminal
- Canlı #3: giriş → keşif → 14 eleman → kanıtlar → COMPLETED

## Faz 1 — Foundation ✅ (21 Kasım 2026)

Monorepo, Next.js 16 + Spring Boot 3.5.16 + Fastify worker; oturum+CSRF+RBAC;
proje/ortam/ekran yönetimi; çalıştırma API'si; SSE; Flyway V1; 36 TS + 14 Java testi;
tam yığın duman testi.

### Giderilen Önemli Sorunlar (tüm fazlar)

1. CSRF sınıfları yanlış pakette → `web.csrf`
2. `SecurityContextHolderStrategy` bean'i eksik → eklendi
3. React 19 `useSearchParams` prerender hatası → Suspense
4. `z.coerce.number()` RHF tip uyumsuzluğu → `valueAsNumber`
5. **localhost cookie çakışması** → `ARS-XSRF-TOKEN` + `ARS-SESSIONID`
6. **Gerçek tarayıcıda 403 (kök neden):** tarayıcı her POST'a Origin ekler; CORS
   desen listesine `localhost:*` eklendi — curl Origin göndermediği için testler
   geçiyordu; Playwright MCP ile üretildi ve doğrulandı
7. `confidence` Double↔numeric uyuşmazlığı → BigDecimal
8. **Internal callback 403:** `permitAll` yollarında CSRF filtresi yine çalışıyordu →
   `ignoringRequestMatchers`
9. Worker kuyruk durumu modül-seviyesindeydi → instance'a taşındı
10. Fixture login'i native GET yerine JS yönlendirmeli (kimlik URL'ye sızmaz)
11. `setCheckbox` değer taşıyamıyordu → şema bilinçli genişletildi (TS+Java)
12. Flyway V6 checksum (geliştirme sırasında değişti) → geliştirme DB'sinde
    düzeltildi; **üretim kuralı:** uygulanan migrasyonlar asla düzenlenmez (V7 ayrı)
13. Maven kaynak kodlaması → UTF-8 zorunlu
14. PDFBox WinAnsi font kodlaması Türkçe glifleri → transliterasyon yardımcıları

---

## Faz Kapsamı Dışında (dürüstlük — asla "geçti" iddia edilmez)

| Konu | Durum |
| --- | --- |
| Elektronik imza akışı | `REQUIRES_MANUAL_VERIFICATION` — anahtar yönetimi entegrasyonu bekliyor |
| Şifreleme/çözme doğrulaması | `REQUIRES_MANUAL_VERIFICATION` — onaylı test anahtarları bekliyor |
| Execute işi (tek uygulamada senaryo) | Karşılaştırma motoruyla birleşik; ayrı iş tipi gerekirse eklenir |
| Doğal dil komutundan otomatik COMPARISON zinciri | Senaryo onayı insan kararı (bilinçli tasarım) |
| Gerçek KAP uygulaması | Tüm geliştirme fixture'lerle doğrulandı; gerçek ortam bağlantısı kurumsal adımda |

## Yapılacaklar Listesi (üretim öncesi)

- [ ] Rate limit durumunu paylaşımlı depoya taşı (çok örnekli dağıtım için)
- [ ] MinIO imajını iç registry sürümüne sabitle
- [ ] Şirket sır deposu entegrasyonu (worker kimlik referansları için)
- [ ] Spring Boot 4.x değerlendirmesi (3.5 EOL notu)
- [ ] Kullanıcı yönetimi UI'ı (RBAC zaten API'de aktif)
- [ ] Denetim kaydı görüntüleyici UI
