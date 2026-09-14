"use server";

import { sendDiscordEmbedNotification } from "@/lib/discord";
import { requireStaff } from "@/lib/auth-guard"; // ปรับแก้ตาม guard ในโปรเจกต์คุณ

function getDiscordTestError(error: unknown) {
    if (error instanceof Error && error.message === "Unauthorized") {
        return "สิทธิ์ไม่ได้รับอนุญาต";
    }
    return "ไม่สามารถส่งการแจ้งเตือนทดสอบได้";
}

export async function triggerDiscordTestNotification() {
    try {
        // 🛡️ เช็คสิทธิ์ความปลอดภัยให้เฉพาะเจ้าหน้าที่กดเล่นได้เท่านั้น
        await requireStaff();

        // เสกข้อมูลจำลองขึ้นมานัดทดสอบระบบ
        const testResult = await sendDiscordEmbedNotification({
            proposalId: "MOCK-PROPOSAL-2026-TEST",
            customerName: "สมชาย รักพลังงาน (ระบบทดสอบ)",
            customerEmail: "somchai.test@solardream.com",
            systemSizeKwp: 5.60,
            panelCount: 16,
            totalPrice: 149000,
            version: 1,
            driveLink: "https://drive.google.com"
        });

        if (testResult) {
            return { success: true as const, message: "🚀 ยิงการ์ดแจ้งเตือนเข้า Discord สำเร็จแล้ว! ตรวจสอบที่ Channel ได้เลย" };
        } else {
            return { success: false as const, error: "ไม่สามารถส่งออกได้ กรุณาตรวจเช็ค DISCORD_WEBHOOK_URL ใน .env" };
        }
    } catch (err: unknown) {
        console.error("[Discord Test Notification] Failed:", err);
        return { success: false as const, error: getDiscordTestError(err) };
    }
}
