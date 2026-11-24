package com.ars.api.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.ars.api.config.AppProperties;
import com.ars.api.domain.entity.AiAnalysis;
import com.ars.api.domain.entity.DependencyObservation;
import com.ars.api.domain.entity.DiscoveredElement;
import com.ars.api.domain.entity.TestScenario;
import com.ars.api.domain.repository.AiAnalysisRepository;
import com.ars.api.domain.repository.DependencyObservationRepository;
import com.ars.api.domain.repository.DiscoveredElementRepository;
import com.ars.api.domain.repository.TestExecutionRepository;
import com.ars.api.domain.repository.TestScenarioRepository;
import com.ars.api.service.ScenarioPlanParser.ParsedPlan;
import com.ars.api.web.ApiException;

/**
 * Turns a natural-language (Turkish or English) test request into a validated,
 * human-approved scenario plan using the configured AI provider.
 *
 * <p>Input to the model is strictly sanitized element/observation metadata from
 * the latest discovery run — labels, types, values, options. No credentials,
 * cookies or business records are ever included in prompts.</p>
 */
@Service
public class AiPlanService {

    private static final Logger log = LoggerFactory.getLogger(AiPlanService.class);

    private final AiClient aiClient;
    private final AppProperties properties;
    private final AiAnalysisRepository aiAnalysisRepository;
    private final TestScenarioRepository scenarioRepository;
    private final DiscoveredElementRepository elementRepository;
    private final DependencyObservationRepository observationRepository;
    private final TestExecutionRepository executionRepository;
    private final ScenarioPlanParser parser;
    private final AuditService audit;

    public AiPlanService(
            AiClient aiClient,
            AppProperties properties,
            AiAnalysisRepository aiAnalysisRepository,
            TestScenarioRepository scenarioRepository,
            DiscoveredElementRepository elementRepository,
            DependencyObservationRepository observationRepository,
            TestExecutionRepository executionRepository,
            ScenarioPlanParser parser,
            AuditService audit) {
        this.aiClient = aiClient;
        this.properties = properties;
        this.aiAnalysisRepository = aiAnalysisRepository;
        this.scenarioRepository = scenarioRepository;
        this.elementRepository = elementRepository;
        this.observationRepository = observationRepository;
        this.executionRepository = executionRepository;
        this.parser = parser;
        this.audit = audit;
    }

    public TestScenario proposePlan(Long projectId, Long screenId, String command, String actor) {
        if (!aiClient.enabled()) {
            throw ApiException.conflict("AI_NOT_CONFIGURED",
                    "The AI provider is not configured. Set AI_BASE_URL and AI_MODEL "
                            + "(AI_API_KEY is optional for company-hosted local LLMs) "
                            + "to enable AI-assisted planning.");
        }

        var execution = executionRepository
                .findTop100ByOrderByCreatedAtDesc()
                .stream()
                .filter(candidate -> candidate.getProjectId().equals(projectId)
                        && candidate.getScreenId().equals(screenId))
                .findFirst()
                .orElseThrow(() -> ApiException.conflict("NO_DISCOVERY_DATA",
                        "Run a discovery execution on this screen first; AI planning uses "
                                + "the discovered element metadata as context."));

        String context = buildSanitizedContext(execution.getId());

        String systemPrompt = """
                Sen bir kıdemli QA otomasyon uzmanısın. Kullanıcının isteğine göre,
                verilen ekran elemanı metadata'sını kullanarak bir fonksiyonel test
                senaryosu planı üret.

                KURALLAR — MUTLAKA UY:
                1. SADECE şu aksiyonlar kullanılabilir: navigate, click, fill,
                   selectOption, setCheckbox, chooseRadio, openModal, closeModal,
                   assertVisible, assertHidden, assertEnabled, assertDisabled,
                   assertValue, assertText, wait, downloadPdf.
                2. 'target' değerleri verilen elemanların 'ref' alanlarından
                   (e1, e2, ...) seçilmelidir; uydurma hedef üretmek yasaktır.
                3. İş kaydını değiştiren gerçek eylemler (gönder, onayla, sil,
                   imzala, yayınla) plana ASLA konmaz; yalnızca verilen güvenli
                   aksiyon sözlüğü kullanılır.
                4. Yanıt SADECE bir JSON nesnesi olur; açıklama, markdown veya
                   kod bloğu ekleme. Şema:
                   {"scenarioName":"...","screen":"...","description":"...",
                    "steps":[{"action":"selectOption","target":"e3","value":"DIGER"},
                             {"action":"assertEnabled","target":"e4"}]}
                """;

        String userPrompt = """
                EKAN ELEMAN METADATA (keşiften):
                %s

                BAĞIMLILIK GÖZLEMLERİ (güvenli etkileşim keşfinden):
                %s

                KULLANICI İSTEĞİ:
                %s

                Bu isteğe uygun, doğrulanabilir adımlardan oluşan senaryo planını
                (sadece JSON) üret.
                """.formatted(context, buildObservationSummary(execution.getId()), command);

        String content;
        try {
            content = aiClient.complete(systemPrompt, userPrompt);
        } catch (AiClient.AiUnavailableException exception) {
            AiAnalysis analysis = aiAnalysisRepository.save(new AiAnalysis(
                    execution.getId(), projectId, "PLAN", properties.ai().model(),
                    "AI_ERROR", exception.getMessage(), null));
            log.warn("AI plan call failed: {}", exception.getMessage());
            throw ApiException.internalError("AI_ERROR",
                    "AI provider call failed: %s".formatted(exception.getMessage()));
        }

        ParsedPlan plan;
        try {
            plan = parser.parse(content);
        } catch (IllegalArgumentException exception) {
            // Policy violation — recorded honestly, never silently trimmed.
            AiAnalysis analysis = aiAnalysisRepository.save(new AiAnalysis(
                    execution.getId(), projectId, "PLAN", properties.ai().model(),
                    "AI_INVALID_RESPONSE", exception.getMessage(), null));
            throw ApiException.badRequest("AI_INVALID_PLAN",
                    "The AI response failed policy validation: %s".formatted(exception.getMessage()));
        }

        Map<String, Object> planJson = new LinkedHashMap<>();
        planJson.put("scenarioName", plan.scenarioName());
        planJson.put("screen", plan.screen());
        if (plan.description() != null) {
            planJson.put("description", plan.description());
        }
        planJson.put("steps", plan.steps());

        AiAnalysis analysis = aiAnalysisRepository.save(new AiAnalysis(
                execution.getId(), projectId, "PLAN", properties.ai().model(),
                "OK", "Plan proposed from a natural-language command.", planJson));

        TestScenario scenario = scenarioRepository.save(new TestScenario(
                projectId, screenId, plan.scenarioName(), plan.description(),
                "AI", planJson, actor));
        scenario.setAiAnalysisId(analysis.getId());
        scenario = scenarioRepository.save(scenario);

        audit.record(actor, "SCENARIO_PROPOSED", "TEST_SCENARIO",
                String.valueOf(scenario.getId()),
                Map.of("source", "AI", "steps", plan.steps().size()));

        return scenario;
    }

    /** Sanitized discovery metadata: labels, types, values, options — no DOM paths. */
    private String buildSanitizedContext(Long executionId) {
        List<DiscoveredElement> elements = elementRepository
                .findByExecutionIdOrderByElementRefAsc(executionId);
        StringBuilder builder = new StringBuilder();
        for (DiscoveredElement element : elements) {
            builder.append("- ref=%s | tip=%s | etiket=%s | deger=%s | etkin=%s | gorunur=%s"
                    .formatted(
                            element.getElementRef(),
                            element.getElementType(),
                            element.getLabel() == null ? "-" : element.getLabel(),
                            element.getCurrentValue() == null ? "-" : element.getCurrentValue(),
                            element.isEnabled(),
                            element.isVisible()));
            if (element.getOptions() != null && !element.getOptions().isEmpty()) {
                builder.append(" | secenekler=%s".formatted(String.join("/", element.getOptions())));
            }
            if (Boolean.TRUE.equals(element.getRequired())) {
                builder.append(" | zorunlu=true");
            }
            builder.append("\n");
        }
        return builder.toString();
    }

    private String buildObservationSummary(Long executionId) {
        List<DependencyObservation> observations = observationRepository
                .findByExecutionIdOrderByIdAsc(executionId);
        if (observations.isEmpty()) {
            return "(yok)";
        }
        StringBuilder builder = new StringBuilder();
        for (DependencyObservation observation : observations) {
            builder.append("- %s '%s' uygulaninca %s '%s' %s: %s -> %s (ekran geri donduruldu)\n"
                    .formatted(
                            observation.getSourceRef(),
                            observation.getInteraction(),
                            observation.getAffectedRef(),
                            observation.getAffectedLabel() == null ? "-" : observation.getAffectedLabel(),
                            observation.getAttribute(),
                            observation.getBeforeValue(),
                            observation.getAfterValue()));
        }
        return builder.toString();
    }
}
