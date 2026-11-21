package com.ars.api.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.ars.api.config.AppProperties;
import com.ars.api.domain.entity.AiAnalysis;
import com.ars.api.domain.repository.AiAnalysisRepository;
import com.ars.api.domain.repository.DependencyObservationRepository;
import com.ars.api.domain.repository.DiscoveredElementRepository;
import com.ars.api.domain.repository.ExecutionEventRepository;
import com.ars.api.domain.repository.TestExecutionRepository;
import com.ars.api.web.ApiException;

/**
 * AI-assisted failure analysis. Produces clearly-marked HYPOTHESES in
 * Turkish — never a pass/fail verdict; deterministic evidence stays the only
 * source of truth.
 */
@Service
public class AiAnalysisService {

    private static final Logger log = LoggerFactory.getLogger(AiAnalysisService.class);

    private final AiClient aiClient;
    private final AppProperties properties;
    private final AiAnalysisRepository aiAnalysisRepository;
    private final TestExecutionRepository executionRepository;
    private final DiscoveredElementRepository elementRepository;
    private final DependencyObservationRepository observationRepository;
    private final ExecutionEventRepository eventRepository;
    private final ExecutionEventService eventService;
    private final AuditService audit;

    public AiAnalysisService(
            AiClient aiClient,
            AppProperties properties,
            AiAnalysisRepository aiAnalysisRepository,
            TestExecutionRepository executionRepository,
            DiscoveredElementRepository elementRepository,
            DependencyObservationRepository observationRepository,
            ExecutionEventRepository eventRepository,
            ExecutionEventService eventService,
            AuditService audit) {
        this.aiClient = aiClient;
        this.properties = properties;
        this.aiAnalysisRepository = aiAnalysisRepository;
        this.executionRepository = executionRepository;
        this.elementRepository = elementRepository;
        this.observationRepository = observationRepository;
        this.eventRepository = eventRepository;
        this.eventService = eventService;
        this.audit = audit;
    }

    public AiAnalysis analyzeExecution(Long executionId, String actor) {
        var execution = executionRepository.findById(executionId)
                .orElseThrow(() -> ApiException.notFound("EXECUTION_NOT_FOUND",
                        "Execution %d does not exist.".formatted(executionId)));

        if (!aiClient.enabled()) {
            AiAnalysis analysis = aiAnalysisRepository.save(new AiAnalysis(
                    executionId, execution.getProjectId(), "FAILURE_ANALYSIS", null,
                    "AI_NOT_CONFIGURED", "AI sağlayıcısı yapılandırılmadı.", null));
            throw ApiException.conflict("AI_NOT_CONFIGURED",
                    "The AI provider is not configured. Set AI_BASE_URL, AI_MODEL and AI_API_KEY.");
        }

        String elements = elementRepository
                .findByExecutionIdOrderByElementRefAsc(executionId)
                .stream()
                .map(element -> "ref=%s tip=%s etiket=%s deger=%s etkin=%s gorunur=%s".formatted(
                        element.getElementRef(), element.getElementType(),
                        element.getLabel(), element.getCurrentValue(),
                        element.isEnabled(), element.isVisible()))
                .reduce("", (left, right) -> left + right + "\n");

        String observations = observationRepository
                .findByExecutionIdOrderByIdAsc(executionId)
                .stream()
                .map(observation -> "%s(%s) -> %s %s: %s -> %s".formatted(
                        observation.getSourceRef(), observation.getInteraction(),
                        observation.getAffectedRef(), observation.getAttribute(),
                        observation.getBeforeValue(), observation.getAfterValue()))
                .reduce("", (left, right) -> left + right + "\n");

        String events = eventRepository.findByExecutionIdOrderBySeqAsc(executionId)
                .stream()
                .map(event -> "[%s] %s".formatted(event.getType(), event.getMessage()))
                .reduce("", (left, right) -> left + right + "\n");

        String systemPrompt = """
                Sen bir regresyon test analistisin. Verilen çalıştırma kaydını
                (olaylar, keşfedilen elemanlar, bağımlılık gözlemleri) incele ve
                Türkçe, kısa ve net bir KÖK-NEDEN HİPOTEZİ üret.

                KURALLAR:
                1. Bu bir HİPOTEZ'dir — kesin teşhis değil. Gözlenen verilerle
                   çelişen iddiada bulunma; eksik veri varsa bunu açıkça söyle.
                2. Pass/fail kararı vermezsin; yalnızca olası nedenler ve
                   önerilen sonraki doğrulama adımlarını yazarsın.
                3. Yanıt SADECE şu JSON olur (kod bloğu yok):
                   {"hypothesis":"...","suggestedNextChecks":["...","..."]}
                """;

        String userPrompt = """
                ÇALIŞTIRMA DURUMU: %s (hata kodu: %s, mesaj: %s)

                OLAY AKIŞI:
                %s

                ELEMANLAR:
                %s

                GÖZLEMLER:
                %s
                """.formatted(
                execution.getStatus(),
                execution.getErrorCode() == null ? "-" : execution.getErrorCode(),
                execution.getStatusMessage() == null ? "-" : execution.getStatusMessage(),
                events, elements, observations);

        String content;
        try {
            content = aiClient.complete(systemPrompt, userPrompt);
        } catch (AiClient.AiUnavailableException exception) {
            aiAnalysisRepository.save(new AiAnalysis(
                    executionId, execution.getProjectId(), "FAILURE_ANALYSIS",
                    properties.ai().model(), "AI_ERROR", exception.getMessage(), null));
            throw ApiException.internalError("AI_ERROR",
                    "AI provider call failed: %s".formatted(exception.getMessage()));
        }

        Map<String, Object> output;
        try {
            var root = new com.fasterxml.jackson.databind.ObjectMapper()
                    .readTree(ScenarioPlanParser.extractJson(content));
            String hypothesis = root.path("hypothesis").asText("");
            if (hypothesis.isBlank()) {
                throw new IllegalArgumentException("missing hypothesis");
            }
            List<String> checks = new java.util.ArrayList<>();
            root.path("suggestedNextChecks").forEach(node -> checks.add(node.asText()));
            Map<String, Object> parsed = new LinkedHashMap<>();
            parsed.put("hypothesis", hypothesis);
            parsed.put("suggestedNextChecks", checks);
            output = parsed;
        } catch (Exception exception) {
            AiAnalysis analysis = aiAnalysisRepository.save(new AiAnalysis(
                    executionId, execution.getProjectId(), "FAILURE_ANALYSIS",
                    properties.ai().model(), "AI_INVALID_RESPONSE",
                    "AI yanıtı şemaya uymuyor: %s".formatted(exception.getMessage()), null));
            throw ApiException.badRequest("AI_INVALID_RESPONSE",
                    "The AI response could not be parsed.");
        }

        AiAnalysis analysis = aiAnalysisRepository.save(new AiAnalysis(
                executionId, execution.getProjectId(), "FAILURE_ANALYSIS",
                properties.ai().model(), "OK",
                String.valueOf(output.get("hypothesis")), output));

        eventService.append(executionId,
                com.ars.api.domain.enums.ExecutionEventType.INFO,
                "AI kök-neden hipotezi üretildi (hipotezdir; gözlemle karıştırılmamalıdır).");
        audit.record(actor, "AI_FAILURE_ANALYSIS", "TEST_EXECUTION",
                String.valueOf(executionId), null);

        return analysis;
    }
}
