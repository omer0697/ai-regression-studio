"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { IconChat, IconSend, IconSparkles, IconUser } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api-client";
import { useAiStatus, useProjects } from "@/lib/api-hooks";
import { formatDate } from "@/lib/utils";
import type { ChatReply } from "@/lib/api-client";

const QUICK_COMMANDS = [
  "Son çalıştırmaların durumu ne?",
  "Bulguları göster",
  "Gereksinim durumu",
  "Kombinasyon testi nasıl başlatılır?",
  "PDF karşılaştır",
  "Yardım",
];

/**
 * Renders assistant replies as formatted text: bullet lines become list
 * items, headline lines are emphasized, and hard-wrapped consecutive text
 * lines are merged back into a single paragraph.
 */
function ChatText({ content }: { content: string }) {
  const blocks: Array<{
    kind: "paragraph" | "headline" | "bullet";
    text: string;
  }> = [];

  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", text: paragraph.join(" ").trim() });
      paragraph = [];
    }
  };

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (/^\s*[•\-*]\s+/.test(line)) {
      flushParagraph();
      blocks.push({ kind: "bullet", text: line.replace(/^\s*[•\-*]\s+/, "") });
      continue;
    }
    if (!line) {
      flushParagraph();
      continue;
    }
    const isHeadline = line.endsWith(":") && line.length < 60;
    if (isHeadline) {
      flushParagraph();
      blocks.push({ kind: "headline", text: line });
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();

  return (
    <div className="flex flex-col gap-1.5">
      {blocks.map((block, index) => {
        if (block.kind === "bullet") {
          return (
            <div key={index} className="flex gap-2 text-sm leading-relaxed">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <p className="min-w-0 flex-1">{block.text}</p>
            </div>
          );
        }
        if (block.kind === "headline") {
          return (
            <p key={index} className="text-sm font-semibold text-foreground">
              {block.text}
            </p>
          );
        }
        return (
          <p key={index} className="text-sm leading-relaxed">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}

export default function ChatPage() {
  const { data: projects } = useProjects();
  const { data: aiStatus } = useAiStatus();
  const [projectId, setProjectId] = useState("");
  const [messages, setMessages] = useState<ChatReply[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (projectId) {
      api.listChat(Number(projectId)).then(setMessages).catch(() => setMessages([]));
    }
  }, [projectId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  const send = async (text: string) => {
    if (!text.trim() || !projectId) {
      return;
    }
    setError(null);
    setPending(true);
    try {
      const reply = await api.sendChat(Number(projectId), text);
      setMessages((previous) => [
        ...previous,
        {
          id: -Date.now(),
          role: "USER",
          content: text.trim(),
          createdAt: new Date().toISOString(),
        },
        reply,
      ]);
      setDraft("");
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      setError(apiError?.message ?? "Mesaj gönderilemedi.");
    } finally {
      setPending(false);
    }
  };

  const selectedProject = (projects ?? []).find((project) => String(project.id) === projectId);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Proje Sohbeti</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Uygulamayla ilgili sorun — bulgular, gereksinim kapsamı, kombinasyon testleri,
            PDF karşılaştırma. Yanıtlar yalnızca gerçek proje verisine dayanır; asla uydurma
            değildir.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="chat-project">Konuşulan proje</Label>
          <Select
            id="chat-project"
            className="w-60"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          >
            <option value="">Proje seçin…</option>
            {(projects ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <IconSparkles className="text-primary" />
        {aiStatus?.configured ? (
          <span>
            AI yanıtları açık — model: <span className="text-foreground">{aiStatus.model}</span>
          </span>
        ) : (
          <span>
            AI yapılandırılmadı: deterministik komut yorumlayıcısı aynı gerçek verilerle
            yanıt verir. Doğal dil desteği için{" "}
            <Link className="text-primary hover:underline" href="/ai-config">
              AI Ayarları
            </Link>{" "}
            sayfasına bakın.
          </span>
        )}
      </div>

      {!projectId ? (
        <Card>
          <CardContent className="flex flex-col gap-4 py-8">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <IconChat width={24} height={24} />
            </div>
            <div className="mx-auto flex max-w-xl flex-col gap-2 text-center">
              <p className="text-sm font-medium">Başlamak için bir proje seçin</p>
              <p className="text-sm text-muted-foreground">
                Proje seçtikten sonra uygulamayla ilgili her şeyi sorabilirsiniz: son
                çalıştırmanın durumu, tespit edilen hatalar, gereksinim kapsamı, PDF
                karşılaştırması. Yerelde çalışan bir uygulamanız varsa adresini{" "}
                <Link className="text-primary hover:underline" href="/projects">
                  proje ortamlarında
                </Link>{" "}
                tanımlayıp sohbette o ekran hakkında soru sorabilirsiniz.
              </p>
              {(projects ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Henüz proje yok —{" "}
                  <Link className="text-primary hover:underline" href="/projects">
                    Projeler
                  </Link>{" "}
                  sayfasından ilk projenizi oluşturun.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="flex h-[calc(100vh-19rem)] min-h-[26rem] flex-col overflow-hidden">
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <IconSparkles width={16} height={16} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    Asistan {selectedProject ? `· ${selectedProject.name}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">Mesajlar kalıcı olarak saklanır.</p>
                </div>
              </div>
              <Badge tone={aiStatus?.configured ? "success" : "muted"}>
                {aiStatus?.configured ? "AI destekli" : "Deterministik mod"}
              </Badge>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
              {messages.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                  <p className="text-sm text-muted-foreground">
                    Henüz mesaj yok. Aşağıdaki hazır sorulardan biriyle başlayın.
                  </p>
                  <div className="flex max-w-md flex-wrap justify-center gap-2">
                    {QUICK_COMMANDS.map((command) => (
                      <Button
                        key={command}
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => void send(command)}
                      >
                        {command}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={message.role === "USER" ? "flex justify-end" : "flex justify-start"}
                  >
                    <div
                      className={
                        message.role === "USER"
                          ? "flex max-w-[85%] flex-col gap-1 rounded-xl bg-primary/25 px-3.5 py-2.5"
                          : "flex max-w-[85%] flex-col gap-1 rounded-xl border border-border-subtle bg-surface-2/60 px-3.5 py-2.5"
                      }
                    >
                      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {message.role === "USER" ? (
                          <>
                            <IconUser width={11} height={11} />
                            Siz
                          </>
                        ) : (
                          <>
                            <IconSparkles width={11} height={11} />
                            Asistan
                          </>
                        )}
                      </div>
                      <ChatText content={message.content} />
                      <p className="text-right text-[10px] text-muted-foreground">
                        {formatDate(message.createdAt)}
                      </p>
                    </div>
                  </div>
                ))
              )}
              {pending ? (
                <div className="flex justify-start">
                  <div className="rounded-xl border border-border-subtle bg-surface-2/60 px-3.5 py-2.5 text-sm text-muted-foreground">
                    <span className="inline-flex gap-1">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:300ms]" />
                    </span>
                  </div>
                </div>
              ) : null}
              <div ref={endRef} />
            </div>

            {error ? (
              <p className="mx-4 mb-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            ) : null}

            <div className="border-t border-border-subtle px-4 py-3">
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void send(draft);
                }}
              >
                <input
                  className="h-10 flex-1 rounded-lg border border-border-subtle bg-surface-2 px-3 text-sm placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Sorunuzu yazın… (örn: hangi alanlar farklı davranıyor?)"
                  value={draft}
                  disabled={pending}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <Button type="submit" disabled={pending || !draft.trim()}>
                  <IconSend />
                  Gönder
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
