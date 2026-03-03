import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  // Get all users with notification_settings enabled
  const { data: users } = await supabase
    .from("notification_settings")
    .select("*");

  if (!users || users.length === 0) {
    return NextResponse.json({ message: "No users with notification settings" });
  }

  let notificationsCreated = 0;

  for (const user of users) {
    const { data: tasks } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", user.user_id)
      .eq("archived", false)
      .neq("status", "done");

    if (!tasks) continue;

    // Filter: deadline is today or in the past
    const todayDate = new Date(todayStr);
    todayDate.setHours(0, 0, 0, 0);

    const overdueTasks = tasks.filter(t => {
      if (!t.deadline) return false;
      const taskDeadline = new Date(t.deadline);
      taskDeadline.setHours(0, 0, 0, 0);
      return taskDeadline <= todayDate;
    });

    // Create notifications for overdue tasks
    for (const task of overdueTasks) {
      const deadlineKey = `deadline-${task.id}`;

      // Check if notification already exists
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", user.user_id)
        .eq("ref_key", deadlineKey);

      if (!existing || existing.length === 0) {
        await supabase.from("notifications").insert({
          user_id: user.user_id,
          type: "deadline",
          ref_key: deadlineKey,
          title: "⏰ Tâche en retard",
          message: `La tâche "${task.title}" est en retard.`,
          read: false,
        });
        notificationsCreated++;
      }
    }
  }

  return NextResponse.json({ 
    ok: true, 
    notificationsCreated,
    message: `${notificationsCreated} notification(s) créée(s)`
  });
}
