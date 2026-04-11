import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!
  );
}

export async function POST(req: NextRequest) {
  try {
    const { contact_id } = await req.json();
    if (!contact_id) {
      return NextResponse.json({ error: "contact_id required" }, { status: 400 });
    }
    const supabase = getSupabase();
    await supabase
      .from("contacts")
      .update({ email_status: "replied" })
      .eq("id", contact_id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed" }, { status: 500 });
  }
}
