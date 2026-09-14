import "server-only";

import { createHash } from "node:crypto";

import { db } from "@/db";
import { auditEvents, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import type {
  AuditActorType,
  AuditMetadata,
  AuditOutcome,
  JsonValue,
} from "@/types/audit";

type AuditDatabase = Pick<typeof db, "insert">;

export type AuditEventInput = {
  actorUserId?: string | null;
  actorType?: AuditActorType;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome?: AuditOutcome;
  route?: string | null;
  method?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: AuditMetadata;
  legacyActivityLogId?: string | null;
  occurredAt?: Date;
};

export type AuditRequestContext = {
  route: string;
  method: string;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

type AuditActor = {
  userId: string;
  actorType: AuditActorType;
};

function trimValue(value: string | null | undefined, maxLength: number) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function getDatabaseErrorCode(error: unknown) {
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause;
  return typeof cause?.code === "string" ? cause.code : null;
}

function isMissingAuditTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    getDatabaseErrorCode(error) === "42P01" ||
    message.includes("audit_events") ||
    message.includes("DATABASE_URL is not set")
  );
}

function hashValue(value: string | null) {
  const salt = process.env.AUDIT_LOG_HASH_SALT?.trim();
  if (!salt || !value) return null;
  return createHash("sha256").update(`${salt}:${value}`).digest("hex");
}

function normalizeMetadata(metadata: AuditMetadata | undefined): AuditMetadata {
  if (!metadata) return {};

  const serialized = JSON.stringify(metadata);
  if (!serialized) return {};

  try {
    const parsed: unknown = JSON.parse(serialized);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as AuditMetadata;
    }
  } catch {
    return {};
  }

  return {};
}

function getHeaderValue(headers: Headers, names: readonly string[]) {
  for (const name of names) {
    const value = trimValue(headers.get(name), 200);
    if (value) return value;
  }
  return null;
}

function getClientIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return trimValue(
    forwarded || headers.get("x-real-ip") || headers.get("cf-connecting-ip"),
    80,
  );
}

export function getAuditRequestContext(request: Request): AuditRequestContext {
  return {
    route: trimValue(new URL(request.url).pathname, 500) || "/",
    method: request.method.toUpperCase(),
    requestId: getHeaderValue(request.headers, ["x-request-id", "x-correlation-id"]),
    ipAddress: getClientIp(request.headers),
    userAgent: trimValue(request.headers.get("user-agent"), 500),
  };
}

function roleToActorType(role: string | null | undefined): AuditActorType {
  if (role === "ADMIN" || role === "SUPER_ADMIN") return "ADMIN";
  if (role === "STAFF" || role === "MANAGER" || role === "INSTALLER") return "STAFF";
  return "USER";
}

export async function resolveAuditActor(): Promise<AuditActor | null> {
  try {
    const { createClient } = await import("@/utils/supabase/server");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, user.id),
      columns: { id: true, role: true },
    });

    return {
      userId: dbUser?.id || user.id,
      actorType: roleToActorType(dbUser?.role),
    };
  } catch {
    return null;
  }
}

export async function recordAuditEvent(
  input: AuditEventInput,
  executor: AuditDatabase = db,
) {
  const [event] = await executor
    .insert(auditEvents)
    .values({
      actorUserId: trimValue(input.actorUserId, 200),
      actorType: input.actorType || "SYSTEM",
      action: trimValue(input.action, 120) || "UNKNOWN_ACTION",
      resourceType: trimValue(input.resourceType, 120) || "UNKNOWN_RESOURCE",
      resourceId: trimValue(input.resourceId, 300),
      outcome: input.outcome || "SUCCESS",
      route: trimValue(input.route, 500),
      method: trimValue(input.method, 16),
      requestId: trimValue(input.requestId, 200),
      ipHash: hashValue(trimValue(input.ipAddress, 80)),
      userAgentHash: hashValue(trimValue(input.userAgent, 500)),
      metadata: normalizeMetadata(input.metadata),
      legacyActivityLogId: trimValue(input.legacyActivityLogId, 80),
      occurredAt: input.occurredAt || new Date(),
    })
    .returning({ id: auditEvents.id });

  return event?.id || null;
}

export async function recordAuditEventBestEffort(input: AuditEventInput) {
  try {
    return await recordAuditEvent(input);
  } catch (error) {
    if (!isMissingAuditTableError(error)) {
      console.warn(
        "[Audit] Failed to persist audit event:",
        error instanceof Error ? error.message : "Unknown database error",
      );
    }
    return null;
  }
}

function isDynamicPathSegment(segment: string) {
  return (
    /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment) ||
    /^\d+$/.test(segment) ||
    (segment.length > 28 && /^[a-z0-9_-]+$/i.test(segment))
  );
}

function getApiAction(pathname: string, method: string) {
  const segments = pathname.split("/").filter(Boolean).filter((segment) => segment !== "api");
  const stableSegments = segments.filter((segment) => !isDynamicPathSegment(segment));
  const actionSegment = stableSegments.at(-1) || "REQUEST";
  const actionName = actionSegment.replace(/[^a-z0-9]+/gi, "_").toUpperCase();
  return `API_${method}_${actionName}`.slice(0, 120);
}

function getApiResourceType(pathname: string) {
  const firstSegment = pathname.split("/").filter(Boolean).find((segment) => segment !== "api");
  return firstSegment?.replace(/[^a-z0-9]+/gi, "_").toUpperCase().slice(0, 120) || "API";
}

function getApiResourceId(pathname: string) {
  const segments = pathname.split("/").filter(Boolean).filter((segment) => segment !== "api");
  return trimValue(segments.find(isDynamicPathSegment), 300);
}

export async function recordApiAuditEvent(
  request: Request,
  response: Response | null,
  error?: unknown,
) {
  const context = getAuditRequestContext(request);
  const actor = await resolveAuditActor();
  const statusCode = response?.status || 500;
  const outcome: AuditOutcome =
    statusCode === 401 || statusCode === 403
      ? "DENIED"
      : statusCode >= 400 || error
        ? "FAILURE"
        : "SUCCESS";

  const metadata: AuditMetadata = {
    statusCode,
    source: "elysia",
    ...(error instanceof Error ? { errorName: error.name } : {}),
  } satisfies AuditMetadata;

  await recordAuditEventBestEffort({
    actorUserId: actor?.userId || null,
    actorType: actor?.actorType || "ANONYMOUS",
    action: getApiAction(context.route, context.method),
    resourceType: getApiResourceType(context.route),
    resourceId: getApiResourceId(context.route),
    outcome,
    route: context.route,
    method: context.method,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata,
  });
}

export function toAuditMetadata(value: Record<string, JsonValue>): AuditMetadata {
  return value;
}
