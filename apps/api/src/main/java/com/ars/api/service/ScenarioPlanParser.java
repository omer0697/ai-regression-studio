package com.ars.api.service;

import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Strict parser/validator for AI-proposed scenario plans.
 *
 * <p>Mirrors {@code packages/test-schemas} (SAFE_ACTIONS). Anything outside
 * this closed vocabulary — shell commands, arbitrary JavaScript, destructive
 * business operations — is rejected before a plan can ever be stored or
 * executed. Unknown JSON fields are refused (no prompt-injection extras).</p>
 */
@Service
public class ScenarioPlanParser {

    /** The only actions a plan may contain. Execution is Phase 5's concern. */
    public static final Set<String> SAFE_ACTIONS = Set.of(
            "navigate", "click", "fill", "selectOption", "setCheckbox", "chooseRadio",
            "openModal", "closeModal", "assertVisible", "assertHidden", "assertEnabled",
            "assertDisabled", "assertValue", "assertText", "wait", "downloadPdf");

    private static final Set<String> ACTIONS_REQUIRING_TARGET = Set.of(
            "click", "fill", "selectOption", "setCheckbox", "chooseRadio", "openModal",
            "closeModal", "assertVisible", "assertHidden", "assertEnabled", "assertDisabled",
            "assertValue", "assertText");

    private static final Set<String> ACTIONS_REQUIRING_VALUE = Set.of(
            "fill", "selectOption", "chooseRadio");

    private static final Set<String> ACTIONS_ALLOWING_VALUE = Set.of(
            "fill", "selectOption", "chooseRadio", "assertValue", "assertText", "wait",
            "navigate");

    private static final Set<String> PLAN_FIELDS = Set.of(
            "scenarioName", "screen", "description", "steps");

    private static final Set<String> STEP_FIELDS = Set.of("action", "target", "value");

    private static final ObjectMapper MAPPER = new ObjectMapper();

    public record ParsedPlan(String scenarioName, String screen, String description,
            java.util.List<Map<String, Object>> steps) {
    }

    /**
     * Parses raw AI text (which may be wrapped in code fences) into a validated
     * plan. Throws {@link IllegalArgumentException} with a readable reason on any
     * policy violation.
     */
    public ParsedPlan parse(String rawContent) {
        String json = extractJson(rawContent);
        JsonNode root;
        try {
            root = MAPPER.readTree(json);
        } catch (Exception exception) {
            throw new IllegalArgumentException("AI response is not valid JSON.");
        }
        if (!root.isObject()) {
            throw new IllegalArgumentException("Plan must be a JSON object.");
        }
        rejectUnknownFields(root, PLAN_FIELDS, "plan");

        String scenarioName = requiredText(root, "scenarioName", 120, 3);
        String screen = requiredText(root, "screen", 64, 2);
        String description = optionalText(root, "description", 1000);

        JsonNode stepsNode = root.get("steps");
        if (stepsNode == null || !stepsNode.isArray() || stepsNode.isEmpty()) {
            throw new IllegalArgumentException("Plan must contain a non-empty 'steps' array.");
        }
        if (stepsNode.size() > 200) {
            throw new IllegalArgumentException("Plan exceeds 200 steps.");
        }

        java.util.List<Map<String, Object>> steps = new java.util.ArrayList<>();
        for (JsonNode stepNode : stepsNode) {
            if (!stepNode.isObject()) {
                throw new IllegalArgumentException("Each step must be an object.");
            }
            rejectUnknownFields(stepNode, STEP_FIELDS, "step");

            String action = requiredText(stepNode, "action", 40, 1);
            if (!SAFE_ACTIONS.contains(action)) {
                throw new IllegalArgumentException(
                        "Action '%s' is not in the allowed vocabulary.".formatted(action));
            }
            String target = optionalText(stepNode, "target", 64);
            if (target != null && !target.matches("[a-z][a-z0-9-]{0,63}")) {
                throw new IllegalArgumentException(
                        "Target '%s' must be a business identifier (lowercase, digits, dashes)."
                                .formatted(target));
            }
            String value = optionalText(stepNode, "value", 500);

            if (ACTIONS_REQUIRING_TARGET.contains(action) && target == null) {
                throw new IllegalArgumentException(
                        "Action '%s' requires a target.".formatted(action));
            }
            if (ACTIONS_REQUIRING_VALUE.contains(action) && value == null) {
                throw new IllegalArgumentException(
                        "Action '%s' requires a value.".formatted(action));
            }
            if (value != null && !ACTIONS_ALLOWING_VALUE.contains(action)) {
                throw new IllegalArgumentException(
                        "Action '%s' does not accept a value.".formatted(action));
            }

            ObjectNode normalized = MAPPER.createObjectNode();
            normalized.put("action", action);
            if (target != null) {
                normalized.put("target", target);
            }
            if (value != null) {
                normalized.put("value", value);
            }
            steps.add(MAPPER.convertValue(normalized, Map.class));
        }

        return new ParsedPlan(scenarioName, screen, description, steps);
    }

    /** Strips markdown code fences the model may add around the JSON. */
    static String extractJson(String raw) {
        String text = raw.trim();
        if (text.startsWith("```")) {
            int firstBreak = text.indexOf('\n');
            if (firstBreak > 0) {
                text = text.substring(firstBreak + 1);
            }
            int closing = text.lastIndexOf("```");
            if (closing >= 0) {
                text = text.substring(0, closing);
            }
            text = text.trim();
        }
        return text;
    }

    private static void rejectUnknownFields(JsonNode object, Set<String> allowed, String what) {
        Set<String> present = new java.util.HashSet<>();
        object.fieldNames().forEachRemaining(present::add);
        for (String field : present) {
            if (!allowed.contains(field)) {
                throw new IllegalArgumentException(
                        "Unknown field '%s' in %s is not allowed.".formatted(field, what));
            }
        }
    }

    private static String requiredText(JsonNode object, String field, int maxLength, int minLength) {
        JsonNode node = object.get(field);
        if (node == null || !node.isTextual()) {
            throw new IllegalArgumentException("Field '%s' is required.".formatted(field));
        }
        String value = node.asText().trim();
        if (value.length() < minLength || value.length() > maxLength) {
            throw new IllegalArgumentException(
                    "Field '%s' must be %d-%d characters.".formatted(field, minLength, maxLength));
        }
        return value;
    }

    private static String optionalText(JsonNode object, String field, int maxLength) {
        JsonNode node = object.get(field);
        if (node == null || node.isNull()) {
            return null;
        }
        if (!node.isTextual()) {
            throw new IllegalArgumentException("Field '%s' must be a string.".formatted(field));
        }
        String value = node.asText().trim();
        if (value.isEmpty()) {
            return null;
        }
        return value.length() > maxLength ? value.substring(0, maxLength) : value;
    }
}
