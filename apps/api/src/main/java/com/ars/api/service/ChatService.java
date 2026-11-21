package com.ars.api.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ars.api.domain.entity.ChatMessage;
import com.ars.api.domain.entity.RequirementDefinition;
import com.ars.api.domain.repository.BugFindingRepository;
import com.ars.api.domain.repository.ChatMessageRepository;
import com.ars.api.domain.repository.RequirementDefinitionRepository;
import com.ars.api.web.ApiException;

/**
 * Project chat (V8 user-driven extension).
 *
 * <p>With AI configured, responses are generated from real project context
 * (recent executions, findings, requirements). Without AI the chat stays
 * fully usable through a deterministic Turkish command interpreter that
 * summarizes the same real data — never fabricated.</p>
 */
@Service
public class ChatService {

    private final ChatMessageRepository chatRepository;
    private final BugFindingRepository bugRepository;
    private final RequirementDefinitionRepository requirementRepository;
    private final com.ars.api.domain.repository.TestExecutionRepository executionRepository;
    private final AiClient aiClient;
    private final com.ars.api.config.AppProperties properties;

    public ChatService(
            ChatMessageRepository chatRepository,
            BugFindingRepository bugRepository,
            RequirementDefinitionRepository requirementRepository,
            com.ars.api.domain.repository.TestExecutionRepository executionRepository,
            AiClient aiClient,
            com.ars.api.config.AppProperties properties) {
        this.chatRepository = chatRepository;
        this.bugRepository = bugRepository;
        this.requirementRepository = requirementRepository;
        this.executionRepository = executionRepository;
        this.aiClient = aiClient;
        this.properties = properties;
    }

    public record ChatRequest(String message) {
    }

    @Transactional
    public ChatMessage send(Long projectId, String message) {
        if (message == null || message.isBlank()) {
            throw ApiException.badRequest("EMPTY_MESSAGE", "Message cannot be empty.");
        }
        if (message.length() > 4000) {
            throw ApiException.badRequest("MESSAGE_TOO_LONG",
                    "Message must be at most 4000 characters.");
        }

        chatRepository.save(new ChatMessage(projectId, "USER", message.strip()));

        String reply;
        if (aiClient.enabled()) {
            reply = aiReply(projectId, message);
        } else {
            reply = deterministicReply(projectId, message);
        }

        return chatRepository.save(new ChatMessage(projectId, "ASSISTANT", reply));
    }

    @Transactional(readOnly = true)
    public List<ChatMessage> history(Long projectId) {
        return chatRepository.findTop100ByProjectIdOrderByCreatedAtAscIdAsc(projectId);
    }

    // ------------------------------------------------------------------
    // Deterministic Turkish command interpreter (works without AI)
    // ------------------------------------------------------------------

    private String deterministicReply(Long projectId, String message) {
        String normalized = message.toLowerCase(java.util.Locale.ROOT)
                .replace('ı', 'i').replace('ğ', 'g').replace('ş', 's')
                .replace('ü', 'u').replace('ö', 'o').replace('ç', 'c');

        var executions = executionRepository.findTop50ByProjectIdOrderByCreatedAtDesc(projectId);
        var findings = bugRepository.findByProjectIdOrderByCreatedAtDesc(projectId);
        var requirements = requirementRepository.findByProjectIdOrderByIdAsc(projectId);

        if (containsAny(normalized, "bulgu", "hata", "bug", "fark")) {
            if (findings.isEmpty()) {
                return "Bu projede henüz kayıtlı bulgu yok. Bir Karşılaştırma çalıştırması "
                        + "başlatırsanız davranış farkları burada listelenir.";
            }
            StringBuilder builder = new StringBuilder("Kayıtlı bulgular (%d):\n".formatted(findings.size()));
            findings.stream().limit(10).forEach(finding -> builder
                    .append("- %s [%s/%s] %s\n".formatted(
                            finding.getBugCode(), finding.getSeverity(),
                            finding.getCategory(), finding.getTitle())));
            return builder.toString();
        }

        if (containsAny(normalized, "gereksinim", "confluence", "istek", "talep")) {
            if (requirements.isEmpty()) {
                return "Bu ekrana henüz gereksinim aktarılmadı. Confluence bağlıysa Proje "
                        + "detayındaki 'Gereksinimleri Aktar' düğmesini kullanın; bağlı "
                        + "değilse elle ekleyebilirsiniz.";
            }
            long verified = requirements.stream()
                    .filter(req -> "VERIFIED".equals(req.getStatus())).count();
            long review = requirements.stream()
                    .filter(req -> "MANUAL_REVIEW".equals(req.getStatus())).count();
            return "Gereksinim kapsamı: %d kayıt — %d doğrulandı, %d insan incelemesi bekliyor.\n"
                    .formatted(requirements.size(), verified, review)
                    + "Detaylar Proje → Ekranlar → Gereksinimler sekmesinde.";
        }

        if (containsAny(normalized, "kombinasyon", "tum alan", "doldur")) {
            return "Kombinasyon modu, keşfedilen tüm alanların değer kombinasyonlarını "
                    + "sınırlı bir bütçe içinde her iki uygulamada dener. Başlatmak için Proje "
                    + "detayı → Çalıştırmalar → mod olarak 'Kombinasyon' seçin. Bütçe "
                    + "ortam ayarlarından (keşif etkileşim limiti) ayarlanır.";
        }

        if (containsAny(normalized, "pdf", "belge")) {
            return "PDF karşılaştırması için PDF Karşılaştırma sayfasını kullanın: iki belge "
                    + "yükleyin ve beklenen alanları JSON olarak tanımlayın. Yapısal farklar "
                    + "(eksik alan, yanlış değer, sayfa sayısı) kanıtla raporlanır.";
        }

        if (containsAny(normalized, "test", "karsilastir", "calistir", "çalistir")) {
            if (executions.isEmpty()) {
                return "Henüz çalıştırma yok. Proje detayındaki Çalıştır sekmesinden "
                        + "Keşif (GWT) ile başlayın, ardından Karşılaştırma (GWT ↔ React) modunu "
                        + "kullanın. Eski ve yeni uygulama URL'leri Ortamlar sekmesinde tanımlı.";
            }
            var latest = executions.get(0);
            return "Son çalıştırma #%d: %s modu, durum %s (adım %d/%d, %d bulgu). "
                    .formatted(latest.getId(), latest.getMode(), latest.getStatus(),
                            latest.getPassedSteps(), latest.getTotalSteps(), findings.size())
                    + "Yeni bir çalıştırma için Proje detay → Çalıştır.";
        }

        if (containsAny(normalized, "yardim", "help", "nasil")) {
            return """
                    Yapabileceklerim:
                    • "bulguları göster" — kayıtlı hata bulguları
                    • "gereksinim durumu" — Confluence kapsamı
                    • "kombinasyon testi" — tüm alan kombinasyonları
                    • "pdf karşılaştır" — belge farkları
                    • "test et / karşılaştır" — çalıştırma durumu ve başlatma
                    AI sağlayıcısı yapılandırılırsa (AI Ayarları) doğal dilde serbest
                    sorular da yanıtlanır; yapılandırılana kadar bu komutlar gerçek
                    verilerle yanıt verir.""";
        }

        // Default: honest status summary.
        long completed = executions.stream()
                .filter(execution -> execution.getStatus().name().equals("COMPLETED")).count();
        return "Proje durumu: %d çalıştırma (%d tamamlandı), %d bulgu, %d gereksinim. "
                .formatted(executions.size(), completed, findings.size(), requirements.size())
                + "Komut ipuçları için 'yardım' yazın. AI yapılandırılmadığı için "
                + "yanıtlar deterministik komut yorumlayıcısından geliyor.";
    }

    // ------------------------------------------------------------------
    // AI-generated reply (only when the provider is configured)
    // ------------------------------------------------------------------

    private String aiReply(Long projectId, String message) {
        var executions = executionRepository.findTop50ByProjectIdOrderByCreatedAtDesc(projectId);
        var findings = bugRepository.findByProjectIdOrderByCreatedAtDesc(projectId);
        var requirements = requirementRepository.findByProjectIdOrderByIdAsc(projectId);

        Map<String, Object> context = new LinkedHashMap<>();
        context.put("executions", executions.stream().limit(10).map(execution ->
                Map.of("id", execution.getId(), "mode", execution.getMode().name(),
                        "status", execution.getStatus().name(),
                        "steps", execution.getTotalSteps())).toList());
        context.put("findings", findings.stream().limit(20).map(finding ->
                Map.of("code", finding.getBugCode(), "severity", finding.getSeverity(),
                        "title", finding.getTitle())).toList());
        context.put("requirements", requirements.stream().limit(20).map(req ->
                Map.of("title", req.getTitle(), "status", req.getStatus())).toList());

        try {
            String systemPrompt = """
                    Sen AI Regression Studio'nun asistanısın. Kullanıcı Türkçe konuşur.
                    SADECE verilen gerçek proje verilerine dayanarak yanıt ver; veri yoksa
                    bunu açıkça söyle. Test sonucu uydurma; pass/fail kararı yalnızca
                    deterministik motor verir. Kısa ve net yanıtla.
                    """;
            String userPrompt = "PROJE VERİSİ:\n%s\n\nKULLANICI: %s"
                    .formatted(safeJson(context), message);
            return aiClient.complete(systemPrompt, userPrompt);
        } catch (AiClient.AiUnavailableException exception) {
            return "AI sağlayıcısına şu anda ulaşılamıyor (%s). Deterministik yanıt: %s"
                    .formatted(exception.getMessage(), deterministicReply(projectId, message));
        }
    }

    private String safeJson(Map<String, Object> context) {
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(context);
        } catch (Exception exception) {
            return context.toString();
        }
    }

    private static boolean containsAny(String text, String... needles) {
        for (String needle : needles) {
            if (text.contains(needle)) {
                return true;
            }
        }
        return false;
    }
}
