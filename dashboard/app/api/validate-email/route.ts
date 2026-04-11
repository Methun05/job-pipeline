import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!
  );
}

// Generate all email permutations from a name + domain
function generatePermutations(name: string, domain: string): string[] {
  const parts = name.trim().toLowerCase().split(/\s+/);
  const first = parts[0] ?? "";
  const last  = parts[parts.length - 1] ?? "";

  if (!first || !domain) return [];

  const perms: string[] = [];

  // Most common first
  perms.push(`${first}@${domain}`);                       // john@
  perms.push(`${first}.${last}@${domain}`);               // john.smith@
  perms.push(`${first[0]}${last}@${domain}`);             // jsmith@
  perms.push(`${first[0]}.${last}@${domain}`);            // j.smith@
  perms.push(`${first}${last}@${domain}`);                // johnsmith@
  perms.push(`${last}@${domain}`);                        // smith@
  perms.push(`${last}.${first}@${domain}`);               // smith.john@

  // Deduplicate (e.g. if first === last)
  return [...new Set(perms)];
}

export type PermutationResult = {
  email:      string;
  status:     "valid" | "invalid" | "catch-all" | "unknown" | "pending" | "skipped";
  sub_status: string | null;
};

// ZeroBounce v2 status values — spamtrap/abuse/do_not_mail mean "never email", treat as invalid
const ZB_INVALID_STATUSES = new Set(["spamtrap", "abuse", "do_not_mail"]);

async function validateWithZeroBounce(email: string, apiKey: string): Promise<Pick<PermutationResult, "status" | "sub_status">> {
  try {
    const url = `https://api.zerobounce.net/v2/validate?api_key=${apiKey}&email=${encodeURIComponent(email)}&ip_address=`;
    console.log(`[zerobounce] validating ${email} (1 credit used)`);
    const res  = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const data = await res.json();

    if (data.error) {
      console.warn("[zerobounce] error:", data.error);
      return { status: "unknown", sub_status: data.error };
    }

    const rawStatus: string = data.status ?? "";

    // spamtrap / abuse / do_not_mail → treat as invalid (never email these)
    if (ZB_INVALID_STATUSES.has(rawStatus)) {
      return { status: "invalid", sub_status: data.sub_status ?? rawStatus };
    }

    const status = (["valid", "invalid", "catch-all", "unknown"].includes(rawStatus)
      ? rawStatus
      : "unknown") as PermutationResult["status"];

    return {
      status,
      sub_status: data.sub_status ?? null,
    };
  } catch (e: any) {
    console.warn("[zerobounce] fetch failed:", e.message);
    return { status: "unknown", sub_status: "timeout" };
  }
}

export async function POST(req: NextRequest) {
  try {
    const { contact_id, contact_name, domain } = await req.json();

    if (!contact_name || !domain) {
      return NextResponse.json({ error: "contact_name and domain are required" }, { status: 400 });
    }

    const permutations = generatePermutations(contact_name, domain);

    if (permutations.length === 0) {
      return NextResponse.json({ error: "Could not generate permutations from name" }, { status: 400 });
    }

    const apiKey = process.env.ZEROBOUNCE_API_KEY;
    const results: PermutationResult[] = [];

    for (const email of permutations) {
      if (apiKey) {
        const validation = await validateWithZeroBounce(email, apiKey);
        results.push({ email, ...validation });

        // Stop as soon as we find a definitively valid one
        if (validation.status === "valid") break;
      } else {
        // No API key — return permutations without validation
        results.push({ email, status: "pending", sub_status: null });
      }
    }

    // Pick best email: prefer valid > catch-all > unknown > pending
    const priority = ["valid", "catch-all", "unknown", "pending"];
    const best = results.find(r => r.status === "valid")
      ?? results.find(r => r.status === "catch-all")
      ?? results.find(r => r.status === "unknown")
      ?? results[0];

    // Save permutations to DB if we have a contact_id
    if (contact_id) {
      const supabase = getSupabase();
      const updates: Record<string, any> = {
        email_permutations: results.map(r => r.email),
      };
      // Auto-set email to first valid result
      if (best && ["valid", "catch-all"].includes(best.status)) {
        updates.email = best.email;
      }
      await supabase.from("contacts").update(updates).eq("id", contact_id);
    }

    return NextResponse.json({
      permutations: results,
      best_email:   best?.email ?? null,
      validated:    !!apiKey,
    });
  } catch (err: any) {
    console.error("[validate-email]", err);
    return NextResponse.json({ error: err.message || "Failed to generate permutations" }, { status: 500 });
  }
}
