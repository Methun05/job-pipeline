import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "@/lib/profile";

export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-6";

// ── Types (matches what ChatPanel sends — Gemini format) ───────────────────────

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

interface ChatMessage {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface JobContext {
  title: string;
  company: string;
  description?: string;
}

// ── Convert Gemini messages → Anthropic format ─────────────────────────────────

function toAnthropicMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  return messages.map(m => {
    const textParts  = m.parts.filter((p): p is { text: string } => "text" in p);
    const fileParts  = m.parts.filter((p): p is { inlineData: { mimeType: string; data: string } } => "inlineData" in p);
    const text       = textParts.map(p => p.text).join("").trim();

    if (!fileParts.length) {
      return { role: m.role === "model" ? "assistant" : "user", content: text || " " };
    }

    const content: Anthropic.ContentBlockParam[] = fileParts.map(p => {
      if (p.inlineData.mimeType === "application/pdf") {
        return {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: p.inlineData.data },
        } as Anthropic.ContentBlockParam;
      }
      return {
        type: "image",
        source: {
          type: "base64",
          media_type: p.inlineData.mimeType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
          data: p.inlineData.data,
        },
      } as Anthropic.ContentBlockParam;
    });

    if (text) content.push({ type: "text", text });

    return { role: m.role === "model" ? "assistant" : "user", content };
  });
}

// ── Route ──────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const { messages, jobContext }: { messages: ChatMessage[]; jobContext?: JobContext } =
    await req.json();

  if (!messages?.length) {
    return new Response("No messages provided.", { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response("ANTHROPIC_API_KEY is not configured.", { status: 500 });
  }

  let systemPrompt = buildSystemPrompt();
  if (jobContext?.title) {
    systemPrompt += `\n\n## Job you are applying for\nRole: ${jobContext.title}\nCompany: ${jobContext.company}${
      jobContext.description ? `\nJob description:\n${jobContext.description.substring(0, 3000)}` : ""
    }`;
  }

  const anthropicMessages = toAnthropicMessages(messages);

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: anthropicMessages,
  });

  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
