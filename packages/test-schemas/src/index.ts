/**
 * Zod schemas for jobs sent to the browser worker and for AI-generated
 * test plans.
 *
 * SECURITY INVARIANT: only the actions listed in SAFE_ACTIONS may ever be
 * executed. Anything the AI proposes outside this list (shell commands,
 * arbitrary JavaScript, destructive business operations) is rejected at the
 * schema level before it can reach the worker.
 */
import { z } from "zod";

import { APP_TYPES, AUTH_METHODS, EXECUTION_MODES } from "@ars/shared-contracts";

/** Target identifiers are business-level slugs, never CSS/XPath fragments. */
export const targetIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,63}$/, "Target must be a business identifier (lowercase letters, digits, dashes)");

const appTypeSchema = z.enum(APP_TYPES);
const authMethodSchema = z.enum(AUTH_METHODS);
const executionModeSchema = z.enum(EXECUTION_MODES);

/**
 * The closed action vocabulary the worker is allowed to execute.
 * Phase 2 implements these; the list itself is the policy boundary.
 */
export const SAFE_ACTIONS = [
  "navigate",
  "click",
  "fill",
  "selectOption",
  "setCheckbox",
  "chooseRadio",
  "openModal",
  "closeModal",
  "assertVisible",
  "assertHidden",
  "assertEnabled",
  "assertDisabled",
  "assertValue",
  "assertText",
  "wait",
  "downloadPdf",
] as const;

export type SafeAction = (typeof SAFE_ACTIONS)[number];

const ACTIONS_REQUIRING_TARGET: ReadonlySet<string> = new Set([
  "click",
  "fill",
  "selectOption",
  "setCheckbox",
  "chooseRadio",
  "openModal",
  "closeModal",
  "assertVisible",
  "assertHidden",
  "assertEnabled",
  "assertDisabled",
  "assertValue",
  "assertText",
]);

const ACTIONS_REQUIRING_VALUE: ReadonlySet<string> = new Set([
  "fill",
  "selectOption",
  "chooseRadio",
]);

const ACTIONS_ALLOWING_VALUE: ReadonlySet<string> = new Set([
  "fill",
  "selectOption",
  "setCheckbox",
  "chooseRadio",
  "assertValue",
  "assertText",
  "wait",
  "navigate",
]);

export const actionStepSchema = z
  .object({
    action: z.enum(SAFE_ACTIONS),
    target: targetIdSchema.optional(),
    value: z.string().max(500).optional(),
  })
  .strict()
  .superRefine((step, ctx) => {
    if (ACTIONS_REQUIRING_TARGET.has(step.action) && !step.target) {
      ctx.addIssue({
        code: "custom",
        message: `Action '${step.action}' requires a target`,
      });
    }
    if (ACTIONS_REQUIRING_VALUE.has(step.action) && !step.value) {
      ctx.addIssue({
        code: "custom",
        message: `Action '${step.action}' requires a value`,
      });
    }
    if (step.value !== undefined && !ACTIONS_ALLOWING_VALUE.has(step.action)) {
      ctx.addIssue({
        code: "custom",
        message: `Action '${step.action}' does not accept a value`,
      });
    }
  });

export type ActionStep = z.infer<typeof actionStepSchema>;

/** Schema-validated test plan (AI output must pass this before execution). */
export const scenarioPlanSchema = z
  .object({
    scenarioName: z.string().min(3).max(120),
    screen: z.string().min(2).max(64),
    description: z.string().max(1000).optional(),
    steps: z.array(actionStepSchema).min(1).max(200),
  })
  .strict();

export type ScenarioPlan = z.infer<typeof scenarioPlanSchema>;

/** An environment reference handed to the worker. Secrets are never included. */
export const environmentRefSchema = z
  .object({
    projectId: z.number().int().positive(),
    appType: appTypeSchema,
    displayName: z.string().min(1).max(80),
    baseUrl: z.url(),
    environmentLabel: z.string().min(1).max(40),
    authMethod: authMethodSchema,
    /**
     * Reference name only — slug-like identifiers. Values that look like
     * URLs or user:password pairs are rejected so secrets can never be
     * smuggled through this field.
     */
    credentialReference: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/, "credentialReference must be a reference name, never a secret value")
      .nullable()
      .optional(),
    loginUrl: z.url().nullable().optional(),
    usernameSelector: z.string().max(300).nullable().optional(),
    passwordSelector: z.string().max(300).nullable().optional(),
    submitSelector: z.string().max(300).nullable().optional(),
    allowedDomains: z.array(z.string().max(253)).max(20),
    allowedActions: z.array(z.string().max(60)).max(50),
    prohibitedActions: z.array(z.string().max(60)).max(50),
    browserTimeoutMs: z.number().int().min(1000).max(120_000),
    /** Phase 3 exploration budget — bounded interaction discovery. */
    explorationMaxInteractions: z.number().int().min(0).max(100).optional(),
    explorationMaxOptions: z.number().int().min(0).max(20).optional(),
    screenshotEnabled: z.boolean(),
  })
  .strict();

export type EnvironmentRef = z.infer<typeof environmentRefSchema>;

export const discoverJobSchema = z
  .object({
    jobType: z.literal("discover"),
    executionId: z.number().int().positive(),
    projectId: z.number().int().positive(),
    screenCode: z.string().min(1).max(64),
    screenName: z.string().min(1).max(120),
    mode: executionModeSchema,
    legacyApp: environmentRefSchema,
    reactApp: environmentRefSchema.nullable().optional(),
  })
  .strict();

export const executeJobSchema = z
  .object({
    jobType: z.literal("execute"),
    executionId: z.number().int().positive(),
    projectId: z.number().int().positive(),
    screenCode: z.string().min(1).max(64),
    plan: scenarioPlanSchema,
  })
  .strict();

export type DiscoverJob = z.infer<typeof discoverJobSchema>;
export type ExecuteJob = z.infer<typeof executeJobSchema>;
export type WorkerJob = DiscoverJob | ExecuteJob;

/** A GWT->React element pair used to align the two applications. */
export const mappingPairSchema = z
  .object({
    legacyRef: z.string().max(64),
    legacyLabel: z.string().max(300).nullable().optional(),
    reactRef: z.string().max(64).nullable().optional(),
    reactLabel: z.string().max(300).nullable().optional(),
    confidence: z.number().min(0).max(1),
    needsReview: z.boolean().optional(),
  })
  .strict();

export type MappingPair = z.infer<typeof mappingPairSchema>;

/** Phase 5: run an equivalent plan in both apps and compare behavior. */
export const comparisonJobSchema = z
  .object({
    jobType: z.literal("compare"),
    executionId: z.number().int().positive(),
    projectId: z.number().int().positive(),
    screenCode: z.string().min(1).max(64),
    screenName: z.string().min(1).max(120),
    mode: z.literal("COMPARISON"),
    plan: scenarioPlanSchema,
    legacyApp: environmentRefSchema,
    reactApp: environmentRefSchema,
    mapping: z.array(mappingPairSchema).max(300).optional(),
  })
  .strict();

export type ComparisonJob = z.infer<typeof comparisonJobSchema>;

/**
 * V8 user-driven: full-combination testing. The worker fills every discovered
 * field with every bounded combination (singles first, then pairwise, then
 * sampled products within the budget) in BOTH apps, reloads between
 * combinations (guaranteed reset to a known state) and reports per-field
 * state differences as findings.
 */
export const combinationJobSchema = z
  .object({
    jobType: z.literal("combine"),
    executionId: z.number().int().positive(),
    projectId: z.number().int().positive(),
    screenCode: z.string().min(1).max(64),
    screenName: z.string().min(1).max(120),
    mode: z.literal("COMBINATION"),
    /** Bounded matrix budget — prevents combinatorial explosion. */
    maxCombinations: z.number().int().min(1).max(200),
    legacyApp: environmentRefSchema,
    reactApp: environmentRefSchema,
  })
  .strict();

export type CombinationJob = z.infer<typeof combinationJobSchema>;

export const workerJobSchema = z.discriminatedUnion("jobType", [
  discoverJobSchema,
  executeJobSchema,
  comparisonJobSchema,
  combinationJobSchema,
]);

/** Structured error body the worker returns for unimplemented capabilities. */
export const workerCapabilityErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string(),
        capability: z.string(),
        plannedPhase: z.number().int().positive().nullable().optional(),
        message: z.string(),
      })
      .strict(),
  })
  .strict();
