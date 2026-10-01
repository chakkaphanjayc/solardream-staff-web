import { NextResponse } from "next/server";
import { ensureUserExists } from "@/app/actions/auth";
import { getSystemSetting, saveSystemSetting } from "@/app/actions/systemSettings";
import { isRequestContentLengthExceeded } from "@/lib/requestSize";
import { createClient } from "@/utils/supabase/server";
import { getLineIntegrationConfig, isLineLiveMutationEnabled } from "@/lib/lineApi";
import { getImageInfo, transformImage, transformImageWithTextOverlays, type ImageTextOverlay } from "@/lib/cloudflare-images";

// LINE Rich Menu canvas dimensions (fixed by LINE spec)
const CANVAS_W = 2500;
const CANVAS_H = 1686;
const MAX_RICH_MENU_IMAGE_BYTES = 10 * 1024 * 1024;
const RICH_MENU_IMAGE_FETCH_TIMEOUT_MS = 10_000;
const LINE_RICH_MENU_API_TIMEOUT_MS = 10_000;
const MAX_LINE_UPLOAD_ERROR_BODY_CHARS = 2_000;
const MAX_RICH_MENU_PUBLISH_BODY_BYTES = 16 * 1024;

interface AreaBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RichMenuArea {
  bounds: AreaBounds;
  label?: string;
  showLabel?: boolean; // Custom field — stored in our DB, stripped before sending to LINE
  action: { type: string; text?: string; uri?: string };
}

interface RichMenuRecord {
  id: string;
  menuName: string;
  chatBarText: string;
  imageUrl: string;
  status: "DRAFT" | "PUBLISHED";
  lineRichMenuId: string | null;
  isMemberMenu: boolean;
  areas: RichMenuArea[];
}

type PublishRequestBody = {
  menuId?: unknown;
};

async function requireAdminJson() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const dbUser = await ensureUserExists(user);
  if (!dbUser || dbUser.role !== "ADMIN") {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true as const };
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function readLineJson(response: Response) {
  return response.json().catch(() => ({})) as Promise<unknown>;
}

function isAllowedRichMenuImageUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;

    const hostname = url.hostname.toLowerCase();
    const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const configuredSupabaseHost = configuredSupabaseUrl
      ? new URL(configuredSupabaseUrl).hostname.toLowerCase()
      : "";

    return (
      Boolean(configuredSupabaseHost && hostname === configuredSupabaseHost) ||
      hostname === "images.unsplash.com" ||
      hostname === "placehold.co"
    );
  } catch {
    return false;
  }
}

async function fetchRichMenuImageBuffer(imageUrl: string) {
  if (!isAllowedRichMenuImageUrl(imageUrl)) {
    throw new Error("Rich menu image URL is not from an allowed host.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RICH_MENU_IMAGE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(imageUrl, {
      cache: "no-store",
      redirect: "error",
      headers: {
        Accept: "image/jpeg,image/png,image/webp;q=0.9,image/*;q=0.8",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Failed to download Rich Menu image: ${response.status}`);
    }

    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_RICH_MENU_IMAGE_BYTES) {
      throw new Error("Rich menu image exceeds the maximum allowed size.");
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_RICH_MENU_IMAGE_BYTES) {
      throw new Error("Rich menu image exceeds the maximum allowed size.");
    }

    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim() || "unknown";
    try {
      const metadata = await getImageInfo(buffer);
      if (!metadata.format || !metadata.width || !metadata.height) {
        throw new Error("Image metadata is incomplete.");
      }
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : "Unknown image decode error.";
      throw new Error(`Downloaded rich menu image is not a supported image (content type: ${contentType}): ${detail}`);
    }

    return buffer;
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: Request) {
  const auth = await requireAdminJson();
  if (!auth.ok) return auth.response;

  if (!isLineLiveMutationEnabled()) {
    return NextResponse.json(
      { error: "Live LINE Rich Menu mutations are disabled outside production or until LINE_LIVE_MUTATIONS_ENABLED=true." },
      { status: 409 },
    );
  }

  const { accessToken: token } = await getLineIntegrationConfig();
  if (!token) {
    return NextResponse.json(
      { error: "LINE channel access token is not configured in API Setup or the server environment." },
      { status: 500 }
    );
  }

  const cleanToken = token;

  try {
    if (isRequestContentLengthExceeded(req.headers, MAX_RICH_MENU_PUBLISH_BODY_BYTES)) {
      return NextResponse.json(
        { error: "Rich menu publish payload is too large." },
        { status: 413 },
      );
    }

    const body = (await req.json().catch(() => null)) as PublishRequestBody | null;
    const menuId = cleanString(body?.menuId);
    if (!menuId) {
      return NextResponse.json({ error: "menuId is required." }, { status: 400 });
    }

    // 1. Fetch menu profiles from DB
    const menusRaw = await getSystemSetting("line_rich_menus");
    let menus: RichMenuRecord[] = [];
    if (menusRaw) {
      try {
        menus = JSON.parse(menusRaw);
      } catch {
        menus = [];
      }
    }

    const menuIndex = menus.findIndex((m) => m.id === menuId);
    if (menuIndex === -1) {
      return NextResponse.json({ error: "Rich Menu profile not found." }, { status: 404 });
    }

    const menu = menus[menuIndex];

    // 2. Fetch and validate the Rich Menu artwork before creating anything on LINE.
    console.log(`[Publish Pipeline] Step 2: Fetching Rich Menu image from: ${menu.imageUrl}`);
    let rawImageBuffer: Buffer;
    try {
      rawImageBuffer = await fetchRichMenuImageBuffer(menu.imageUrl);
    } catch (error) {
      console.error("[Publish Pipeline] Failed to download Rich Menu image:", error);
      const isUnsupportedImage = error instanceof Error && error.message.includes("not a supported image");
      return NextResponse.json(
        {
          error: isUnsupportedImage
            ? "The Rich Menu image URL did not return a supported image. Upload a valid JPEG, PNG, or WebP image."
            : "Failed to download Rich Menu image.",
        },
        { status: 400 }
      );
    }

    // 3. Server-side text overlay using Cloudflare Images in Workers.
    console.log("[Publish Pipeline] Step 3: Compositing text labels onto Rich Menu image");
    const areasWithLabels = menu.areas.filter((a) => a.label && a.label.trim());
    let processedBuffer: Buffer;

    try {
      if (areasWithLabels.length > 0) {
        const overlays: ImageTextOverlay[] = areasWithLabels.map((area) => ({
          text: area.label?.trim() || "",
          left: Math.max(0, Math.round(area.bounds.x + area.bounds.width / 2 - 160)),
          top: Math.max(0, Math.round(area.bounds.y + area.bounds.height / 2 - 28)),
          size: 56,
        }));
        processedBuffer = await transformImageWithTextOverlays(rawImageBuffer, { width: CANVAS_W, height: CANVAS_H, quality: 90, overlays });
      } else {
        // No labels – just resize to correct dimensions
        processedBuffer = await transformImage(rawImageBuffer, { width: CANVAS_W, height: CANVAS_H, fit: "cover", format: "jpeg", quality: 90 });
      }
    } catch (error: unknown) {
      console.error("[Publish Pipeline] Failed to process Rich Menu image:", error);
      return NextResponse.json(
        {
          error: "Rich Menu image could not be processed. Upload a valid JPEG, PNG, or WebP image.",
        },
        { status: 400 },
      );
    }

    console.log(
      `[Publish Pipeline] Image processed. Final size: ${processedBuffer.byteLength} bytes`
    );

    // 4. Create Metadata on LINE Messaging API only after the image is valid.
    // Sanitize areas: strip our custom `showLabel` field before sending to LINE
    const sanitizedAreas = menu.areas.map(({ bounds, label, action }: RichMenuArea) => ({
      bounds,
      ...(label ? { label } : {}),
      action,
    }));

    const lineMetadataPayload = {
      size: { width: CANVAS_W, height: CANVAS_H },
      selected: true,
      name: menu.menuName,
      chatBarText: menu.chatBarText,
      areas: sanitizedAreas,
    };

    console.log("[Publish Pipeline] Step 4: Creating metadata on LINE API");
    const metadataRes = await fetch("https://api.line.me/v2/bot/richmenu", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cleanToken}`,
      },
      body: JSON.stringify(lineMetadataPayload),
      signal: AbortSignal.timeout(LINE_RICH_MENU_API_TIMEOUT_MS),
    });

    const metadataPayload = await readLineJson(metadataRes);
    if (!metadataRes.ok) {
      console.error("[Publish Pipeline] LINE metadata creation failed:", {
        status: metadataRes.status,
        body: metadataPayload,
      });
      return NextResponse.json(
        { error: "Failed to create metadata on LINE API" },
        { status: 502 },
      );
    }

    const lineRichMenuId = cleanString(asRecord(metadataPayload).richMenuId);
    if (!lineRichMenuId) {
      console.error("[Publish Pipeline] LINE metadata response did not include richMenuId:", metadataPayload);
      return NextResponse.json(
        { error: "LINE API did not return a rich menu ID." },
        { status: 502 },
      );
    }
    console.log(`[Publish Pipeline] Metadata created. LINE ID: ${lineRichMenuId}`);

    // 5. Upload processed image binary to LINE content server
    console.log("[Publish Pipeline] Step 5: Uploading processed binary to LINE content server");
    const uploadRes = await fetch(
      `https://api-data.line.me/v2/bot/richmenu/${lineRichMenuId}/content`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          "Content-Type": "image/jpeg",
        },
        body: new Uint8Array(processedBuffer),
        signal: AbortSignal.timeout(LINE_RICH_MENU_API_TIMEOUT_MS),
      }
    );

    if (!uploadRes.ok) {
      const uploadErr = (await uploadRes.text().catch(() => ""))
        .slice(0, MAX_LINE_UPLOAD_ERROR_BODY_CHARS);
      console.error("[Publish Pipeline] LINE image upload failed:", uploadErr);
      return NextResponse.json(
        { error: "Failed to upload image content to LINE API" },
        { status: uploadRes.status }
      );
    }

    console.log("[Publish Pipeline] Image binary upload complete.");

    // 6. Persist updated status to DB
    // NOTE: We intentionally do NOT set this as the default menu for all users.
    // The admin will assign it to a profile type + time window via the Assign Modal,
    // and the scheduler system or "Apply Now" button handles the actual LINE push.
    menu.status = "PUBLISHED";
    menu.lineRichMenuId = lineRichMenuId;
    menus[menuIndex] = menu;
    await saveSystemSetting("line_rich_menus", JSON.stringify(menus));

    if (menu.isMemberMenu) {
      await saveSystemSetting("line_member_rich_menu_id", lineRichMenuId);
      await saveSystemSetting("line_rich_menu_member_id", lineRichMenuId);
      process.env.LINE_MEMBER_RICH_MENU_ID = lineRichMenuId;
      console.log(`[Publish Pipeline] Global line_rich_menu_member_id set to ${lineRichMenuId}`);
    }

    return NextResponse.json({ success: true, lineRichMenuId, status: "PUBLISHED" });
  } catch (error: unknown) {
    console.error("[Publish Pipeline] Exception caught during publishing:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
