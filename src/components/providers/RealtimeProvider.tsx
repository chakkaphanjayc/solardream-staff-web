"use client";

import { useEffect, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

type AdminEventType =
  | "NEW_LEAD"
  | "LEAD_STATUS_CHANGED"
  | "QUOTATION_UPDATED"
  | "PROJECT_CREATED"
  | "PROJECT_STATUS_CHANGED";

type AdminRealtimeEvent = {
  eventType: AdminEventType;
  payload: {
    id: string;
    projectId?: string;
    name?: string;
    source?: string;
    status?: string;
    title?: string;
  };
  occurredAt: string;
};

function isAdminRealtimeEvent(value: unknown): value is AdminRealtimeEvent {
  if (typeof value !== "object" || value === null) return false;
  const event = value as { eventType?: unknown; payload?: unknown; occurredAt?: unknown };
  return (
    typeof event.occurredAt === "string" &&
    typeof event.payload === "object" &&
    event.payload !== null &&
    typeof (event.payload as { id?: unknown }).id === "string" &&
    (event.eventType === "NEW_LEAD" ||
      event.eventType === "LEAD_STATUS_CHANGED" ||
      event.eventType === "QUOTATION_UPDATED" ||
      event.eventType === "PROJECT_CREATED" ||
      event.eventType === "PROJECT_STATUS_CHANGED")
  );
}

function getNotificationCopy(event: AdminRealtimeEvent) {
  const label = event.payload.title || event.payload.name || "A record";

  switch (event.eventType) {
    case "NEW_LEAD":
      return { title: "New lead received", detail: `${label}${event.payload.source ? ` from ${event.payload.source}` : ""}.` };
    case "LEAD_STATUS_CHANGED":
      return { title: "Lead status changed", detail: `${label} is now ${event.payload.status || "updated"}.` };
    case "QUOTATION_UPDATED":
      return { title: "Quotation updated", detail: `${label} has new quotation data.` };
    case "PROJECT_CREATED":
      return { title: "Project created", detail: `Project ${event.payload.projectId || label} is ready for operations.` };
    case "PROJECT_STATUS_CHANGED":
      return { title: "Project status changed", detail: `${label} is now ${event.payload.status || "updated"}.` };
  }
}

function isCurrentViewAffected(pathname: string, eventType: AdminEventType) {
  if (eventType === "NEW_LEAD" || eventType === "LEAD_STATUS_CHANGED") {
    return pathname.includes("/admin/quotations") || pathname.includes("/admin/requests") || pathname.includes("/admin/crm");
  }
  if (eventType === "QUOTATION_UPDATED") return pathname.includes("/admin/quotations") || pathname.includes("/admin/crm");
  if (eventType === "PROJECT_CREATED") return pathname.includes("/admin/projects") || pathname.includes("/admin/crm");
  return pathname.includes("/admin/projects");
}

/**
 * Admin-only listener for refresh prompts. It intentionally never mutates
 * page data itself, preserving an operator's in-progress work.
 */
export default function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_ADMIN_REALTIME === "0") return;

    let eventSource: EventSource | null = null;
    let pollTimer: number | null = null;
    let pollController: AbortController | null = null;
    let cancelled = false;

    const handleEvent = (message: MessageEvent<string>) => {
      let data: unknown;
      try {
        data = JSON.parse(message.data);
      } catch {
        return;
      }
      if (!isAdminRealtimeEvent(data)) return;

      const copy = getNotificationCopy(data);
      const affected = isCurrentViewAffected(pathname, data.eventType);
      const refresh = () => {
        startTransition(() => router.refresh());
        toast.success("Refreshing current view…", { duration: 2000 });
      };

      toast.custom((toastId) => (
        <button
          type="button"
          onClick={() => {
            toast.dismiss(toastId);
            refresh();
          }}
          className="flex w-full min-w-[300px] max-w-md items-center gap-3 rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-3 text-left text-slate-100 shadow-2xl transition duration-300 ease-out hover:border-sky-300 hover:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{copy.title}</span>
            <span className="mt-0.5 block truncate text-xs text-slate-400">{copy.detail}</span>
          </span>
          <span className="shrink-0 rounded-md bg-sky-200 px-2.5 py-1.5 text-xs font-bold text-slate-950">
            {affected ? "Refresh table" : "Update"}
          </span>
        </button>
      ), {
        id: `admin-update-${data.eventType}-${data.payload.id}-${data.occurredAt}`,
        duration: 10000,
      });
    };

    const poll = async (cursor: string) => {
      pollController?.abort();
      const controller = new AbortController();
      pollController = controller;

      try {
        const response = await fetch(`/api/realtime/poll?cursor=${encodeURIComponent(cursor)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return cursor;
        const payload = await response.json() as { cursor?: unknown; events?: unknown };
        if (Array.isArray(payload.events)) {
          for (const event of payload.events) {
            handleEvent(new MessageEvent("message", { data: JSON.stringify(event) }));
          }
        }
        return typeof payload.cursor === "string" ? payload.cursor : cursor;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return cursor;
        return cursor;
      }
    };

    // Let the initial admin shell paint before opening a long-lived network
    // connection. Realtime remains automatic, but no longer competes with the
    // first document and route data requests.
    const connectionTimer = window.setTimeout(() => {
      if (cancelled) return;
      if (process.env.NEXT_PUBLIC_ADMIN_REALTIME === "poll") {
        let cursor = new Date().toISOString();
        const tick = async () => {
          if (cancelled) return;
          cursor = await poll(cursor);
          if (!cancelled) pollTimer = window.setTimeout(() => void tick(), 10_000);
        };
        void tick();
      } else {
        eventSource = new EventSource("/api/realtime/stream");
        eventSource.addEventListener("message", handleEvent);
      }
    }, 600);

    return () => {
      cancelled = true;
      window.clearTimeout(connectionTimer);
      if (pollTimer) window.clearTimeout(pollTimer);
      pollController?.abort();
      eventSource?.removeEventListener("message", handleEvent);
      eventSource?.close();
    };
  }, [pathname, router, startTransition]);

  return children;
}
