import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * API Route: Check overdue tasks and create notifications
 * This endpoint checks all tasks with:
 * - deadline <= today
 * - status != "done"
 * And creates notifications for them (avoiding duplicates with ref_key)
 */
export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  // Set today at midnight for comparison
  const todayDate = new Date(todayStr);
  todayDate.setHours(0, 0, 0, 0);

  // Get all users
  const { data: users } = await supabase
    .from("notification_settings")
    .select("*");

  if (!users || users.length === 0) {
    return NextResponse.json({ 
      ok: true, 
      message: "No users found" 
    });
  }

  let totalNotificationsCreated = 0;

  for (const user of users) {
    // Get all tasks for this user with:
    // - not archived
    // - status != "done"
    // - has a deadline
    const { data: tasks } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", user.user_id)
      .eq("archived", false)
      .neq("status", "done")
      .not("deadline", "is", null);

    if (!tasks || tasks.length === 0) continue;

    // Filter tasks where deadline <= today
    const overdueTasks = tasks.filter(task => {
      const taskDeadline = new Date(task.deadline);
      taskDeadline.setHours(0, 0, 0, 0);
      return taskDeadline <= todayDate;
    });

    // Create notifications for overdue tasks
    for (const task of overdueTasks) {
      const deadlineKey = `deadline-${task.id}`;

      // Check if notification already exists (avoid duplicates)
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", user.user_id)
        .eq("ref_key", deadlineKey);

      if (!existing || existing.length === 0) {
        // Create notification
        const { error } = await supabase
          .from("notifications")
          .insert({
            user_id: user.user_id,
            type: "deadline",
            ref_key: deadlineKey,
            title: "⏰ Tâche en retard",
            message: `La tâche "${task.title}" a dépassé sa deadline.`,
            read: false,
          });

        if (!error) {
          totalNotificationsCreated++;
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    notificationsCreated: totalNotificationsCreated,
    message: `${totalNotificationsCreated} notification(s) créée(s) pour tâches en retard`,
  });
}
