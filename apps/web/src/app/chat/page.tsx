"use client";

import { useEffect, useRef, useState } from "react";

import { IconSparkles } from "@/components/icons";
import { PageHeader } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api, ApiError } from "@/lib/api-client";
import { useProjects } from "@/lib/api-hooks";
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

export default function ChatPage() {
  const { data: projects } = useProjects();
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
  }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || !projectId) {
      return;
    }
    setError(null);
    setPending(true);
    try {
      const reply = await api.sendChat(Number(projectId), text);
      setMessages((previous) => [...previous, reply]);
      setDraft("");
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      setError(apiError?.message ?? "Mesaj gönderilemedi.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Proje Sohbeti"
        description="Gerçek proje verisiyle konuşun: bulgular, gereksinim kapsamı, kombinasyon testleri, PDF karşılaştırma. AI yapılandırılmadığında deterministik komut yorumlayıcısı aynı gerçek verilerle yanıt verir — asla uydurma."
      />

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <IconSparkles className="text-primary" />
              Asistan
            </CardTitle>
            <CardDescription>
              {projectId
                ? "Mesajlar kalıcı olarak saklanır."
                : "Başlamak için bir proje seçin."}
            </CardDescription>
          </div>
          <select
            className="h-9 rounded-lg border border-border-subtle bg-surface-2 px-3 text-sm"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          >
            <option value="">Proje seçin…</option>
            {(projects ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto rounded-lg bg-surface-2/30 p-3">
            {messages.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Henüz mesaj yok. Hızlı komutlardan biriyle başlayın.
              </p>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.role === "USER"
                      ? "ml-auto max-w-[80%] rounded-xl bg-primary/20 px-3 py-2 text-sm"
                      : "mr-auto max-w-[80%] rounded-xl bg-surface px-3 py-2 text-sm"
                  }
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  <p className="mt-1 text-right text-[10px] text-muted-foreground">
                    {formatDate(message.createdAt)}
                  </p>
                </div>
              ))
            )}
            <div ref={endRef} />
          </div>

          <div className="flex flex-wrap gap-2">
            {QUICK_COMMANDS.map((command) => (
              <Button
                key={command}
                size="sm"
                variant="ghost"
                disabled={!projectId || pending}
                onClick={() => void send(command)}
              >
                {command}
              </Button>
            ))}
          </div>

          {error ? (
            <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void send(draft);
            }}
          >
            <input
              className="h-9 flex-1 rounded-lg border border-border-subtle bg-surface-2 px-3 text-sm placeholder:text-muted-foreground/70"
              placeholder="Sorunuzu yazın… (örn: hangi alanlar farklı davranıyor?)"
              value={draft}
              disabled={!projectId || pending}
              onChange={(event) => setDraft(event.target.value)}
            />
            <Button type="submit" disabled={!projectId || pending || !draft.trim()}>
              {pending ? "Gönderiliyor…" : "Gönder"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
