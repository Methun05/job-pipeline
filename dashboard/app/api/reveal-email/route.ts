/**
 * Proxy endpoint for email reveal.
 * 1. Try Apollo /people/match (if apollo_person_id available)
 * 2. Fallback to Snov.io email finder (if first_name + last_name + domain available)
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

  const { apollo_person_id, contact_id, contact_name, contact_domain } = await req.json();
  if (!contact_id) {
    return NextResponse.json({ error: "Missing contact_id" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  let email: string | null = null;
  let source: "apollo" | "snov" | null = null;

  // ── Step 1: Apollo ─────────────────────────────────────────────────────────
  if (apollo_person_id && process.env.APOLLO_API_KEY) {
    const { data: settings } = await supabase
      .from("settings")
      .select("key, value")
      .eq("key", "apollo_credits_remaining");

    const credits = parseInt(settings?.[0]?.value || "0");

    if (credits > 0) {
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
        // Apollo failed — fall through to Snov
      }
    }
  }

  // ── Step 2: Snov.io fallback ────────────────────────────────────────────────
  if (!email && contact_name && contact_domain &&
      process.env.SNOV_CLIENT_ID && process.env.SNOV_CLIENT_SECRET) {
    try {
      // Get Snov access token
      const tokenRes = await fetch("https://api.snov.io/v1/oauth/access_token", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          grant_type:    "client_credentials",
          client_id:     process.env.SNOV_CLIENT_ID,
          client_secret: process.env.SNOV_CLIENT_SECRET,
        }),
      });
      const tokenData = await tokenRes.json();
      const snovToken = tokenData?.access_token;

      if (snovToken) {
        const nameParts  = contact_name.trim().split(" ");
        const first_name = nameParts[0] || "";
        const last_name  = nameParts.slice(1).join(" ") || "";
        // Strip protocol from domain
        const domain = contact_domain.replace(/^https?:\/\//, "").replace(/\/$/, "");

        const snovRes = await fetch("https://api.snov.io/v1/get-emails-from-name", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ first_name, last_name, domain, access_token: snovToken }),
        });
        const snovData = await snovRes.json();
        const emails = (snovData?.data?.emails ?? snovData?.emails ?? []) as Array<{ email: string; emailStatus: string }>;
        const valid  = emails.filter(e => ["valid", "all"].includes(e.emailStatus));
        email  = (valid.length ? valid[0] : emails[0])?.email ?? null;
        if (email) source = "snov";
      }
    } catch {
      // Snov failed — fall through to not-found
    }
  }

  if (!email) {
    return NextResponse.json(
      { error: "Email not found via Apollo or Snov.io" },
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
