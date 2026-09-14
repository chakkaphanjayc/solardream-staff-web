"use server";

import { createClient } from "@/utils/supabase/server";
import { db } from "@/db";
import { userNotifications } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";

export async function getUserNotifications() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    return await db.query.userNotifications.findMany({
      where: and(
        eq(userNotifications.userId, user.id),
        eq(userNotifications.isRead, false)
      ),
      orderBy: [desc(userNotifications.createdAt)],
    });
  } catch (error) {
    console.error("Error fetching user notifications:", error);
    return [];
  }
}

export async function markNotificationAsRead(id: string) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };

    await db.update(userNotifications)
      .set({
        isRead: true,
      })
      .where(and(
        eq(userNotifications.id, id),
        eq(userNotifications.userId, user.id)
      ));
    return { success: true };
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return { error: "Failed to update notification" };
  }
}
