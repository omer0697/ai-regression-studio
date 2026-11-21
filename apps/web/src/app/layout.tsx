import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "AI Regression Studio",
    template: "%s — AI Regression Studio",
  },
  description:
    "GWT eski uygulaması ile React yenisi arasında fonksiyonel regresyon testleri üretip karşılaştıran yapay zekâ destekli platform.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
