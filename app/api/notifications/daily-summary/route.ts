import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {

  // 🔐 Autoriser uniquement Vercel Cron
  const cronHeader = req.headers.get("x-vercel-cron");
  if (cronHeader !== "1") {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date();
  const currentHour = now.getHours();

  const { data: users } = await supabase
    .from("notification_settings")
    .select("*")
    .eq("daily_summary", true);

  if (!users) return NextResponse.json({ ok: true });

  for (const user of users) {

    // ⏰ Respecter l'heure personnalisée
    if (user.summary_hour !== currentHour) continue;

    // 📅 Anti doublon résumé quotidien
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const { data: alreadySent } = await supabase
      .from("daily_summaries_log")
      .select("*")
      .eq("user_id", user.user_id)
      .gte("sent_at", startOfDay.toISOString());

    if (alreadySent && alreadySent.length > 0) continue;

    // 📋 Récupérer tâches actives
    const { data: tasks } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", user.user_id)
      .eq("archived", false);

    const pro = tasks?.filter(t => t.type === "pro").length || 0;
    const perso = tasks?.filter(t => t.type === "perso").length || 0;

    const overdueTasks =
      tasks?.filter(
        t => t.deadline && new Date(t.deadline) < now
      ) || [];

    const overdueCount = overdueTasks.length;

    // 📊 Création résumé
    await supabase.from("notifications").insert({
      user_id: user.user_id,
      type: "summary",
      title: "📊 Résumé quotidien",
      message: `${pro} PRO • ${perso} PERSO • ${overdueCount} en retard`,
      read: false,
    });

    await supabase.from("daily_summaries_log").insert({
      user_id: user.user_id,
    });

// 📆 Résumé des tâches pour demain

const tomorrow = new Date(now);
tomorrow.setDate(now.getDate() + 1);

const startTomorrow = new Date(tomorrow);
startTomorrow.setHours(0, 0, 0, 0);

const endTomorrow = new Date(tomorrow);
endTomorrow.setHours(23, 59, 59, 999);

const { data: tomorrowTasks } = await supabase
  .from("tasks")
  .select("*")
  .eq("user_id", user.user_id)
  .gte("deadline", startTomorrow.toISOString())
  .lte("deadline", endTomorrow.toISOString())
  .eq("archived", false);

if (tomorrowTasks && tomorrowTasks.length > 0) {

  const message = `${tomorrowTasks.length} tâche(s) prévue(s) demain`;

  await supabase.from("notifications").insert({
    user_id: user.user_id,
    type: "tomorrow",
    title: "📅 À faire demain",
    message,
    read: false,
  });

  // 🔔 Envoi push réel
  await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/push/trigger`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: user.user_id,
      title: "📅 À faire demain",
      message,
    }),
  });
}




    // 🔔 Gestion intelligente des deadlines (1 seule par tâche)
    for (const task of overdueTasks) {

      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", user.user_id)
        .eq("type", "deadline")
        .ilike("message", `%ID:${task.id}%`);

      if (existing && existing.length > 0) continue;

      await supabase.from("notifications").insert({
        user_id: user.user_id,
        type: "deadline",
        title: "⏰ Tâche en retard",
        message: `La tâche "${task.title}" est en retard. (ID:${task.id})`,
        read: false,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
