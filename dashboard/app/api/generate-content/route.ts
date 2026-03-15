import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { buildSystemPrompt, PROFILE } from "@/lib/profile";

// Ensure the API key is available
const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export async function POST(req: Request) {
  if (!ai) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not set in environment variables." },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const { action, jobTitle, companyName, description, contactName, contactTitle, requirements } = body;

    if (!action || !jobTitle || !companyName) {
      return NextResponse.json(
        { error: "Missing required fields (action, jobTitle, companyName)" },
        { status: 400 }
      );
    }

    let prompt = "";

    const profile = buildSystemPrompt();

    const jobContext = `## Job you are writing for
Role: ${jobTitle} at ${companyName}
${contactName ? `Contact: ${contactName} (${contactTitle || "Hiring Manager"})` : ""}
${requirements ? `Key Requirements:\n${requirements}` : ""}
Job Description:
${description?.substring(0, 2500) || "No full description provided."}
`;

    switch (action) {
      case "generate_cover_letter":
        prompt = `${profile}

${jobContext}

Task: Write a cover letter (3-4 paragraphs).
- Open by referencing the company/product specifically. 
- Paragraph 2: relevant experience from my background. 
- Paragraph 3: why this specific role interests me. 
- Closing paragraph with a soft ask.
- Keep it specific to this role, not a generic template.
- Do NOT include placeholder brackets like [Your Name] — use the real name: ${PROFILE.name}.

Return ONLY the cover letter text, no markdown code blocks, no intro/outro conversational text.`;
        break;

      case "generate_email":
        prompt = `${profile}

${jobContext}

Task: Write a cold outreach email to the contact.
- 3-4 sentences maximum.
- Reference that I am applying/have applied to this role.
- Mention specific design experience that matches.
- Soft ask for a quick chat.

Return a JSON object with two keys: "subject" and "body".
Example: {"subject": "Senior Designer Role...", "body": "Hi..."}
Return ONLY the JSON.`;
        break;

      case "generate_linkedin":
        prompt = `${profile}

${jobContext}

Task: Write a LinkedIn connection note.
- Under 300 characters strictly.
- Reference: (1) applied to their job, (2) specific background match.
- Natural tone, not desperate.

Return ONLY the note text, no quotes.`;
        break;

      case "generate_summary":
        prompt = `${profile}

${jobContext}

Task: Analyze this job posting and extract structured information for a Product Designer evaluating it.

Return ONLY a JSON object with these exact keys:
{
  "location": "city/remote info extracted from description, or null if not mentioned",
  "salary": "salary or compensation range if mentioned, or null if not mentioned",
  "requirements": ["requirement 1", "requirement 2", "requirement 3"]
}

For requirements: exactly 3 strings, each the most important thing a Product Designer needs for this role.
For location: prefer info from the description over the job title. null if truly absent.
For salary: null if not mentioned at all.

Return ONLY the JSON object, no markdown, no explanation.`;
        break;

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });
    
    const text = response.text || "";

    // Parse JSON for email and summary
    if (action === "generate_email" || action === "generate_summary") {
      try {
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
        const cleanText = jsonMatch ? jsonMatch[1] : text;
        return NextResponse.json(JSON.parse(cleanText));
      } catch (e) {
        console.error("Failed to parse Gemini JSON output:", text);
         return NextResponse.json({ error: "Failed to parse AI response as JSON." }, { status: 500 });
      }
    }

    // Return raw text for cover letter and linkedin note
    return NextResponse.json({ text: text.trim() });

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate content." },
      { status: 500 }
    );
  }
}
