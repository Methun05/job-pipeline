import { NextRequest, NextResponse } from "next/server";
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

export async function POST(req: NextRequest) {
  try {
    const { lead_id, contact_id, to, subject, body } = await req.json();

    if (!lead_id || !to || !subject || !body) {
      return NextResponse.json({ error: "Missing required fields: lead_id, to, subject, body" }, { status: 400 });
    }

    const auth = getOAuthClient();
    const gmail = google.gmail({ version: "v1", auth });

    const raw = makeRawEmail(to, subject, body);

    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });

    const threadId  = response.data.threadId ?? null;
    const messageId = response.data.id ?? null;

    // Save send state to DB
    const supabase = getSupabase();
    await supabase
      .from("funded_leads")
      .update({
        outreach_email:  to,
        email_status:    "sent",
        email_sent_at:   new Date().toISOString(),
        gmail_thread_id: threadId,
      })
      .eq("id", lead_id);

    // Also track per-contact if contact_id provided
    if (contact_id) {
      await supabase
        .from("contacts")
        .update({
          outreach_email:  to,
          email_status:    "sent",
          email_sent_at:   new Date().toISOString(),
          gmail_thread_id: threadId,
        })
        .eq("id", contact_id);
    }

    return NextResponse.json({ success: true, message_id: messageId, thread_id: threadId });
  } catch (err: any) {
    console.error("[send-email]", err);
    return NextResponse.json({ error: err.message || "Failed to send email" }, { status: 500 });
  }
}
