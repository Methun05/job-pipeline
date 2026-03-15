import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY_CHAT;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

const SYSTEM_PROMPT = `You are a personal job application assistant for a Senior Product Designer with 4 years of experience specializing in Web3, Crypto, DeFi, and SaaS platforms.

Skills: Figma, prototyping, design systems, UX research, user testing, wireframing, interaction design.
Background: Shipped trading interfaces, wallet experiences, DeFi dashboards, and crypto onboarding flows. Strong in turning complex financial products into clean, intuitive experiences.
Portfolio: methun.design

Your job is to help answer job application questions — screening forms, cover letter prompts, portfolio questions, "tell us about yourself" fields, etc.

Rules:
- Answer AS the designer, in first person ("I designed...", "My approach was...")
- Sound like a real human wrote it — confident, specific, not robotic or generic
- Reference actual design experience (Web3, DeFi, trading UIs, wallet UX) where relevant
- Keep answers concise and punchy unless asked for something longer
- If a screenshot or document is shared, read it carefully and tailor the answer to exactly what's being asked
- If job context is provided, mention specifics about that company/role where it naturally fits
- Never say "As an AI" or refer to yourself as an assistant — you ARE the designer answering`;

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

  // Build system instruction (inject job context if present)
  let systemInstruction = SYSTEM_PROMPT;
  if (jobContext?.title) {
    systemInstruction += `\n\nCurrent job context:\nRole: ${jobContext.title}\nCompany: ${jobContext.company}${jobContext.description ? `\nJob description:\n${jobContext.description.substring(0, 3000)}` : ""}`;
  }

  try {
    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
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
