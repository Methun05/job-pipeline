import { GoogleGenAI } from "@google/genai";
import { buildSystemPrompt } from "@/lib/profile";

export const maxDuration = 60;

const apiKey = process.env.GEMINI_API_KEY_CHAT;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

type Part =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

interface ChatMessage {
  role: "user" | "model";
  parts: Part[];
}

interface JobContext {
  title: string;
  company: string;
  description?: string;
}

export async function POST(req: Request) {
  if (!ai) {
    return new Response("GEMINI_API_KEY_CHAT is not configured.", { status: 500 });
  }

  const { messages, jobContext }: { messages: ChatMessage[]; jobContext?: JobContext } =
    await req.json();

  if (!messages?.length) {
    return new Response("No messages provided.", { status: 400 });
  }

  // Build system instruction from master profile + optional job context
  let systemInstruction = buildSystemPrompt();
  if (jobContext?.title) {
    systemInstruction += `\n\n## Job you are applying for\nRole: ${jobContext.title}\nCompany: ${jobContext.company}${jobContext.description ? `\nJob description:\n${jobContext.description.substring(0, 3000)}` : ""}`;
  }

  try {
    const stream = await ai.models.generateContentStream({
      model: "gemini-2.0-flash",
      contents: messages,
      config: { systemInstruction },
    });

    const readable = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of stream) {
            const text = chunk.text;
            if (text) controller.enqueue(encoder.encode(text));
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
    console.error("Gemini chat error:", err);
    return new Response(err?.message || "Gemini request failed.", { status: 500 });
  }
}
