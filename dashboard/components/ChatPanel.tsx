"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Send, Paperclip, X, Loader2 } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FilePart {
  name: string;
  mimeType: string;
  data: string; // base64
}

interface Message {
  role: "user" | "model";
  text: string;
  files?: FilePart[];
}

export interface JobContext {
  title: string;
  company: string;
  description?: string;
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code class=\"bg-zinc-100 dark:bg-zinc-700 px-1 rounded text-xs font-mono\">$1</code>")
    .replace(/^### (.+)$/gm, "<p class=\"font-semibold text-sm mt-3 mb-1\">$1</p>")
    .replace(/^## (.+)$/gm, "<p class=\"font-semibold text-sm mt-3 mb-1\">$1</p>")
    .replace(/^# (.+)$/gm, "<p class=\"font-semibold text-sm mt-3 mb-1\">$1</p>")
    .replace(/^[-*] (.+)$/gm, "<li class=\"ml-4 list-disc\">$1</li>")
    .replace(/^\d+\. (.+)$/gm, "<li class=\"ml-4 list-decimal\">$1</li>")
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
}

// ── File utils ────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const ACCEPTED = "image/png,image/jpeg,image/webp,image/gif,application/pdf";

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatPanel({ jobContext, initialMessage }: { jobContext?: JobContext; initialMessage?: string }) {
  const [messages, setMessages]         = useState<Message[]>([]);
  const [input, setInput]               = useState("");
  const [pendingFiles, setPendingFiles] = useState<FilePart[]>([]);
  const [streaming, setStreaming]       = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const textRef   = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (textRef.current) {
      textRef.current.style.height = "auto";
      textRef.current.style.height = Math.min(textRef.current.scrollHeight, 140) + "px";
    }
  }, [input]);

  // Auto-send initialMessage once on mount
  useEffect(() => {
    if (initialMessage) doSend(initialMessage, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    const parts: FilePart[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) { setError(`${file.name} is too large (max 10 MB)`); continue; }
      parts.push({ name: file.name, mimeType: file.type, data: await fileToBase64(file) });
    }
    setPendingFiles(prev => [...prev, ...parts]);
  }, []);

  async function doSend(text: string, files: FilePart[]) {
    if (!text && !files.length) return;
    if (streaming) return;

    setError(null);
    const userMsg: Message = { role: "user", text, files: files.length ? files : undefined };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setPendingFiles([]);
    setStreaming(true);

    const modelIdx = nextMessages.length;
    setMessages(prev => [...prev, { role: "model", text: "" }]);

    try {
      const contents = nextMessages.map(m => ({
        role: m.role,
        parts: [
          ...(m.files?.map(f => ({ inlineData: { mimeType: f.mimeType, data: f.data } })) ?? []),
          { text: m.text || " " },
        ],
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: contents, jobContext }),
      });

      if (!res.ok) throw new Error(await res.text() || "Request failed");

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        const snap = accumulated;
        setMessages(prev => prev.map((m, i) => i === modelIdx ? { ...m, text: snap } : m));
      }
    } catch (err: any) {
      setMessages(prev => prev.filter((_, i) => i !== modelIdx));
      setError(err.message || "Something went wrong.");
    } finally {
      setStreaming(false);
    }
  }

  async function sendMessage() {
    await doSend(input.trim(), pendingFiles);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const imageFiles: File[] = [];
    for (const item of Array.from(e.clipboardData?.items ?? [])) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const f = item.getAsFile();
        if (f) imageFiles.push(f);
      }
    }
    if (imageFiles.length) {
      const dt = new DataTransfer();
      imageFiles.forEach(f => dt.items.add(f));
      handleFiles(dt.files);
    }
  }

  return (
    <div className="flex flex-col h-full">

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2 py-8">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Ask anything about this job</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 max-w-xs">
              Paste a screening question, upload your resume, or screenshot a form — get a tailored answer based on your real experience.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} gap-2`}>
            {msg.role === "model" && (
              <div className="w-6 h-6 rounded-full bg-violet-600 flex items-center justify-center shrink-0 mt-1 text-white text-[10px] font-bold">M</div>
            )}
            <div className={`max-w-[80%] space-y-1.5`}>
              {msg.files?.map((f, fi) => (
                <div key={fi}>
                  {f.mimeType.startsWith("image/") ? (
                    <img src={`data:${f.mimeType};base64,${f.data}`} alt={f.name} className="max-h-40 rounded-lg border border-zinc-200 dark:border-zinc-700 object-contain" />
                  ) : (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                      <Paperclip className="w-3 h-3" />{f.name}
                    </div>
                  )}
                </div>
              ))}
              {(msg.text || msg.role === "model") && (
                <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-violet-600 text-white rounded-tr-sm"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 rounded-tl-sm"
                }`}>
                  {msg.role === "model" ? (
                    msg.text
                      ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }} />
                      : <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                  ) : (
                    <span style={{ whiteSpace: "pre-wrap" }}>{msg.text}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {error && (
          <div className="flex justify-center">
            <span className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-full">{error}</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 pt-3 border-t border-zinc-100 dark:border-zinc-800">
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {pendingFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-600 dark:text-zinc-300">
                {f.mimeType.startsWith("image/")
                  ? <img src={`data:${f.mimeType};base64,${f.data}`} alt={f.name} className="w-4 h-4 rounded object-cover" />
                  : <Paperclip className="w-3 h-3" />}
                <span className="max-w-[100px] truncate">{f.name}</span>
                <button onClick={() => setPendingFiles(prev => prev.filter((_, pi) => pi !== i))} className="text-zinc-400 hover:text-zinc-600"><X className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 focus-within:border-violet-400 dark:focus-within:border-violet-600 transition-colors">
          <button onClick={() => fileInput.current?.click()} className="shrink-0 p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors mb-0.5" title="Attach image or PDF">
            <Paperclip className="w-4 h-4" />
          </button>
          <input ref={fileInput} type="file" accept={ACCEPTED} multiple className="hidden" onChange={e => handleFiles(e.target.files)} />

          <textarea
            ref={textRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Paste a question or describe what you need…"
            rows={1}
            disabled={streaming}
            className="flex-1 resize-none bg-transparent text-sm text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 outline-none leading-relaxed py-0.5"
            style={{ minHeight: "24px", maxHeight: "140px" }}
          />

          <button
            onClick={sendMessage}
            disabled={(!input.trim() && !pendingFiles.length) || streaming}
            className="shrink-0 p-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors mb-0.5"
          >
            {streaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
        <p className="text-[10px] text-zinc-400 dark:text-zinc-600 mt-1.5 text-center">Enter to send · Shift+Enter for new line · Paste screenshots directly</p>
      </div>
    </div>
  );
}
