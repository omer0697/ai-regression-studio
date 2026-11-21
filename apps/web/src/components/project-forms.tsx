"use client";

import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, type ReactNode } from "react";

import { IconPlus } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useCreateEnvironment,
  useCreateProject,
  useCreateScreen,
  useUpdateEnvironment,
  useUpdateScreen,
} from "@/lib/api-hooks";
import { ApiError } from "@/lib/api-client";
import {
  environmentFormSchema,
  environmentFormToPayload,
  projectFormSchema,
  screenFormSchema,
  type EnvironmentFormValues,
  type ProjectFormValues,
  type ScreenFormValues,
} from "@/lib/schemas";
import type { EnvironmentConfig, ScreenDefinition } from "@ars/shared-contracts";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-danger">{message}</p>;
}

function ApiErrorBanner({ error }: { error: ApiError | null }) {
  if (!error) return null;
  return (
    <div className="mb-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
      {error.code === "PROJECT_NAME_EXISTS"
        ? "Bu adda bir proje zaten mevcut."
        : error.code === "ENVIRONMENT_ALREADY_EXISTS"
          ? "Bu uygulama tipi için ortam zaten tanımlı. Mevcut kaydı güncelleyin."
          : error.code === "SCREEN_ALREADY_EXISTS"
            ? "Bu ekran kodu projede zaten kayıtlı."
            : error.code === "AUTH_METHOD_CONFIG_INCOMPLETE"
              ? "TEST_ACCOUNT_FORM yöntemi için login URL'si ve seçiciler (kullanıcı adı, şifre, gönder) zorunludur."
              : error.message}
    </div>
  );
}

function toApiError(error: unknown): ApiError | null {
  return error instanceof ApiError ? error : null;
}

export function CreateProjectDialog({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const createProject = useCreateProject();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: { name: "", description: "", environmentName: "TEST" },
  });

  const onSubmit = async (values: ProjectFormValues) => {
    try {
      await createProject.mutateAsync({
        name: values.name,
        description: values.description || undefined,
        environmentName: values.environmentName,
      });
      reset();
      setOpen(false);
      onCreated?.();
    } catch {
      // ApiErrorBanner renders the failure via createProject.error
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <IconPlus />
          Yeni Proje
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Yeni Test Projesi</DialogTitle>
          <DialogDescription>
            Bir migration projesi tanımlayın; ardından GWT ve React ortamlarını ekleyin.
          </DialogDescription>
        </DialogHeader>

        <ApiErrorBanner error={toApiError(createProject.error)} />

        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-name">Proje adı</Label>
            <Input id="project-name" placeholder="KAP Migration" {...register("name")} />
            <FieldError message={errors.name?.message} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="project-env">Test ortamı adı</Label>
            <Input id="project-env" placeholder="TEST" {...register("environmentName")} />
            <FieldError message={errors.environmentName?.message} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="project-desc">Açıklama (isteğe bağlı)</Label>
            <Textarea
              id="project-desc"
              placeholder="KAP uygulamasının GWT → React migrasyon doğrulaması"
              {...register("description")}
            />
            <FieldError message={errors.description?.message} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Oluşturuluyor…" : "Oluştur"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Environment form (shared between create & edit)
// ---------------------------------------------------------------------------

function EnvironmentFormFields({
  form,
  appTypeLocked,
}: {
  form: UseFormReturn<EnvironmentFormValues>;
  appTypeLocked: boolean;
}) {
  const { register, formState } = form;
  const errors = formState.errors;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor="env-app-type">Uygulama tipi</Label>
        <Select id="env-app-type" disabled={appTypeLocked} {...register("appType")}>
          <option value="LEGACY_GWT">GWT (Eski uygulama)</option>
          <option value="REACT">React (Yeni uygulama)</option>
        </Select>
        {appTypeLocked ? (
          <p className="text-xs text-muted-foreground">
            Uygulama tipi değiştirilemez; gerekiyorsa ortamı silip yeniden ekleyin.
          </p>
        ) : null}
        <FieldError message={errors.appType?.message} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="env-display-name">Görünen ad</Label>
        <Input id="env-display-name" placeholder="KAP GWT (TEST)" {...register("displayName")} />
        <FieldError message={errors.displayName?.message} />
      </div>

      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label htmlFor="env-base-url">Temel URL</Label>
        <Input id="env-base-url" placeholder="https://gwt.kap-test.example.com" {...register("baseUrl")} />
        <p className="text-xs text-muted-foreground">
          Yerelde çalışan bir uygulama için örnek: http://localhost:9100/fixtures/gwt-kpy68.html
        </p>
        <FieldError message={errors.baseUrl?.message} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="env-label">Ortam etiketi</Label>
        <Input id="env-label" placeholder="TEST" {...register("environmentLabel")} />
        <FieldError message={errors.environmentLabel?.message} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="env-auth">Kimlik doğrulama</Label>
        <Select id="env-auth" {...register("authMethod")}>
          <option value="NONE">Giriş gerekmiyor</option>
          <option value="TEST_ACCOUNT_FORM">Test hesabı ile form girişi</option>
        </Select>
        <FieldError message={errors.authMethod?.message} />
      </div>

      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label htmlFor="env-cred-ref">Kimlik referansı (isteğe bağlı)</Label>
        <Input
          id="env-cred-ref"
          placeholder="kap-gwt-test-user"
          {...register("credentialReference")}
        />
        <p className="text-xs text-muted-foreground">
          Yalnızca referans adı saklanır. Kullanıcı adı/şifre asla bu forma girilmez.
        </p>
        <FieldError message={errors.credentialReference?.message} />
      </div>

      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label htmlFor="env-login-url">Login URL (form girişi için)</Label>
        <Input id="env-login-url" placeholder="https://gwt.kap-test.example.com/login" {...register("loginUrl")} />
        <FieldError message={errors.loginUrl?.message} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="env-username-selector">Kullanıcı adı seçicisi</Label>
        <Input id="env-username-selector" placeholder="[name=username]" {...register("usernameSelector")} />
        <FieldError message={errors.usernameSelector?.message} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="env-password-selector">Şifre seçicisi</Label>
        <Input id="env-password-selector" placeholder="[name=password]" {...register("passwordSelector")} />
        <FieldError message={errors.passwordSelector?.message} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="env-submit-selector">Gönder butonu seçicisi</Label>
        <Input id="env-submit-selector" placeholder="[type=submit]" {...register("submitSelector")} />
        <FieldError message={errors.submitSelector?.message} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="env-timeout">Tarayıcı zaman aşımı (ms)</Label>
        <Input
          id="env-timeout"
          type="number"
          {...register("browserTimeoutMs", { valueAsNumber: true })}
        />
        <FieldError message={errors.browserTimeoutMs?.message} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="env-max-interactions">Keşif etkileşim limiti</Label>
        <Input
          id="env-max-interactions"
          type="number"
          {...register("explorationMaxInteractions", { valueAsNumber: true })}
        />
        <p className="text-xs text-muted-foreground">
          Sınırlı güvenli etkileşim keşfi: seçim/checkbox/radyo için azami adım sayısı.
          0 = etkileşimli keşif kapalı.
        </p>
        <FieldError message={errors.explorationMaxInteractions?.message} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="env-max-options">Deneme başına seçenek limiti</Label>
        <Input
          id="env-max-options"
          type="number"
          {...register("explorationMaxOptions", { valueAsNumber: true })}
        />
        <FieldError message={errors.explorationMaxOptions?.message} />
      </div>

      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label htmlFor="env-domains">İzinli alan adları (virgülle)</Label>
        <Input id="env-domains" placeholder="gwt.kap-test.example.com" {...register("allowedDomains")} />
        <FieldError message={errors.allowedDomains?.message} />
      </div>

      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label htmlFor="env-prohibited">Yasaklı eylemler (virgülle)</Label>
        <Input id="env-prohibited" {...register("prohibitedActions")} />
        <p className="text-xs text-muted-foreground">
          Keşif sırasında worker bu iş eylemlerini asla gerçekleştirmez.
        </p>
        <FieldError message={errors.prohibitedActions?.message} />
      </div>

      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-border-subtle bg-surface-2"
          {...register("screenshotEnabled")}
        />
        Ekran görüntüsü kaydı açık
      </label>
    </div>
  );
}

const CREATE_ENV_DEFAULTS: EnvironmentFormValues = {
  appType: "LEGACY_GWT",
  displayName: "",
  baseUrl: "",
  environmentLabel: "TEST",
  authMethod: "NONE",
  credentialReference: "",
  loginUrl: "",
  usernameSelector: "",
  passwordSelector: "",
  submitSelector: "",
  allowedDomains: "",
  prohibitedActions: "submit, delete, approve, sign, send",
  browserTimeoutMs: 30000,
  explorationMaxInteractions: 12,
  explorationMaxOptions: 3,
  screenshotEnabled: true,
};

export function CreateEnvironmentDialog({
  projectId,
  onCreated,
}: {
  projectId: number;
  onCreated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const createEnvironment = useCreateEnvironment(projectId);

  const form = useForm<EnvironmentFormValues>({
    resolver: zodResolver(environmentFormSchema),
    defaultValues: CREATE_ENV_DEFAULTS,
  });

  const onSubmit = async (values: EnvironmentFormValues) => {
    try {
      await createEnvironment.mutateAsync(environmentFormToPayload(values));
      form.reset();
      setOpen(false);
      onCreated?.();
    } catch {
      // rendered via ApiErrorBanner
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <IconPlus />
          Ortam Ekle
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Uygulama Ortamı Ekle</DialogTitle>
          <DialogDescription>
            Test edilecek uygulamanın adresini ve güvenli giriş stratejisini tanımlayın.
            Kimlik bilgileri burada tutulmaz; yalnızca güvenli referans adı girilir.
          </DialogDescription>
        </DialogHeader>

        <ApiErrorBanner error={toApiError(createEnvironment.error)} />

        <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
          <EnvironmentFormFields form={form} appTypeLocked={false} />

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Kaydediliyor…" : "Kaydet"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Prefilled environment editor; app type stays fixed after creation. */
export function EditEnvironmentDialog({
  projectId,
  environment,
  onClose,
}: {
  projectId: number;
  environment: EnvironmentConfig | null;
  onClose: () => void;
}) {
  const updateEnvironment = useUpdateEnvironment(projectId);

  if (!environment) {
    return null;
  }

  return (
    <EditEnvironmentDialogInner
      environment={environment}
      updateError={toApiError(updateEnvironment.error)}
      isSubmitting={updateEnvironment.isPending}
      onSubmit={async (values) => {
        await updateEnvironment.mutateAsync({
          envId: environment.id,
          body: environmentFormToPayload(values),
        });
        onClose();
      }}
      onClose={onClose}
    />
  );
}

function EditEnvironmentDialogInner({
  environment,
  updateError,
  isSubmitting,
  onSubmit,
  onClose,
}: {
  environment: EnvironmentConfig;
  updateError: ApiError | null;
  isSubmitting: boolean;
  onSubmit: (values: EnvironmentFormValues) => Promise<void>;
  onClose: () => void;
}) {
  const form = useForm<EnvironmentFormValues>({
    resolver: zodResolver(environmentFormSchema),
    defaultValues: {
      appType: environment.appType,
      displayName: environment.displayName,
      baseUrl: environment.baseUrl,
      environmentLabel: environment.environmentLabel,
      authMethod: environment.authMethod,
      credentialReference: environment.credentialReference ?? "",
      loginUrl: environment.loginUrl ?? "",
      usernameSelector: environment.usernameSelector ?? "",
      passwordSelector: environment.passwordSelector ?? "",
      submitSelector: environment.submitSelector ?? "",
      allowedDomains: environment.allowedDomains.join(", "),
      prohibitedActions: environment.prohibitedActions.join(", "),
      browserTimeoutMs: environment.browserTimeoutMs,
      explorationMaxInteractions: environment.explorationMaxInteractions,
      explorationMaxOptions: environment.explorationMaxOptions,
      screenshotEnabled: environment.screenshotEnabled,
    },
  });

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Ortamı Düzenle — {environment.displayName}</DialogTitle>
          <DialogDescription>
            Mevcut ortam ayarlarını güncelleyin. Kimlik bilgileri burada tutulmaz;
            yalnızca güvenli referans adı saklanır.
          </DialogDescription>
        </DialogHeader>

        <ApiErrorBanner error={updateError} />

        <form
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit(async (values) => {
            await onSubmit(values);
          })}
        >
          <EnvironmentFormFields form={form} appTypeLocked />

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Kaydediliyor…" : "Güncelle"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

export function CreateScreenDialog({
  projectId,
  onCreated,
}: {
  projectId: number;
  onCreated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const createScreen = useCreateScreen(projectId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ScreenFormValues>({
    resolver: zodResolver(screenFormSchema),
    defaultValues: {
      screenCode: "",
      name: "",
      legacyRoute: "",
      reactRoute: "",
      navigationNotes: "",
    },
  });

  const onSubmit = async (values: ScreenFormValues) => {
    try {
      await createScreen.mutateAsync({
        screenCode: values.screenCode,
        name: values.name,
        legacyRoute: values.legacyRoute || undefined,
        reactRoute: values.reactRoute || undefined,
        navigationNotes: values.navigationNotes || undefined,
      });
      reset();
      setOpen(false);
      onCreated?.();
    } catch {
      // rendered via ApiErrorBanner
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <IconPlus />
          Ekran Ekle
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hedef Ekran Ekle</DialogTitle>
          <DialogDescription>
            Test edilecek ekranı tanımlayın (örn. KPY68).
          </DialogDescription>
        </DialogHeader>

        <ApiErrorBanner error={toApiError(createScreen.error)} />

        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="screen-code">Ekran kodu</Label>
              <Input id="screen-code" placeholder="KPY68" {...register("screenCode")} />
              <p className="text-xs text-muted-foreground">
                Sonradan değiştirilemez; büyük harf, rakam, _ ve - kullanın.
              </p>
              <FieldError message={errors.screenCode?.message} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="screen-name">Ekran adı</Label>
              <Input id="screen-name" placeholder="Parametre Tanımları" {...register("name")} />
              <FieldError message={errors.name?.message} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="screen-legacy-route">GWT rotası (isteğe bağlı)</Label>
              <Input id="screen-legacy-route" placeholder="#KPY68" {...register("legacyRoute")} />
              <FieldError message={errors.legacyRoute?.message} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="screen-react-route">React rotası (isteğe bağlı)</Label>
              <Input id="screen-react-route" placeholder="/kpy68" {...register("reactRoute")} />
              <FieldError message={errors.reactRoute?.message} />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="screen-notes">Navigasyon notları (isteğe bağlı)</Label>
              <Textarea
                id="screen-notes"
                placeholder="Sol menüden Parametreler → KPY68 açılır."
                {...register("navigationNotes")}
              />
              <FieldError message={errors.navigationNotes?.message} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Kaydediliyor…" : "Kaydet"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Prefilled screen editor; the screen code is immutable after creation. */
export function EditScreenDialog({
  projectId,
  screen,
  onClose,
}: {
  projectId: number;
  screen: ScreenDefinition | null;
  onClose: () => void;
}) {
  const updateScreen = useUpdateScreen(projectId);

  if (!screen) {
    return null;
  }

  return (
    <EditScreenDialogInner
      screen={screen}
      updateError={toApiError(updateScreen.error)}
      isSubmitting={updateScreen.isPending}
      onSubmit={async (values) => {
        await updateScreen.mutateAsync({
          screenId: screen.id,
          body: {
            screenCode: screen.screenCode,
            name: values.name,
            legacyRoute: values.legacyRoute || undefined,
            reactRoute: values.reactRoute || undefined,
            navigationNotes: values.navigationNotes || undefined,
          },
        });
        onClose();
      }}
      onClose={onClose}
    />
  );
}

function EditScreenDialogInner({
  screen,
  updateError,
  isSubmitting,
  onSubmit,
  onClose,
}: {
  screen: ScreenDefinition;
  updateError: ApiError | null;
  isSubmitting: boolean;
  onSubmit: (values: ScreenFormValues) => Promise<void>;
  onClose: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ScreenFormValues>({
    resolver: zodResolver(screenFormSchema),
    defaultValues: {
      screenCode: screen.screenCode,
      name: screen.name,
      legacyRoute: screen.legacyRoute ?? "",
      reactRoute: screen.reactRoute ?? "",
      navigationNotes: screen.navigationNotes ?? "",
    },
  });

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ekranı Düzenle — {screen.screenCode}</DialogTitle>
          <DialogDescription>
            Ekran kodu sabittir; ad, rotalar ve navigasyon notları güncellenebilir.
          </DialogDescription>
        </DialogHeader>

        <ApiErrorBanner error={updateError} />

        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-screen-code">Ekran kodu</Label>
              <Input
                id="edit-screen-code"
                className="font-mono"
                value={screen.screenCode}
                disabled
                readOnly
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-screen-name">Ekran adı</Label>
              <Input id="edit-screen-name" {...register("name")} />
              <FieldError message={errors.name?.message} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-screen-legacy-route">GWT rotası (isteğe bağlı)</Label>
              <Input id="edit-screen-legacy-route" placeholder="#KPY68" {...register("legacyRoute")} />
              <FieldError message={errors.legacyRoute?.message} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-screen-react-route">React rotası (isteğe bağlı)</Label>
              <Input id="edit-screen-react-route" placeholder="/kpy68" {...register("reactRoute")} />
              <FieldError message={errors.reactRoute?.message} />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="edit-screen-notes">Navigasyon notları (isteğe bağlı)</Label>
              <Textarea id="edit-screen-notes" {...register("navigationNotes")} />
              <FieldError message={errors.navigationNotes?.message} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Kaydediliyor…" : "Güncelle"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}
