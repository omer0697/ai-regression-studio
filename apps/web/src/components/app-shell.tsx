"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import {
  IconActivity,
  IconBug,
  IconCpu,
  IconFileText,
  IconFolder,
  IconHome,
  IconLayers,
  IconLogout,
  IconPlay,
  IconSettings,
  IconSparkles,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  phase?: string;
}

const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Panel", icon: <IconHome /> },
  { href: "/projects", label: "Projeler", icon: <IconFolder /> },
  { href: "/executions", label: "Çalıştırmalar", icon: <IconPlay /> },
];

const PHASED_NAV: NavItem[] = [
  { href: "/ai-discovery", label: "AI Keşif & Test", icon: <IconSparkles /> },
  { href: "/scenarios", label: "Senaryo Kütüphanesi", icon: <IconActivity /> },
  { href: "/ai-config", label: "AI Ayarları", icon: <IconCpu /> },
  { href: "/soon/comparison", label: "GWT ↔ React", icon: <IconLayers />, phase: "F5" },
  { href: "/soon/pdf", label: "PDF Karşılaştırma", icon: <IconFileText />, phase: "F6" },
  { href: "/soon/bugs", label: "Hata Raporları", icon: <IconBug />, phase: "F5–7" },
  { href: "/soon/settings", label: "Ayarlar", icon: <IconSettings />, phase: "F8" },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
        active
          ? "bg-surface-2 font-medium text-foreground"
          : "text-muted-foreground hover:bg-surface-2/60 hover:text-foreground",
      )}
    >
      <span className={cn("shrink-0", active ? "text-primary" : undefined)}>{item.icon}</span>
      <span className="flex-1 truncate">{item.label}</span>
      {item.phase ? (
        <span className="rounded-full border border-border-subtle px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {item.phase}
        </span>
      ) : null}
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { status, user, logout } = useSession();
  const isLoginPage = pathname === "/login";

  useEffect(() => {
    if (status === "anonymous" && !isLoginPage) {
      router.replace("/login");
    }
  }, [status, isLoginPage, router]);

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Oturum kontrol ediliyor…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border-subtle bg-surface/60 px-4 py-5 md:flex">
        <Link href="/" className="mb-6 flex items-center gap-2 px-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <IconLayers width={18} height={18} />
          </span>
          <span className="text-sm font-semibold leading-tight">
            AI Regression Studio
          </span>
        </Link>

        <nav className="flex flex-col gap-1">
          {PRIMARY_NAV.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
              }
            />
          ))}
        </nav>

        <p className="mb-2 mt-7 px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
          Yol Haritası
        </p>
        <nav className="flex flex-col gap-1">
          {PHASED_NAV.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={pathname.startsWith(item.href)}
            />
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-end gap-3 border-b border-border-subtle px-6">
          {user ? (
            <>
              <span className="text-sm text-muted-foreground">{user.displayName}</span>
              <Badge tone={user.role === "ADMIN" ? "info" : "muted"}>{user.role}</Badge>
              <Button variant="ghost" size="sm" onClick={() => void logout()}>
                <IconLogout />
                Çıkış
              </Button>
            </>
          ) : null}
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
