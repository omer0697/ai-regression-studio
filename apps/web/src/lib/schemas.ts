import { z } from "zod";

/**
 * Zod schemas for dashboard forms (React Hook Form resolvers).
 * Mirrors the server-side Bean Validation rules.
 */

export const loginFormSchema = z.object({
  username: z.string().min(1, "Kullanıcı adı zorunludur.").max(64),
  password: z.string().min(1, "Şifre zorunludur.").max(128),
});
export type LoginFormValues = z.infer<typeof loginFormSchema>;

export const projectFormSchema = z.object({
  name: z
    .string()
    .min(2, "Proje adı en az 2 karakter olmalıdır.")
    .max(80, "Proje adı en fazla 80 karakter olabilir."),
  description: z.string().max(600, "Açıklama en fazla 600 karakter olabilir.").optional().or(z.literal("")),
  environmentName: z
    .string()
    .min(1, "Test ortamı adı zorunludur.")
    .max(40, "Test ortamı adı en fazla 40 karakter olabilir."),
});
export type ProjectFormValues = z.infer<typeof projectFormSchema>;

export const environmentFormSchema = z.object({
  appType: z.enum(["LEGACY_GWT", "REACT"], { message: "Uygulama tipi seçilmelidir." }),
  displayName: z
    .string()
    .min(1, "Görünen ad zorunludur.")
    .max(80, "Görünen ad en fazla 80 karakter olabilir."),
  baseUrl: z.url("Geçerli bir URL giriniz (http/https).").max(500),
  environmentLabel: z
    .string()
    .min(1, "Ortam etiketi zorunludur.")
    .max(40, "Ortam etiketi en fazla 40 karakter olabilir."),
  authMethod: z.enum(["NONE", "TEST_ACCOUNT_FORM"], { message: "Kimlik doğrulama yöntemi seçilmelidir." }),
  credentialReference: z
    .string()
    .max(120, "Referans adı en fazla 120 karakter olabilir.")
    .optional()
    .or(z.literal("")),
  loginUrl: z.url("Geçerli bir URL giriniz.").max(500).optional().or(z.literal("")),
  usernameSelector: z.string().max(300).optional().or(z.literal("")),
  passwordSelector: z.string().max(300).optional().or(z.literal("")),
  submitSelector: z.string().max(300).optional().or(z.literal("")),
  allowedDomains: z
    .string()
    .max(1000, "Alan adı listesi çok uzun.")
    .optional()
    .or(z.literal("")),
  prohibitedActions: z
    .string()
    .max(600, "Yasaklı eylem listesi çok uzun.")
    .optional()
    .or(z.literal("")),
  browserTimeoutMs: z
    .number({ message: "Zaman aşımı sayısal (ms) olmalıdır." })
    .int("Zaman aşımı tam sayı (ms) olmalıdır.")
    .min(1000, "Zaman aşımı en az 1000 ms olmalıdır.")
    .max(120000, "Zaman aşımı en fazla 120000 ms olabilir."),
  screenshotEnabled: z.boolean(),
});
export type EnvironmentFormValues = z.infer<typeof environmentFormSchema>;

/**
 * Converts the comma-separated input fields to arrays and normalizes
 * empty strings to undefined so the API applies its defaults.
 */
export function environmentFormToPayload(values: EnvironmentFormValues): Record<string, unknown> {
  const toList = (input: string | undefined): string[] | undefined => {
    if (!input || !input.trim()) return undefined;
    return input
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, 50);
  };

  return {
    appType: values.appType,
    displayName: values.displayName,
    baseUrl: values.baseUrl,
    environmentLabel: values.environmentLabel,
    authMethod: values.authMethod,
    credentialReference: values.credentialReference || undefined,
    loginUrl: values.loginUrl || undefined,
    usernameSelector: values.usernameSelector || undefined,
    passwordSelector: values.passwordSelector || undefined,
    submitSelector: values.submitSelector || undefined,
    allowedDomains: toList(values.allowedDomains),
    prohibitedActions: toList(values.prohibitedActions),
    browserTimeoutMs: values.browserTimeoutMs,
    screenshotEnabled: values.screenshotEnabled,
  };
}

export const screenFormSchema = z.object({
  screenCode: z
    .string()
    .regex(
      /^[A-Z][A-Z0-9_-]{1,31}$/,
      "Ekran kodu büyük harf, rakam, _ ve - içermelidir (örn. KPY68).",
    ),
  name: z.string().min(1, "Ekran adı zorunludur.").max(120, "Ekran adı en fazla 120 karakter olabilir."),
  legacyRoute: z.string().max(300, "GWT rota en fazla 300 karakter olabilir.").optional().or(z.literal("")),
  reactRoute: z.string().max(300, "React rota en fazla 300 karakter olabilir.").optional().or(z.literal("")),
  navigationNotes: z.string().max(4000, "Navigasyon notları en fazla 4000 karakter olabilir.").optional().or(z.literal("")),
});
export type ScreenFormValues = z.infer<typeof screenFormSchema>;

export const executionStartSchema = z.object({
  screenId: z.coerce.number({ message: "Ekran seçilmelidir." }).int().positive("Ekran seçilmelidir."),
  mode: z.enum(["DISCOVERY", "COMPARISON"], { message: "Çalıştırma modu seçilmelidir." }),
});
export type ExecutionStartValues = z.infer<typeof executionStartSchema>;
