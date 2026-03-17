import { buildSystemPrompt } from "@/lib/profile";

export const maxDuration = 60;

// ── Provider config ────────────────────────────────────────────────────────────
// To switch back to Gemini: set PROVIDER = "gemini" and ensure GEMINI_API_KEY_CHAT is set.

const PROVIDER = "openrouter"; // "openrouter" | "gemini"

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL   = "qwen/qwen3.5-9b";

// const GEMINI_API_KEY  = process.env.GEMINI_API_KEY_CHAT;
// const GEMINI_MODEL    = "gemini-2.0-flash";

// ── Types ──────────────────────────────────────────────────────────────────────

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

// ── Helpers ────────────────────────────────────────────────────────────────────

// Convert Gemini-format messages → OpenAI-format (used by OpenRouter)
function toOpenAIMessages(messages: ChatMessage[]) {
  return messages.map(m => {
    const hasImages = m.parts.some(p => "inlineData" in p);

    if (hasImages) {
      const content = m.parts.map(p => {
        if ("inlineData" in p) {
          return {
            type: "image_url",
            image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` },
          };
        }
        return { type: "text", text: (p as { text: string }).text || "" };
      });
      return { role: m.role === "model" ? "assistant" : "user", content };
    }

    const text = m.parts.map(p => ("text" in p ? p.text : "")).join("");
    return { role: m.role === "model" ? "assistant" : "user", content: text };
  });
}

// ── Route ──────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const { messages, jobContext }: { messages: ChatMessage[]; jobContext?: JobContext } =
    await req.json();

  if (!messages?.length) {
    return new Response("No messages provided.", { status: 400 });
  }

  // Build system prompt
  let systemPrompt = buildSystemPrompt();
  if (jobContext?.title) {
    systemPrompt += `\n\n## Job you are applying for\nRole: ${jobContext.title}\nCompany: ${jobContext.company}${
      jobContext.description ? `\nJob description:\n${jobContext.description.substring(0, 3000)}` : ""
    }`;
  }

  if (PROVIDER === "openrouter") {
    return openRouterChat(messages, systemPrompt);
  }

  // Gemini fallback (disabled — uncomment GEMINI imports above to re-enable)
  return new Response("Gemini provider is currently disabled. Set PROVIDER to 'openrouter'.", { status: 503 });
}

// ── OpenRouter handler ─────────────────────────────────────────────────────────

async function openRouterChat(messages: ChatMessage[], systemPrompt: string) {
  if (!OPENROUTER_API_KEY) {
    return new Response("OPENROUTER_API_KEY is not configured.", { status: 500 });
  }

  const openAIMessages = [
    { role: "system", content: systemPrompt },
    ...toOpenAIMessages(messages),
  ];

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://tracker.methun.design",
        "X-Title": "Methun Job Tracker",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: openAIMessages,
        stream: true,
        reasoning: { exclude: true }, // disable thinking to prevent timeout
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return new Response(err, { status: res.status });
    }

    // Parse OpenAI SSE stream and forward plain text
    const readable = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const reader  = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer    = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;

              try {
                const json = JSON.parse(data);
                const text = json.choices?.[0]?.delta?.content;
                if (text) controller.enqueue(encoder.encode(text));
              } catch {
                // ignore malformed chunks
              }
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
  } catch (err: any) {
    console.error("OpenRouter chat error:", err);
    return new Response(err?.message || "OpenRouter request failed.", { status: 500 });
  }
}

// ── Gemini handler (disabled) ──────────────────────────────────────────────────
//
// async function geminiChat(messages: ChatMessage[], systemPrompt: string) {
//   const { GoogleGenAI } = await import("@google/genai");
//   if (!GEMINI_API_KEY) return new Response("GEMINI_API_KEY_CHAT is not configured.", { status: 500 });
//
//   const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
//   const stream = await ai.models.generateContentStream({
//     model: GEMINI_MODEL,
//     contents: messages,
//     config: { systemInstruction: systemPrompt },
//   });
//
//   const readable = new ReadableStream({
//     async start(controller) {
//       const encoder = new TextEncoder();
//       try {
//         for await (const chunk of stream) {
//           const text = chunk.text;
//           if (text) controller.enqueue(encoder.encode(text));
//         }
//       } finally {
//         controller.close();
//       }
//     },
//   });
//
//   return new Response(readable, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
// }
