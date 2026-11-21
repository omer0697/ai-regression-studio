"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Suspense, useState } from "react";

import { IconAlert, IconLogin } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-client";
import { loginFormSchema, type LoginFormValues } from "@/lib/schemas";
import { useSession } from "@/lib/session";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-muted-foreground">Yükleniyor…</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, status } = useSession();
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { username: "", password: "" },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setAuthError(null);
    try {
      await login(values.username, values.password);
      const next = searchParams.get("next");
      router.replace(next && next.startsWith("/") ? next : "/");
    } catch (error) {
      if (error instanceof ApiError && error.code === "INVALID_CREDENTIALS") {
        setAuthError("Kullanıcı adı veya şifre hatalı.");
      } else if (error instanceof ApiError && error.status === 403) {
        setAuthError(
          "Erişim reddedildi (403). Sayfayı yenileyip tekrar deneyin; sorun sürerse API'nin CORS ayarlarını (ARS_WEB_ORIGINS) kontrol edin.",
        );
      } else {
        setAuthError("Giriş yapılamadı. API servisinin çalıştığından emin olun.");
      }
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">AI Regression Studio</CardTitle>
          <CardDescription>
            Test platformuna erişmek için yetkili hesabınızla giriş yapın.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {authError ? (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              <IconAlert className="mt-0.5 shrink-0" />
              <span>{authError}</span>
            </div>
          ) : null}

          <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="username">Kullanıcı adı</Label>
              <Input
                id="username"
                autoComplete="username"
                disabled={status === "authenticated" || isSubmitting}
                {...register("username")}
              />
              {errors.username ? (
                <p className="text-xs text-danger">{errors.username.message}</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Şifre</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                disabled={status === "authenticated" || isSubmitting}
                {...register("password")}
              />
              {errors.password ? (
                <p className="text-xs text-danger">{errors.password.message}</p>
              ) : null}
            </div>

            <Button type="submit" disabled={isSubmitting}>
              <IconLogin />
              {isSubmitting ? "Giriş yapılıyor…" : "Giriş yap"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
