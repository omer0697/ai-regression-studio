package com.ars.api.service;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.ars.api.config.AppProperties;
import com.ars.api.domain.entity.TestScenario;
import com.ars.api.domain.repository.AiAnalysisRepository;
import com.ars.api.domain.repository.DependencyObservationRepository;
import com.ars.api.domain.repository.DiscoveredElementRepository;
import com.ars.api.domain.repository.TestExecutionRepository;
import com.ars.api.domain.repository.TestScenarioRepository;
import com.ars.api.web.ApiException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiPlanServiceTest {

    @Mock
    private AiClient aiClient;

    @Mock
    private AppProperties properties;

    @Mock
    private AiAnalysisRepository aiAnalysisRepository;

    @Mock
    private TestScenarioRepository scenarioRepository;

    @Mock
    private DiscoveredElementRepository elementRepository;

    @Mock
    private DependencyObservationRepository observationRepository;

    @Mock
    private TestExecutionRepository executionRepository;

    @Mock
    private AuditService audit;

    private AiPlanService service;

    // The parser is a pure stateless validator — use the real implementation.
    private final ScenarioPlanParser parser = new ScenarioPlanParser();

    @BeforeEach
    void setUp() {
        service = new AiPlanService(
                aiClient,
                properties,
                aiAnalysisRepository,
                scenarioRepository,
                elementRepository,
                observationRepository,
                executionRepository,
                parser,
                audit);
    }

    private static final String AI_RESPONSE = """
            ```json
            {
              "scenarioName": "Deger alani etkinlesme",
              "screen": "KPY68",
              "steps": [
                { "action": "selectOption", "target": "e3", "value": "DIGER" },
                { "action": "assertEnabled", "target": "e4" }
              ]
            }
            ```
            """;

    @Test
    void proposePlan_aiNotConfigured_refusesHonestly() {
        when(aiClient.enabled()).thenReturn(false);

        assertThatThrownBy(() -> service.proposePlan(1L, 1L, "KPY68'i test et", "tester"))
                .isInstanceOf(ApiException.class)
                .hasFieldOrPropertyWithValue("code", "AI_NOT_CONFIGURED");

        verify(scenarioRepository, org.mockito.Mockito.never()).save(any(TestScenario.class));
    }

    @Test
    void proposePlan_noDiscoveryData_refusesHonestly() {
        when(aiClient.enabled()).thenReturn(true);
        when(executionRepository.findTop100ByOrderByCreatedAtDesc()).thenReturn(List.of());

        assertThatThrownBy(() -> service.proposePlan(1L, 1L, "KPY68'i test et", "tester"))
                .isInstanceOf(ApiException.class)
                .hasFieldOrPropertyWithValue("code", "NO_DISCOVERY_DATA");
    }

    @Test
    void proposePlan_validAiResponse_storesProposedScenarioForApproval() {
        when(aiClient.enabled()).thenReturn(true);
        var execution = new com.ars.api.domain.entity.TestExecution(1L, 1L,
                com.ars.api.domain.enums.ExecutionMode.DISCOVERY, null);
        setField(execution, "id", 4L);
        when(executionRepository.findTop100ByOrderByCreatedAtDesc()).thenReturn(List.of(execution));
        when(elementRepository.findByExecutionIdOrderByElementRefAsc(4L)).thenReturn(List.of());
        when(observationRepository.findByExecutionIdOrderByIdAsc(4L)).thenReturn(List.of());
        when(properties.ai()).thenReturn(new AppProperties.Ai("http://ai", "deepseek-x", "k", 60, 512));
        when(aiAnalysisRepository.save(any())).thenAnswer(invocation -> {
            var analysis = (com.ars.api.domain.entity.AiAnalysis) invocation.getArgument(0);
            setField(analysis, "id", 1L);
            return analysis;
        });
        try {
            when(aiClient.complete(org.mockito.ArgumentMatchers.anyString(),
                    org.mockito.ArgumentMatchers.anyString())).thenReturn(AI_RESPONSE);
        } catch (AiClient.AiUnavailableException e) {
            throw new IllegalStateException(e);
        }
        when(scenarioRepository.save(any(TestScenario.class)))
                .thenAnswer(invocation -> {
                    var scenario = (TestScenario) invocation.getArgument(0);
                    setField(scenario, "id", 7L);
                    return scenario;
                });

        TestScenario scenario = service.proposePlan(1L, 1L,
                "DIGER secildiginde deger alani etkinlesmeli mi kontrol et", "tester");

        assertThat(scenario.getSource()).isEqualTo("AI");
        assertThat(scenario.getStatus()).isEqualTo("PROPOSED");
        assertThat(scenario.getPlan())
                .containsEntry("screen", "KPY68")
                .containsKey("steps");
        @SuppressWarnings("unchecked")
        var steps = (List<Map<String, Object>>) scenario.getPlan().get("steps");
        assertThat(steps).hasSize(2);
        verify(audit).record(org.mockito.ArgumentMatchers.eq("tester"),
                org.mockito.ArgumentMatchers.eq("SCENARIO_PROPOSED"), any(), any(), any());
    }

    private static void setField(Object target, String name, Object value) {
        try {
            var field = target.getClass().getDeclaredField(name);
            field.setAccessible(true);
            field.set(target, value);
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }
}
