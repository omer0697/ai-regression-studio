package com.ars.api.service;

import java.util.Map;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The plan parser is the AI policy boundary: anything outside the closed
 * action vocabulary — shell commands, JS execution, destructive business
 * actions, prompt-injection extras — must be rejected before storage.
 */
class ScenarioPlanParserTest {

    private final ScenarioPlanParser parser = new ScenarioPlanParser();

    private static final String VALID_PLAN = """
            {
              "scenarioName": "Dependent field activation",
              "screen": "KPY68",
              "description": "DIGER secildiginde deger alani etkinlesmeli",
              "steps": [
                { "action": "selectOption", "target": "e3", "value": "DIGER" },
                { "action": "assertEnabled", "target": "e4" }
              ]
            }
            """;

    @Test
    void parse_acceptsValidPlan() {
        var plan = parser.parse(VALID_PLAN);
        assertThat(plan.scenarioName()).isEqualTo("Dependent field activation");
        assertThat(plan.screen()).isEqualTo("KPY68");
        assertThat(plan.steps()).hasSize(2);
        assertThat(plan.steps().get(0))
                .containsEntry("action", "selectOption")
                .containsEntry("target", "e3")
                .containsEntry("value", "DIGER");
    }

    @Test
    void parse_acceptsCodeFencedJson() {
        var plan = parser.parse("```json\n" + VALID_PLAN + "\n```");
        assertThat(plan.steps()).hasSize(2);
    }

    @Test
    void parse_rejectsUnknownActions() {
        assertThatThrownBy(() -> parser.parse(VALID_PLAN.replace("selectOption", "deleteRecord")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("not in the allowed vocabulary");
    }

    @Test
    void parse_rejectsDestructiveBusinessActions() {
        for (String action : new String[] { "submit", "approve", "publish", "delete", "sign", "send" }) {
            String content = VALID_PLAN.replace("selectOption", action);
            assertThatThrownBy(() -> parser.parse(content))
                    .as("action '%s' must be rejected", action)
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Test
    void parse_rejectsJavaScriptExecution() {
        String content = VALID_PLAN.replace(
                "{ \"action\": \"assertEnabled\", \"target\": \"e4\" }",
                "{ \"action\": \"evaluateJs\", \"target\": \"page\", \"value\": \"x\" }");
        assertThatThrownBy(() -> parser.parse(content))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void parse_rejectsUnknownTopLevelFields_promptInjectionExtras() {
        String injected = VALID_PLAN.replace(
                "\"scenarioName\": \"Dependent field activation\"",
                "\"shellCommand\": \"rm -rf /\", \"scenarioName\": \"Dependent field activation\"");
        assertThatThrownBy(() -> parser.parse(injected))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unknown field");
    }

    @Test
    void parse_rejectsUnknownStepFields() {
        String content = VALID_PLAN.replace(
                "\"target\": \"e3\", \"value\": \"DIGER\" }",
                "\"target\": \"e3\", \"value\": \"DIGER\", \"waitFor\": \"5s\" }");
        assertThatThrownBy(() -> parser.parse(content))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unknown field");
    }

    @Test
    void parse_rejectsTargetRequiringActionsWithoutTarget() {
        assertThatThrownBy(() -> parser.parse(VALID_PLAN.replace(", \"target\": \"e3\"", "")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("requires a target");
    }

    @Test
    void parse_rejectsValueRequiringActionsWithoutValue() {
        assertThatThrownBy(() -> parser.parse(VALID_PLAN.replace(", \"value\": \"DIGER\"", "")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("requires a value");
    }

    @Test
    void parse_rejectsSelectorLikeTargets() {
        assertThatThrownBy(() -> parser.parse(VALID_PLAN.replace("e3", "../..//script")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("business identifier");
    }

    @Test
    void parse_rejectsEmptyStepsAndNonJson() {
        assertThatThrownBy(() -> parser.parse("{\"scenarioName\":\"x\",\"screen\":\"y\",\"steps\":[]}"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> parser.parse("bu bir json değil"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void parse_rejectsValueOnActionsThatTakeNone() {
        assertThatThrownBy(() -> parser.parse(VALID_PLAN.replace(
                "{ \"action\": \"assertEnabled\", \"target\": \"e4\" }",
                "{ \"action\": \"assertEnabled\", \"target\": \"e4\", \"value\": \"x\" }")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("does not accept a value");
    }

    @Test
    void extractJson_handlesPlainAndFencedContent() {
        assertThat(ScenarioPlanParser.extractJson("  {\"a\":1}  ")).isEqualTo("{\"a\":1}");
        assertThat(ScenarioPlanParser.extractJson("```json\n{\"a\":1}\n```")).isEqualTo("{\"a\":1}");
    }
}
