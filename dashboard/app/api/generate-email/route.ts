import Anthropic from "@anthropic-ai/sdk";
import { EMAIL_TEMPLATES } from "@/lib/email-templates";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const { contactName, companyName, companyType, productName, track } = await req.json();

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const templatesText = EMAIL_TEMPLATES.map(t =>
    `TEMPLATE ${t.id.toUpperCase()} (best for track ${t.track}):\nSubject: ${t.subject}\nBody:\n${t.body}`
  ).join("\n\n---\n\n");

  const systemPrompt = `You are a cold email assistant for Methun Ramar, a Product Designer at Rampnow (crypto onramp/offramp platform).

Your job: pick one template and personalize ONLY the placeholders. Do NOT rewrite, restructure, or add anything.

STRICT RULES:
- Never use em dashes (—) anywhere — use commas or periods instead
- Never include numbers
- Never add a signature or name sign-off at the end
- [Name]: replace with contact's first name if provided. If unknown, replace with "there"
- [product]: replace only if you are confident about the company's specific product/app name. If unsure, replace with empty string and use the fallback subject "quick thought" instead
- Do not add any sentence, phrase, or word not present in the original template
- Return ONLY a raw JSON object — no markdown, no code blocks

Template selection:
- Track A (funded company outreach): prefer T1
- Track B (job posting outreach): prefer T2
- Thin context or unknown track: use T3

Return format:
{"subject":"...","body":"...","template_used":"t1"|"t2"|"t3"}`;

  const userMessage = `Company: ${companyName || "unknown"}
Company type: ${companyType || "unknown"}
Product name: ${productName || "unknown"}
Contact first name: ${contactName ? contactName.split(" ")[0] : "unknown"}
Track: ${track || "unknown"}

Templates:
${templatesText}

Pick the best template and personalize it. Return raw JSON only.`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text.trim() : "";
    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed.subject || !parsed.body) {
      return Response.json({ error: "Claude returned incomplete data" }, { status: 500 });
    }

    return Response.json(parsed);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
