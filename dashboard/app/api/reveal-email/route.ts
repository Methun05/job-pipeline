/**
 * Proxy endpoint for Apollo email reveal.
 * Keeps APOLLO_API_KEY server-side only.
 * Called from dashboard when user clicks [Find Email].
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  // Auth check
  const auth = req.cookies.get("dashboard_auth")?.value;
  if (!auth || auth !== process.env.DASHBOARD_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { apollo_person_id, contact_id } = await req.json();
  if (!apollo_person_id || !contact_id) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  // Check current credit balance
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const { data: settings } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", ["apollo_credits_remaining"]);

  const credits = parseInt(
    settings?.find((s: { key: string }) => s.key === "apollo_credits_remaining")?.value || "0"
  );

  if (credits <= 0) {
    return NextResponse.json({ error: "No Apollo credits remaining" }, { status: 402 });
  }

  // Call Apollo /people/match
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
    const email = data?.person?.email;

    if (!email) {
      return NextResponse.json({ error: "Email not found for this person" }, { status: 404 });
    }

    // Update contact in DB
    await supabase.from("contacts").update({
      email,
      email_revealed:    true,
      email_revealed_at: new Date().toISOString(),
    }).eq("id", contact_id);

    // Decrement credits in settings
    await supabase.from("settings").update({
      value: String(Math.max(0, credits - 1)),
    }).eq("key", "apollo_credits_remaining");

    return NextResponse.json({ email, credits_remaining: credits - 1 });
  } catch (err) {
    return NextResponse.json({ error: "Apollo API error" }, { status: 500 });
  }
}
