import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {

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
  const todayStr = now.toISOString().split("T")[0];

  const { data: users } = await supabase
    .from("notification_settings")
    .select("*")
    .eq("daily_summary", true);

  if (!users) return NextResponse.json({ ok: true });

  for (const user of users) {

    if (user.summary_hour !== currentHour) continue;

    const { data: tasks } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", user.user_id)
      .eq("archived", false);

    if (!tasks) continue;

    // Filter: only non-completed tasks
    const activeTasks = tasks.filter(t => t.status !== "completed");

    const pro = activeTasks.filter(t => t.type === "pro").length;
    const perso = activeTasks.filter(t => t.type === "perso").length;

    // Filter: deadline is today or in the past + not completed
    const todayDate = new Date(todayStr);
    todayDate.setHours(0, 0, 0, 0);

    const overdueTasks = activeTasks.filter(t => {
      if (!t.deadline) return false;
      const taskDeadline = new Date(t.deadline);
      taskDeadline.setHours(0, 0, 0, 0);
      return taskDeadline <= todayDate;
    });

    const overdueCount = overdueTasks.length;

    // ===============================
    // 📊 SUMMARY (ANTI DOUBLON)
    // ===============================

    const summaryKey = `summary-${todayStr}`;

    const { data: existingSummary } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", user.user_id)
      .eq("ref_key", summaryKey);

    if (!existingSummary || existingSummary.length === 0) {

      await supabase.from("notifications").insert({
        user_id: user.user_id,
        type: "summary",
        ref_key: summaryKey,
        title: "📊 Résumé quotidien",
        message: `${pro} PRO • ${perso} PERSO • ${overdueCount} en retard`,
        read: false,
      });
    }

    // ===============================
    // ⏰ DEADLINES (1 PAR TACHE)
    // ===============================

    for (const task of overdueTasks) {

      const deadlineKey = `deadline-${task.id}`;

      const { data: existingDeadline } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", user.user_id)
        .eq("ref_key", deadlineKey);

      if (!existingDeadline || existingDeadline.length === 0) {

        await supabase.from("notifications").insert({
          user_id: user.user_id,
          type: "deadline",
          ref_key: deadlineKey,
          title: "⏰ Tâche en retard",
          message: `La tâche "${task.title}" est en retard.`,
          read: false,
        });
      }
    }

    // ===============================
    // 📅 TOMORROW SUMMARY
    // ===============================

    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);

    const startTomorrow = new Date(tomorrow);
    startTomorrow.setHours(0, 0, 0, 0);

    const endTomorrow = new Date(tomorrow);
    endTomorrow.setHours(23, 59, 59, 999);

    const tomorrowStr = startTomorrow.toISOString().split("T")[0];
    const tomorrowKey = `tomorrow-${tomorrowStr}`;

    const { data: tomorrowTasks } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", user.user_id)
      .gte("deadline", startTomorrow.toISOString())
      .lte("deadline", endTomorrow.toISOString())
      .eq("archived", false);

    const { data: existingTomorrow } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", user.user_id)
      .eq("ref_key", tomorrowKey);

    if (
      tomorrowTasks &&
      tomorrowTasks.length > 0 &&
      (!existingTomorrow || existingTomorrow.length === 0)
    ) {

      const message = `${tomorrowTasks.length} tâche(s) prévue(s) demain`;

      await supabase.from("notifications").insert({
        user_id: user.user_id,
        type: "tomorrow",
        ref_key: tomorrowKey,
        title: "📅 À faire demain",
        message,
        read: false,
      });
    }

  }

  return NextResponse.json({ ok: true });
}
