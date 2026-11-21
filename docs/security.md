# Güvenlik

Bu döküman, platformun güvenlik modelini ve kurumsal dağıtımdan önce tamamlanması
gereken adımları tanımlar. Platform, şirket **iç ağı** ve onaylı **test ortamları** için tasarlanmıştır.

## Kimlik Doğrulama ve Yetkilendirme

- **Oturum tabanlı kimlik doğrulama** (Spring Security, `HttpSession`). Şifreler `BCrypt` ile saklanır.
- **RBAC rolleri:** `ADMIN` (proje yönetimi + pasife alma), `TESTER` (yapılandırma + çalıştırma),
  `VIEWER` (yalnız okuma, Faz 8'de kullanıcı yönetimi UI'ı ile birlikte tam devreye girer).
  Mutasyon uçları `@PreAuthorize` ile korunur.
- **CSRF:** SPA cookie deseni — `XSRF-TOKEN` cookie'si JS tarafından okunabilir (`httpOnly=false`),
  mutasyon istekleri `X-XSRF-TOKEN` başlığı ile yansıtır. Token'sız POST'lar 403 alır (testle doğrulandı).
- **Same-origin varsayılanı:** Tarayıcı API'ye Next.js reverse proxy'si üzerinden konuşur
  (`/backend/*`), dolayısıyla çapraz-site cookie senaryosu baştan engellenir. Doğrudan erişim
  modu (`NEXT_PUBLIC_API_BASE_URL`) yalnızca CORS allowlist + `SameSite=None` (HTTPS) ile kullanılmalıdır.
- **Oturum kapanışı:** `POST /api/auth/logout` oturumu geçersiz kılar; istemci ayrıca oturum
  süresi dolduğunda `/login`'e yönlendirilir.

## Sır Yönetimi (Kritik Tasarım Kararı)

> Kimlik bilgileri **asla** platform veritabanında, frontend'de, loglarda veya AI istemlerinde tutulmaz.

- `application_environment.credential_reference` yalnızca bir **referans adı**dır (`kap-gwt-test-user`
  gibi). API tarafı Bean Validation, worker tarafı Zod şeması bu alanın sırt taşıyabilecek biçimleri
  (URL, `user:pass@...`) reddeder (testle doğrulandı).
- Gerçek sırlar şirket sır deposunda (Vault, CyberArk vb.) tutulur; worker bunları yalnızca
  **çalıştırma anında** API üzerinden güvenli bir kanaldan çözer (Faz 2 uygulaması).
- İlk yönetici hesabı ortam değişkenlerinden tohumlanır; varsayılan parola yalnızca yerel makine
  içindir ve log'ta uyarıyla bildirilir. Şirket ortamına taşımadan önce mutlaka değiştirin.

## Ağ ve Erişim Sınırları

- **Etki alanı allowlist:** Her ortam için `allowed_domains` listesi zorunludur; worker (Faz 2)
  yalnızca bu alan adlarına gider.
- **Yasaklı eylemler:** Ortam varsayılanı `submit, publish, delete, approve, sign, send`.
  Keşif sırasında bu iş eylemleri asla gerçekleştirilemez.
- **SSRF:** Tarayıcı çıkışları yalnızca yapılandırılmış `base_url` + allowlist ile sınırlanır (Faz 2'de
  worker tarafında zorlanır; API zaten dış istek yapmaz — worker sağlık kontrolü dışında).
- **Tarayıcı izolasyonu:** GWT ve React için ayrı, depo-temizlenmiş tarayıcı context'leri (Faz 2).

## AI Güvenliği (Faz 4 hazırlıkları)

- `packages/test-schemas` içinde **kapalı aksiyon sözlüğü** (`SAFE_ACTIONS`): shell, keyif JS çalıştırma,
  yıkıcı iş eylemleri (`submit`, `approve`, `delete`, `sign`, `send`...) şema seviyesinde reddedilir
  (14 testle sabitlendi). AI çıktısı ancak bu şemayı geçerse yürütülebilir hale gelir.
- Hedef sitenin içeriği **güvensiz girdi** olarak ele alınır; DOM içindeki talimatlar ("prompt
  injection") veri olarak işlenir, aksiyona dönüştürülmez.
- AI'ya asla gönderilmeyecekler: kimlik bilgileri, cookie'ler, token'lar, imza sırları, ham
  gizli belgeler.
- AI sonuçları **teşvik edici**dir; pass/fail kararı yalnızca deterministik karşılaştırma motorundan gelir.

## Denetim İzi

`audit_event` tablosu append-only'dir: giriş başarısı/başarısızlığı (IP ile), proje oluşturma,
çalıştırma başlatma, worker tarafından reddedilme gibi olaylar kaydedilir. Denetim yazma hatası
iş akışını asla engellemez ama log'lanır.

## Bilininen Sınırlar (şeffaflık)

| Konu | Durum |
| --- | --- |
| Rate limiting | Faz 8 (şirket dağıtımından önce zorunlu) |
| Oturum sabitleme koruması | Spring Security varsayılanı aktif; sır rotasyonu yapılandırılacak |
| Kanıt dosyaları MinIO'da | Bucket oluşturuldu; imzalı/ süreli erişim Faz 2'de |
| İmza/şifreleme testleri | Faz 6; donanım token gerektiren akışlar "manuel doğrulama gerekir" olarak işaretlenecek |
| HTTPS/TLS sonlandırma | Kurumsal dağıtımda ters proxy (şirket standardı) ile |

## Dağıtımdan Önce Kontrol Listesi

1. `ARS_SEED_ADMIN_PASSWORD` güçlü bir değerle ayarlandı mı?
2. `POSTGRES_PASSWORD` ve `MINIO_ROOT_PASSWORD` değiştirildi mi?
3. API ve worker yalnızca iç ağdan erişilebilir mi (reverse proxy arkasında)?
4. Hedef test ortamı izole mi (gerçek iş kayıtları üzerinde mutasyon senaryosu yok)?
5. `docker-compose*.yml` içindeki imaj etiketleri sabitlendi ve iç registry'den mi çekiliyor?
6. Denetim kayıtlarının düzenli arşivlemesi tanımlı mı?
