"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import {
  IconActivity,
  IconBug,
  IconChat,
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
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Genel",
    items: [
      { href: "/", label: "Panel", icon: <IconHome /> },
      { href: "/projects", label: "Projeler", icon: <IconFolder /> },
      { href: "/executions", label: "Çalıştırmalar", icon: <IconPlay /> },
    ],
  },
  {
    title: "Test & Analiz",
    items: [
      { href: "/ai-discovery", label: "AI Keşif & Test", icon: <IconSparkles /> },
      { href: "/scenarios", label: "Senaryo Kütüphanesi", icon: <IconActivity /> },
      { href: "/bugs", label: "Hata Raporları", icon: <IconBug /> },
      { href: "/pdf", label: "PDF Karşılaştırma", icon: <IconFileText /> },
    ],
  },
  {
    title: "Yardım",
    items: [{ href: "/chat", label: "Proje Sohbeti", icon: <IconChat /> }],
  },
  {
    title: "Sistem",
    items: [
      { href: "/ai-config", label: "AI Ayarları", icon: <IconCpu /> },
      { href: "/settings", label: "Ayarlar", icon: <IconSettings /> },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

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
    </Link>
  );
}

/** Compact horizontal nav for small screens (sidebar is desktop-only). */
function MobileNav({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Mobil gezinme"
      className="flex gap-1 overflow-x-auto border-b border-border-subtle px-4 py-2 md:hidden"
    >
      {NAV_GROUPS.flatMap((group) => group.items).map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
            isActive(pathname, item.href)
              ? "bg-surface-2 font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span className={isActive(pathname, item.href) ? "text-primary" : undefined}>
            {item.icon}
          </span>
          {item.label}
        </Link>
      ))}
    </nav>
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
      <aside className="hidden w-64 shrink-0 flex-col overflow-y-auto border-r border-border-subtle bg-surface/60 px-4 py-5 md:flex">
        <Link href="/" className="mb-6 flex items-center gap-2 px-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <IconLayers width={18} height={18} />
          </span>
          <span className="text-sm font-semibold leading-tight">AI Regression Studio</span>
        </Link>

        {NAV_GROUPS.map((group) => (
          <section key={group.title} className="mb-5 first:mb-0">
            <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
              {group.title}
            </p>
            <nav className="flex flex-col gap-1">
              {group.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActive(pathname, item.href)}
                />
              ))}
            </nav>
          </section>
        ))}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border-subtle px-6">
          <Link
            href="/chat"
            className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <IconChat width={14} height={14} className="text-primary" />
            Sorunuz mu var? Sohbeti açın
          </Link>
          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{user.displayName}</span>
              <Badge tone={user.role === "ADMIN" ? "info" : "muted"}>{user.role}</Badge>
              <Button variant="ghost" size="sm" onClick={() => void logout()}>
                <IconLogout />
                Çıkış
              </Button>
            </div>
          ) : null}
        </header>

        <MobileNav pathname={pathname} />

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
