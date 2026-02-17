import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ⚠️ Mets TON user id ici pour le test
  const userId = "63efeb2d-6b5f-486d-8163-7485b26b9329";

  const { error } = await supabase.from("notifications").insert({
    user_id: userId,
    type: "debug",
    title: "🔥 Test direct",
    message: "Insertion directe OK",
    read: false,
  });

  if (error) {
    return NextResponse.json({ error });
  }

  return NextResponse.json({ ok: true });
}
