/**
 * Proxy endpoint for email reveal.
 * 1. Apollo /people/match (if apollo_person_id + credits)
 * 2. Hunter.io email-finder with LinkedIn profile URL (if contact_linkedin_url)
 * 3. Hunter.io email-finder with name + domain
 * 4. Exa — search company website for publicly listed email
 * Keeps all API keys server-side only.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  // Auth check
  const auth = req.cookies.get("dashboard_auth")?.value;
  if (!auth || auth !== process.env.DASHBOARD_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    apollo_person_id, contact_id, contact_name, contact_domain,
    company_name, contact_linkedin_url,
  } = await req.json();

  if (!contact_id) {
    return NextResponse.json({ error: "Missing contact_id" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  let email: string | null = null;
  let source: "apollo" | "hunter" | "exa" | null = null;

  // ── Resolve domain (used by Hunter + Exa) ─────────────────────────────────────
  const resolvedDomain: string | null = contact_domain
    ? contact_domain.replace(/^https?:\/\//, "").replace(/\/$/, "")
    : null;

  // ── Step 1: Apollo ─────────────────────────────────────────────────────────────
  if (apollo_person_id && process.env.APOLLO_API_KEY) {
    const { data: settings } = await supabase
      .from("settings")
      .select("key, value")
      .eq("key", "apollo_credits_remaining");

    const rawCredits = settings?.[0]?.value;
    const credits    = rawCredits ? parseInt(rawCredits) : NaN;
    // If credits unreadable, assume available (don't silently skip Apollo)
    const apolloAvailable = isNaN(credits) || credits > 0;

    if (apolloAvailable) {
      try {
        const apolloRes = await fetch("https://api.apollo.io/v1/people/match", {
          method:  "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Api-Key":    process.env.APOLLO_API_KEY!,
          },
          body: JSON.stringify({
            id:                     apollo_person_id,
            reveal_personal_emails: false,
            reveal_phone_number:    false,
          }),
        });
        const data = await apolloRes.json();
        email = data?.person?.email ?? null;

        if (email) {
          source = "apollo";
          await supabase.from("settings").update({
            value: String(Math.max(0, credits - 1)),
          }).eq("key", "apollo_credits_remaining");
        }
      } catch {
        // Apollo failed — fall through
      }
    }
  }

  // ── Step 2: Hunter — LinkedIn profile URL ──────────────────────────────────────
  if (!email && contact_linkedin_url && process.env.HUNTER_API_KEY) {
    try {
      const hunterRes  = await fetch(
        `https://api.hunter.io/v2/email-finder?profile=${encodeURIComponent(contact_linkedin_url)}&api_key=${process.env.HUNTER_API_KEY}`
      );
      const hunterData = await hunterRes.json();
      email = hunterData?.data?.email ?? null;
      if (email) source = "hunter";
    } catch {
      // Hunter profile lookup failed — fall through
    }
  }

  // ── Step 3: Hunter — name + domain ────────────────────────────────────────────
  if (!email && contact_name && resolvedDomain && process.env.HUNTER_API_KEY) {
    try {
      const nameParts  = contact_name.trim().split(" ");
      const first_name = nameParts[0] || "";
      const last_name  = nameParts.slice(1).join(" ") || "";
      if (!last_name) throw new Error("single-name contact — Hunter skipped");

      const hunterRes  = await fetch(
        `https://api.hunter.io/v2/email-finder?domain=${encodeURIComponent(resolvedDomain)}&first_name=${encodeURIComponent(first_name)}&last_name=${encodeURIComponent(last_name)}&api_key=${process.env.HUNTER_API_KEY}`
      );
      const hunterData = await hunterRes.json();
      email = hunterData?.data?.email ?? null;
      if (email) source = "hunter";
    } catch {
      // Hunter name+domain failed — fall through
    }
  }

  // ── Step 4: Exa — search company pages for publicly listed email ───────────────
  if (!email && contact_name && process.env.EXA_API_KEY) {
    try {
      const searchQuery = resolvedDomain
        ? `"${contact_name}" email`
        : `"${contact_name}" "${company_name || ""}" email`;

      const exaBody: Record<string, unknown> = {
        query:      searchQuery,
        numResults: 5,
        contents:   { text: { maxCharacters: 3000 } },
      };
      if (resolvedDomain) exaBody.includeDomains = [resolvedDomain];

      const exaRes    = await fetch("https://api.exa.ai/search", {
        method:  "POST",
        headers: { "Content-Type": "application/json", "x-api-key": process.env.EXA_API_KEY! },
        body:    JSON.stringify(exaBody),
      });
      const exaData   = await exaRes.json();
      const results   = exaData?.results || [];

      const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
      // Skip generic addresses that are never personal emails
      const genericPrefixes = new Set(["noreply", "no-reply", "support", "info", "hello", "contact", "admin", "team", "press", "media", "jobs", "careers"]);

      for (const result of results) {
        const text      = (result.text || "") + " " + (result.title || "");
        const allEmails = [...(text.match(emailRegex) || [])];
        const candidate = resolvedDomain
          ? allEmails.find(e =>
              e.toLowerCase().endsWith(`@${resolvedDomain.toLowerCase()}`) &&
              !genericPrefixes.has(e.split("@")[0].toLowerCase())
            )
          : allEmails.find(e => !genericPrefixes.has(e.split("@")[0].toLowerCase()));
        if (candidate) {
          email  = candidate.toLowerCase();
          source = "exa";
          break;
        }
      }
    } catch {
      // Exa failed — fall through to not-found
    }
  }

  if (!email) {
    return NextResponse.json(
      { error: "Email not found via Apollo, Hunter.io, or Exa" },
      { status: 404 }
    );
  }

  // ── Save to DB ────────────────────────────────────────────────────────────────
  await supabase.from("contacts").update({
    email,
    email_revealed:    true,
    email_revealed_at: new Date().toISOString(),
  }).eq("id", contact_id);

  return NextResponse.json({ email, source });
}
