import { NextResponse } from "next/server";
import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import fs from "fs";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!
  );
}

function getOAuthClient() {
  // On Vercel: read from env var. Locally: read from file.
  let tokenData: any;

  if (process.env.GMAIL_TOKEN) {
    tokenData = JSON.parse(process.env.GMAIL_TOKEN);
  } else {
    const tokenPath = path.join(process.cwd(), "..", "gmail_token.json");
    tokenData = JSON.parse(fs.readFileSync(tokenPath, "utf-8"));
  }

  const oauth2Client = new google.auth.OAuth2(
    tokenData.client_id,
    tokenData.client_secret,
    "urn:ietf:wg:oauth:2.0:oob"
  );

  oauth2Client.setCredentials({
    access_token:  tokenData.token,
    refresh_token: tokenData.refresh_token,
  });

  return oauth2Client;
}

function makeRawEmail(to: string, subject: string, body: string): string {
  const from = process.env.GMAIL_SENDER_EMAIL || "me";
  const email = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    `MIME-Version: 1.0`,
    ``,
    body,
  ].join("\n");

  return Buffer.from(email).toString("base64url");
}

export async function GET() {
  try {
    const auth = getOAuthClient();
    const gmail = google.gmail({ version: "v1", auth });
    const supabase = getSupabase();

    // 1. Query Gmail for MAILER-DAEMON bounce messages from the last 2 hours
    const listRes = await gmail.users.messages.list({
      userId: "me",
      q: "from:mailer-daemon newer_than:2h",
    });

    const messages = listRes.data.messages ?? [];

    if (messages.length === 0) {
      return NextResponse.json({ checked: 0, bounces_found: 0, message: "No bounces in last 2h" });
    }

    // 2. Collect all threadIds from bounce messages
    const bounceThreadIds = new Set<string>();
    for (const msg of messages) {
      if (!msg.id) continue;
      const full = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "metadata",
        metadataHeaders: ["Subject"],
      });
      const threadId = full.data.threadId;
      if (threadId) bounceThreadIds.add(threadId);
    }

    if (bounceThreadIds.size === 0) {
      return NextResponse.json({ checked: messages.length, bounces_found: 0, message: "No thread IDs found in bounce messages" });
    }

    // 3. For each bounced thread ID, find the matching funded_lead
    const results: Array<{ lead_id: string; action: string; next_email?: string }> = [];

    for (const threadId of bounceThreadIds) {
      // Find the funded_lead with this gmail_thread_id
      const { data: leads, error: leadError } = await supabase
        .from("funded_leads")
        .select("id, contact_id, outreach_email, email_status, email_permutation_idx, email_draft")
        .eq("gmail_thread_id", threadId)
        .limit(1);

      if (leadError || !leads || leads.length === 0) {
        // No lead matched this thread — skip
        continue;
      }

      const lead = leads[0];

      // Skip if already processed to not_found or still in a non-sent state
      if (lead.email_status === "not_found") {
        continue;
      }

      // 4. Get the contact's email_permutations
      let permutations: string[] = [];
      if (lead.contact_id) {
        const { data: contact } = await supabase
          .from("contacts")
          .select("email_permutations")
          .eq("id", lead.contact_id)
          .single();

        if (contact?.email_permutations && Array.isArray(contact.email_permutations)) {
          permutations = contact.email_permutations;
        }
      }

      const currentIdx: number = lead.email_permutation_idx ?? 0;
      const nextIdx = currentIdx + 1;

      // 5. Try next permutation if available
      if (permutations.length > 0 && nextIdx < permutations.length) {
        const nextEmail = permutations[nextIdx];

        // Send email to next permutation using the existing email_draft body
        const subject = "Reaching out about design opportunities";
        const body = lead.email_draft ?? "";

        const raw = makeRawEmail(nextEmail, subject, body);

        const sendRes = await gmail.users.messages.send({
          userId: "me",
          requestBody: { raw },
        });

        const newThreadId  = sendRes.data.threadId ?? null;
        const newMessageId = sendRes.data.id ?? null;

        // Update the lead: increment idx, update outreach_email, mark bounced, store new thread
        await supabase
          .from("funded_leads")
          .update({
            email_permutation_idx: nextIdx,
            outreach_email:        nextEmail,
            email_status:          "bounced",
            gmail_thread_id:       newThreadId,
            email_sent_at:         new Date().toISOString(),
          })
          .eq("id", lead.id);

        results.push({
          lead_id:    lead.id,
          action:     "retried",
          next_email: nextEmail,
        });

        console.log(`[check-bounces] Lead ${lead.id}: bounced → retried with ${nextEmail} (thread ${newMessageId})`);
      } else {
        // No more permutations — mark as not_found
        await supabase
          .from("funded_leads")
          .update({
            email_status: "not_found",
          })
          .eq("id", lead.id);

        results.push({
          lead_id: lead.id,
          action:  "not_found",
        });

        console.log(`[check-bounces] Lead ${lead.id}: bounced → no more permutations, marked not_found`);
      }
    }

    return NextResponse.json({
      checked:       messages.length,
      bounces_found: bounceThreadIds.size,
      processed:     results.length,
      results,
    });
  } catch (err: any) {
    console.error("[check-bounces]", err);
    return NextResponse.json({ error: err.message || "Failed to check bounces" }, { status: 500 });
  }
}
