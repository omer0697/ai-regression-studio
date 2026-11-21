package com.ars.api.service;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.ars.api.domain.entity.TestScenario;
import com.ars.api.domain.repository.TestScenarioRepository;
import com.ars.api.web.ApiException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/** The approval gate: AI proposals never become executable without a human. */
@ExtendWith(MockitoExtension.class)
class ScenarioServiceTest {

    @Mock
    private TestScenarioRepository repository;

    @Mock
    private AuditService audit;

    @InjectMocks
    private ScenarioService service;

    private TestScenario proposed() {
        return new TestScenario(1L, 1L, "Plan", "desc", "AI", Map.of("steps", "[]"), "tester");
    }

    @Test
    void approve_proposedScenario_setsApprover() {
        TestScenario scenario = proposed();
        when(repository.findById(7L)).thenReturn(java.util.Optional.of(scenario));
        when(repository.save(any(TestScenario.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        TestScenario approved = service.approve(7L, "admin");

        assertThat(approved.getStatus()).isEqualTo("APPROVED");
        assertThat(approved.getApprovedBy()).isEqualTo("admin");
    }

    @Test
    void approve_alreadyDecided_refuses() {
        TestScenario scenario = proposed();
        scenario.setStatus("APPROVED");
        when(repository.findById(7L)).thenReturn(java.util.Optional.of(scenario));

        assertThatThrownBy(() -> service.approve(7L, "admin"))
                .isInstanceOf(ApiException.class)
                .hasFieldOrPropertyWithValue("code", "SCENARIO_NOT_PROPOSED");
    }

    @Test
    void reject_proposedScenario_recordsReason() {
        TestScenario scenario = proposed();
        when(repository.findById(7L)).thenReturn(java.util.Optional.of(scenario));
        when(repository.save(any(TestScenario.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        TestScenario rejected = service.reject(7L, "admin", "hedef ref'ler gecersiz");

        assertThat(rejected.getStatus()).isEqualTo("REJECTED");
    }
}
