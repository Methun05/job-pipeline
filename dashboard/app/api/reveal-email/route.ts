/**
 * Proxy endpoint for email reveal.
 * 1. Try Apollo /people/match (if apollo_person_id available)
 * 2. Fallback to Hunter.io email finder (if contact_name + contact_domain available)
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

  const { apollo_person_id, contact_id, contact_name, contact_domain, company_name } = await req.json();
  if (!contact_id) {
    return NextResponse.json({ error: "Missing contact_id" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  let email: string | null = null;
  let source: "apollo" | "hunter" | null = null;

  // ── Step 1: Apollo ─────────────────────────────────────────────────────────
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
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            api_key:                  process.env.APOLLO_API_KEY,
            id:                       apollo_person_id,
            reveal_personal_emails:   false,
            reveal_phone_number:      false,
          }),
        });
        const data = await apolloRes.json();
        email = data?.person?.email ?? null;

        if (email) {
          source = "apollo";
          // Decrement Apollo credits
          await supabase.from("settings").update({
            value: String(Math.max(0, credits - 1)),
          }).eq("key", "apollo_credits_remaining");
        }
      } catch {
        // Apollo failed — fall through to Hunter
      }
    }
  }

  // ── Step 2: Hunter.io fallback ──────────────────────────────────────────────
  if (!email && contact_name && process.env.HUNTER_API_KEY) {
    try {
      // Resolve domain: use provided domain, or ask Hunter to find it by company name
      let resolvedDomain = contact_domain
        ? contact_domain.replace(/^https?:\/\//, "").replace(/\/$/, "")
        : null;

      if (!resolvedDomain && company_name) {
        const companyRes  = await fetch(
          `https://api.hunter.io/v2/companies/find?company=${encodeURIComponent(company_name)}&api_key=${process.env.HUNTER_API_KEY}`
        );
        const companyData = await companyRes.json();
        resolvedDomain    = companyData?.data?.domain ?? null;
      }

      if (resolvedDomain) {
        const nameParts  = contact_name.trim().split(" ");
        const first_name = nameParts[0] || "";
        const last_name  = nameParts.slice(1).join(" ") || "";

        const hunterRes  = await fetch(
          `https://api.hunter.io/v2/email-finder?domain=${encodeURIComponent(resolvedDomain)}&first_name=${encodeURIComponent(first_name)}&last_name=${encodeURIComponent(last_name)}&api_key=${process.env.HUNTER_API_KEY}`
        );
        const hunterData = await hunterRes.json();
        email = hunterData?.data?.email ?? null;
        if (email) source = "hunter";
      }
    } catch {
      // Hunter failed — fall through to not-found
    }
  }

  if (!email) {
    return NextResponse.json(
      { error: "Email not found via Apollo or Hunter.io" },
      { status: 404 }
    );
  }

  // ── Save to DB ──────────────────────────────────────────────────────────────
  await supabase.from("contacts").update({
    email,
    email_revealed:    true,
    email_revealed_at: new Date().toISOString(),
  }).eq("id", contact_id);

  return NextResponse.json({ email, source });
}
