import { NextResponse } from "next/server";
import { ensureUserExists } from "@/app/actions/auth";
import { isRequestContentLengthExceeded } from "@/lib/requestSize";
import { createClient } from "@/utils/supabase/server";
import { getLineIntegrationConfig, isLineLiveMutationEnabled } from "@/lib/lineApi";

type RichMenuAction =
  | { type: "uri"; uri: string }
  | { type: "message"; text: string };

type RichMenuArea = {
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  action: RichMenuAction;
};

type RichMenuPayload = {
  size: {
    width: number;
    height: number;
  };
  selected: boolean;
  name: string;
  chatBarText: string;
  areas: RichMenuArea[];
};

const LINE_CREATE_RICH_MENU_TIMEOUT_MS = 8_000;
const MAX_CREATE_RICH_MENU_BODY_BYTES = 64 * 1024;

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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isFiniteNonNegativeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isRichMenuAction(value: unknown): value is RichMenuAction {
  const record = asRecord(value);
  if (record.type === "uri") {
    return typeof record.uri === "string" && /^https:\/\//i.test(record.uri);
  }
  if (record.type === "message") {
    return typeof record.text === "string" && record.text.trim().length > 0 && record.text.length <= 300;
  }
  return false;
}

function isRichMenuArea(value: unknown): value is RichMenuArea {
  const record = asRecord(value);
  const bounds = asRecord(record.bounds);
  return (
    isFiniteNonNegativeNumber(bounds.x) &&
    isFiniteNonNegativeNumber(bounds.y) &&
    isFiniteNonNegativeNumber(bounds.width) &&
    isFiniteNonNegativeNumber(bounds.height) &&
    isRichMenuAction(record.action)
  );
}

function isRichMenuPayload(value: unknown): value is RichMenuPayload {
  const record = asRecord(value);
  const size = asRecord(record.size);
  const areas = record.areas;
  return (
    isFiniteNonNegativeNumber(size.width) &&
    isFiniteNonNegativeNumber(size.height) &&
    typeof record.selected === "boolean" &&
    typeof record.name === "string" &&
    record.name.trim().length > 0 &&
    record.name.length <= 300 &&
    typeof record.chatBarText === "string" &&
    record.chatBarText.trim().length > 0 &&
    record.chatBarText.length <= 30 &&
    Array.isArray(areas) &&
    areas.length > 0 &&
    areas.length <= 20 &&
    areas.every(isRichMenuArea)
  );
}

function getLineErrorMessage(value: unknown) {
  const record = asRecord(value);
  return typeof record.message === "string" ? record.message : "Failed to create rich menu with LINE API.";
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

  // Default 6-cell specifications if no body is passed
  const defaultPayload: RichMenuPayload = {
    size: {
      width: 2500,
      height: 1686
    },
    selected: true,
    name: "Member Rich Menu",
    chatBarText: "เมนูสมาชิก",
    areas: [
      // Cell A (Top-left)
      {
        bounds: { x: 0, y: 0, width: 833, height: 843 },
        action: { type: "uri", uri: "https://solar-dream.org/th/build" }
      },
      // Cell B (Top-center)
      {
        bounds: { x: 833, y: 0, width: 834, height: 843 },
        action: { type: "uri", uri: "https://solar-dream.org/th/wizard" }
      },
      // Cell C (Top-right)
      {
        bounds: { x: 1667, y: 0, width: 833, height: 843 },
        action: { type: "message", text: "ติดตามใบเสนอราคา" }
      },
      // Cell D (Bottom-left)
      {
        bounds: { x: 0, y: 843, width: 833, height: 843 },
        action: { type: "message", text: "ติดตามงานติดตั้ง" }
      },
      // Cell E (Bottom-center)
      {
        bounds: { x: 833, y: 843, width: 834, height: 843 },
        action: { type: "uri", uri: "https://solar-dream.org/th/proposals" }
      },
      // Cell F (Bottom-right)
      {
        bounds: { x: 1667, y: 843, width: 833, height: 843 },
        action: { type: "message", text: "ผูกบัญชีสมาชิก" }
      }
    ]
  };

  if (isRequestContentLengthExceeded(req.headers, MAX_CREATE_RICH_MENU_BODY_BYTES)) {
    return NextResponse.json(
      { error: "Rich menu payload is too large." },
      { status: 413 },
    );
  }

  const body = await req.json().catch(() => null);
  if (body && !isRichMenuPayload(body)) {
    return NextResponse.json(
      { error: "Invalid rich menu payload." },
      { status: 400 },
    );
  }

  const payload = body || defaultPayload;

  try {
    const response = await fetch("https://api.line.me/v2/bot/richmenu", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cleanToken}`
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(LINE_CREATE_RICH_MENU_TIMEOUT_MS),
    });

    const data = await response.json().catch(() => ({})) as unknown;

    if (!response.ok) {
      return NextResponse.json(
        { error: getLineErrorMessage(data) },
        { status: response.status }
      );
    }

    const responseRecord = asRecord(data);
    const richMenuId = typeof responseRecord.richMenuId === "string" ? responseRecord.richMenuId : "";
    if (!richMenuId) {
      return NextResponse.json(
        { error: "LINE API did not return a richMenuId." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      richMenuId,
    });
  } catch (error: unknown) {
    console.error("[Create Rich Menu] Failed:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

// NOTE on using the returned richMenuId:
// 1. Capture the 'richMenuId' returned from this endpoint.
// 2. Upload the Rich Menu artwork (2500x1686 px JPEG/PNG) to:
//    POST https://api.line.me/v2/bot/richmenu/{richMenuId}/content
// 3. Save this ID in the LINE member Rich Menu ID field in API Setup.
