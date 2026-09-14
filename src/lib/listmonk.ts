import "server-only";

import { buildConsentListIds, type UserConsentPreferences } from "@/lib/consentPreferences";
import { normalizePreferredLanguage, type PreferredLanguage } from "@/lib/userLanguage";

type ListmonkSubscriber = {
  id: number;
  email: string;
  name?: string;
  attribs?: Record<string, unknown> | null;
  lists?: Array<{
    id: number;
    subscription_status?: string;
  }>;
};

type ListmonkResponse<T> = {
  data?: T;
};

type ListmonkSubscriberCollection = {
  results?: ListmonkSubscriber[];
};

class ListmonkRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly endpoint: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "ListmonkRequestError";
  }
}

function getListmonkErrorDetail(body: string) {
  const trimmed = body.trim();
  if (!trimmed) return undefined;

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (
      typeof parsed === "object"
      && parsed !== null
      && "message" in parsed
      && typeof parsed.message === "string"
    ) {
      return parsed.message.slice(0, 500);
    }
  } catch {
    // Fall through to the response text for non-JSON proxy errors.
  }

  return trimmed.replace(/\s+/g, " ").slice(0, 500);
}

export type ListmonkNotificationPreference = "email" | "line";

export type SyncSubscriberInput = {
  email: string;
  name?: string | null;
  notificationPreference?: ListmonkNotificationPreference;
  lineUserId?: string | null;
  preferredLanguage?: PreferredLanguage;
  attribs?: Record<string, unknown>;
};

export type SendTransactionalInput = {
  subscriberEmail: string;
  templateId: number;
  data?: Record<string, unknown>;
  messenger?: string;
  subscriberMode?: "default" | "fallback" | "external";
};

export type ListmonkOperationResult<T = unknown> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: string;
      status?: number;
    };

export type ListmonkTemplateOption = {
  id: number;
  name: string;
  subject: string;
  type: string;
};

function positiveListId(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getListmonkListIds() {
  return {
    news: positiveListId(process.env.LISTMONK_NEWS_LIST_ID, 2),
    promotions: positiveListId(process.env.LISTMONK_PROMOTIONS_LIST_ID, 3),
    systemUpdates: positiveListId(process.env.LISTMONK_SYSTEM_UPDATES_LIST_ID, 1),
  } as const;
}

export function getListmonkLists(preferences: UserConsentPreferences) {
  return buildConsentListIds(preferences, getListmonkListIds());
}

function getListmonkConfig() {
  const rawUrl = process.env.LISTMONK_URL?.trim() || "";
  const apiUser = process.env.LISTMONK_API_USER?.trim() || "";
  const apiPass = process.env.LISTMONK_API_PASS?.trim() || process.env.LISTMONK_API_TOKEN?.trim() || "";
  if (!rawUrl || !apiUser || !apiPass) {
    throw new Error("Listmonk integration is not configured.");
  }
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Listmonk URL must use HTTP or HTTPS.");
  }
  return {
    baseUrl: url.toString().replace(/\/$/, ""),
    authorization: `Basic ${Buffer.from(`${apiUser}:${apiPass}`).toString("base64")}`,
  };
}

async function listmonkRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const config = getListmonkConfig();
  const requestUrl = `${config.baseUrl}${path}`;
  const endpoint = new URL(requestUrl);
  const safeEndpoint = `${endpoint.origin}${endpoint.pathname}`;
  const response = await fetch(requestUrl, {
    ...init,
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(15_000),
    headers: {
      Accept: "application/json",
      Authorization: config.authorization,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const detail = getListmonkErrorDetail(await response.text().catch(() => ""));
    throw new ListmonkRequestError(
      `Listmonk request to ${safeEndpoint} failed with status ${response.status}${detail ? `: ${detail}` : "."}`,
      response.status,
      safeEndpoint,
      detail,
    );
  }
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

function logListmonkRejection(operation: string, error: unknown) {
  if (error instanceof ListmonkRequestError) {
    console.warn(`[Listmonk] ${operation} rejected.`, {
      status: error.status,
      endpoint: error.endpoint,
      message: error.message,
      detail: error.detail,
    });
    return {
      success: false as const,
      error: error.message,
      status: error.status,
    };
  }

  const message = error instanceof Error ? error.message : "Listmonk request failed.";
  console.warn(`[Listmonk] ${operation} failed.`, error);
  return {
    success: false as const,
    error: message,
  };
}

function subscriberPayload(input: {
  userId: string;
  email: string;
  name: string;
  preferences: UserConsentPreferences;
  lineUserId?: string | null;
  preferredLanguage: PreferredLanguage;
}) {
  return {
    email: input.email,
    name: input.name,
    status: "enabled",
    lists: getListmonkLists(input.preferences),
    attribs: {
      solardream_user_id: input.userId,
      consent_news: input.preferences.news,
      consent_promotions: input.preferences.promotions,
      consent_system_updates: true,
      consent_revision: input.preferences.revision,
      line_user_id: input.lineUserId?.trim() || null,
      line_id: input.lineUserId?.trim() || null,
      preferred_language: input.preferredLanguage,
    },
    preconfirm_subscriptions: true,
  };
}

async function findSubscriberByEmail(email: string) {
  const safeEmail = email.replaceAll("'", "''");
  const query = encodeURIComponent(`subscribers.email = '${safeEmail}'`);
  const response = await listmonkRequest<ListmonkResponse<ListmonkSubscriberCollection>>(
    `/api/subscribers?query=${query}&page=1&per_page=20`,
  );
  return response.data?.results?.find(
    (subscriber) => subscriber.email.trim().toLowerCase() === email.trim().toLowerCase(),
  ) ?? null;
}

async function patchSubscriberProfile(
  subscriberId: number,
  payload: ReturnType<typeof subscriberPayload>,
) {
  await listmonkRequest(`/api/subscribers/${subscriberId}`, {
    method: "PATCH",
    body: JSON.stringify({ name: payload.name, attribs: payload.attribs }),
  });
}

async function patchSubscriberNotificationProfile(
  subscriber: ListmonkSubscriber,
  payload: {
    name: string;
    attribs: Record<string, unknown>;
  },
) {
  await listmonkRequest(`/api/subscribers/${subscriber.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: payload.name,
      attribs: {
        ...(subscriber.attribs ?? {}),
        ...payload.attribs,
      },
    }),
  });
}

async function syncSubscriberLists(
  subscriber: ListmonkSubscriber,
  preferences: UserConsentPreferences,
) {
  const configured = getListmonkListIds();
  const desired = new Set(getListmonkLists(preferences));
  const current = new Map((subscriber.lists ?? []).map((list) => [list.id, list.subscription_status]));
  const managedIds = [configured.systemUpdates, configured.news, configured.promotions];
  const add = managedIds.filter((id) => desired.has(id) && current.get(id) !== "confirmed");
  const unsubscribe = managedIds.filter((id) => !desired.has(id) && current.has(id) && current.get(id) !== "unsubscribed");

  if (add.length > 0) {
    await listmonkRequest("/api/subscribers/lists", {
      method: "PUT",
      body: JSON.stringify({ ids: [subscriber.id], action: "add", target_list_ids: add, status: "confirmed" }),
    });
  }
  if (unsubscribe.length > 0) {
    await listmonkRequest("/api/subscribers/lists", {
      method: "PUT",
      body: JSON.stringify({ ids: [subscriber.id], action: "unsubscribe", target_list_ids: unsubscribe }),
    });
  }
}

async function getSubscriberById(subscriberId: number) {
  const response = await listmonkRequest<ListmonkResponse<ListmonkSubscriber>>(`/api/subscribers/${subscriberId}`);
  return response.data ?? null;
}

async function syncExistingSubscriber(
  subscriber: ListmonkSubscriber,
  payload: ReturnType<typeof subscriberPayload>,
  preferences: UserConsentPreferences,
) {
  await patchSubscriberProfile(subscriber.id, payload);
  await syncSubscriberLists(subscriber, preferences);
}

export async function syncListmonkSubscriber(input: {
  userId: string;
  email: string;
  name: string;
  preferences: UserConsentPreferences;
  storedSubscriberId: string | null;
  lineUserId?: string | null;
  preferredLanguage?: PreferredLanguage;
}) {
  const payload = subscriberPayload({
    ...input,
    preferredLanguage: normalizePreferredLanguage(input.preferredLanguage),
  });
  const storedId = Number(input.storedSubscriberId);
  if (Number.isSafeInteger(storedId) && storedId > 0) {
    try {
      const stored = await getSubscriberById(storedId);
      if (stored && stored.email.trim().toLowerCase() === input.email.trim().toLowerCase()) {
        await syncExistingSubscriber(stored, payload, input.preferences);
        return String(storedId);
      }
    } catch (error) {
      if (!(error instanceof ListmonkRequestError) || error.status !== 404) throw error;
    }
  }

  const existing = await findSubscriberByEmail(input.email);
  if (existing) {
    const complete = await getSubscriberById(existing.id) ?? existing;
    await syncExistingSubscriber(complete, payload, input.preferences);
    return String(existing.id);
  }

  try {
    const created = await listmonkRequest<ListmonkResponse<ListmonkSubscriber>>("/api/subscribers", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!created.data?.id) throw new Error("Listmonk create response did not include a subscriber ID.");
    return String(created.data.id);
  } catch (error) {
    if (!(error instanceof ListmonkRequestError) || error.status !== 409) throw error;
    const concurrent = await findSubscriberByEmail(input.email);
    if (!concurrent) throw error;
    const complete = await getSubscriberById(concurrent.id) ?? concurrent;
    await syncExistingSubscriber(complete, payload, input.preferences);
    return String(concurrent.id);
  }
}

export async function syncSubscriber(
  input: SyncSubscriberInput,
): Promise<ListmonkOperationResult<{ subscriberId: string }>> {
  const email = input.email.trim().toLowerCase();
  if (!email) {
    return {
      success: false,
      error: "Subscriber email is required.",
    };
  }

  const payload = {
    email,
    name: input.name?.trim() || email,
    status: "enabled",
    attribs: {
      ...(input.attribs ?? {}),
      notification_preference: input.notificationPreference ?? (input.lineUserId ? "line" : "email"),
      line_user_id: input.lineUserId?.trim() || null,
      line_id: input.lineUserId?.trim() || null,
      preferred_language: normalizePreferredLanguage(input.preferredLanguage),
    },
    preconfirm_subscriptions: true,
  };

  try {
    const existing = await findSubscriberByEmail(email);
    if (existing) {
      await patchSubscriberNotificationProfile(existing, {
        name: payload.name,
        attribs: payload.attribs,
      });
      return {
        success: true,
        data: { subscriberId: String(existing.id) },
      };
    }

    const created = await listmonkRequest<ListmonkResponse<ListmonkSubscriber>>("/api/subscribers", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!created.data?.id) {
      throw new Error("Listmonk create response did not include a subscriber ID.");
    }

    return {
      success: true,
      data: { subscriberId: String(created.data.id) },
    };
  } catch (error) {
    if (error instanceof ListmonkRequestError && error.status === 409) {
      try {
        const concurrent = await findSubscriberByEmail(email);
        if (!concurrent) throw error;
        await patchSubscriberNotificationProfile(concurrent, {
          name: payload.name,
          attribs: payload.attribs,
        });
        return {
          success: true,
          data: { subscriberId: String(concurrent.id) },
        };
      } catch (concurrentError) {
        return logListmonkRejection("subscriber upsert", concurrentError);
      }
    }

    return logListmonkRejection("subscriber upsert", error);
  }
}

export async function sendTransactional(
  input: SendTransactionalInput,
): Promise<ListmonkOperationResult<unknown>> {
  const subscriberEmail = input.subscriberEmail.trim().toLowerCase();
  if (!subscriberEmail) {
    return {
      success: false,
      error: "Subscriber email is required.",
    };
  }

  if (!Number.isSafeInteger(input.templateId) || input.templateId <= 0) {
    return {
      success: false,
      error: "A valid listmonk template ID is required.",
    };
  }

  const payload = {
    ...(input.subscriberMode === "external" || input.subscriberMode === "fallback"
      ? {
          subscriber_mode: input.subscriberMode,
          subscriber_emails: [subscriberEmail],
        }
      : {
          subscriber_email: subscriberEmail,
        }),
    template_id: input.templateId,
    data: input.data ?? {},
    ...(input.messenger ? { messenger: input.messenger } : {}),
  };

  try {
    const response = await listmonkRequest<unknown>("/api/tx", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return {
      success: true,
      data: response,
    };
  } catch (error) {
    return logListmonkRejection("transactional message", error);
  }
}

export async function getListmonkTransactionalTemplates(): Promise<
  ListmonkOperationResult<ListmonkTemplateOption[]>
> {
  try {
    const response = await listmonkRequest<ListmonkResponse<Array<{
      id: number;
      name: string;
      subject?: string;
      type?: string;
    }>>>("/api/templates?page=1&per_page=100");
    return {
      success: true,
      data: (response.data ?? [])
        .filter((template) => template.type === "tx")
        .map((template) => ({
          id: template.id,
          name: template.name,
          subject: template.subject ?? "",
          type: template.type ?? "",
        })),
    };
  } catch (error) {
    return logListmonkRejection("transactional template lookup", error);
  }
}

export async function deleteListmonkSubscriber(subscriberId: string) {
  const parsed = Number(subscriberId);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error("Invalid Listmonk subscriber ID.");
  try {
    await listmonkRequest(`/api/subscribers/${parsed}`, { method: "DELETE" });
  } catch (error) {
    if (error instanceof ListmonkRequestError && error.status === 404) return;
    throw error;
  }
}
