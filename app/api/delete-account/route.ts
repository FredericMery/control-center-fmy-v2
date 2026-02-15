import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json(
        { error: "Missing userId" },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 🔹 DELETE DATA TABLES
    await supabaseAdmin
      .from("tasks")
      .delete()
      .eq("user_id", userId);

    await supabaseAdmin
      .from("memory_items")
      .delete()
      .eq("user_id", userId);

    await supabaseAdmin
      .from("memory_sections")
      .delete()
      .eq("user_id", userId);

    // 🔹 DELETE AUTH USER
    const { error } =
      await supabaseAdmin.auth.admin.deleteUser(userId);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
