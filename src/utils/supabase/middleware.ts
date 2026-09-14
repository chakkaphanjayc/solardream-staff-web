import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getCookieDomain, getRequestHostHeader } from "@/lib/siteUrl";

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

// เพิ่มพารามิเตอร์ intlResponse เข้ามาในฟังก์ชัน (เป็น Optional เผื่อกรณีอื่น)
export const updateSession = async (request: NextRequest, intlResponse?: NextResponse) => {
  try {
    // 💡 สำคัญ: ถ้ามี intlResponse ส่งมาจาก next-intl ให้ใช้ตัวนั้นต่อเลย ไม่ต้องสร้างใหม่ลอย ๆ
    const response = intlResponse || NextResponse.next({
      request: {
        headers: request.headers,
      },
    });

    const host = getRequestHostHeader(request.headers);
    const domain = getCookieDomain(host);

    const supabase = createServerClient(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );

            // Keep next-intl's response intact. Replacing it with NextResponse.next()
            // drops its x-middleware-rewrite header, which makes locale-prefixed
            // routes intermittently resolve as 404 on the first authenticated visit.
            // Cookies can be appended directly to the existing response.

            cookiesToSet.forEach(({ name, value, options }) => {
              const isProd = process.env.NODE_ENV === "production";
              response.cookies.set(name, value, {
                ...options,
                secure: isProd,
                sameSite: "lax",
                path: "/",
                ...(domain ? { domain } : {}),
              });
            });
          },
        },
      }
    );

    // รีเฟรชเซสชัน Supabase Auth
    await supabase.auth.getUser();

    return response;
  } catch {
    // กรณีที่ Supabase แตก/พัง ให้พยายามคืนค่าสิทธิ์ภาษาเดิมกลับไปก่อน เพื่อไม่ให้หน้าเว็บขาวพังทั้งหมด
    return intlResponse || NextResponse.next({
      request: {
        headers: request.headers,
      },
    });
  }
};
