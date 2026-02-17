import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {

  // 🔐 Autoriser uniquement les vrais crons Vercel
  const cronHeader = req.headers.get("x-vercel-cron");

  if (cronHeader !== "1") {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );


  const { data: users } = await supabase
    .from("notification_settings")
    .select("*")
    .eq("daily_summary", true);

  if (!users) return NextResponse.json({ ok: true });

  for (const user of users) {
    const { data: tasks } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", user.user_id)
      .eq("archived", false);

    const pro = tasks?.filter(t => t.type === "pro").length || 0;
    const perso = tasks?.filter(t => t.type === "perso").length || 0;

    const overdue =
      tasks?.filter(
        t =>
          t.deadline &&
          new Date(t.deadline) < new Date()
      ).length || 0;

    await supabase.from("notifications").insert({
      user_id: user.user_id,
      title: "📊 Résumé quotidien",
      message: `${pro} PRO • ${perso} PERSO • ${overdue} en retard`,
      read: false
    });
  }

  return NextResponse.json({ ok: true });
}
