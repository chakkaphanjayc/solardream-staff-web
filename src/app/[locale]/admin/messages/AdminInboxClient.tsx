"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckCircle2, Circle as PauseCircle, MessageSquare, PlayCircle, RefreshCw, Send, UserRound } from "@/components/ui/icons";
import {
  claimChatThread,
  getStaffInboxThreads,
  getThreadMessages,
  releaseChatThread,
  returnChatThreadToAutomation,
  resetDifyConversationForThread,
  sendChatMessage,
  sendPublishedLineContentToThread,
  takeOverChatThread,
  updateThreadStatus,
  type ChatMessageDto,
  type ChatThreadDto,
} from "@/app/actions/chat";
import type { LineContentItemDto } from "@/app/actions/lineContent";
import { AdminEmptyState, AdminErrorState, AdminStatusBadge } from "@/components/admin/AdminPrimitives";

type InboxFilter = "all" | "waiting" | "takeover" | "open" | "resolved";

export default function AdminInboxClient({ initialThreads, initialError, initialContentItems }: { initialThreads: ChatThreadDto[]; initialError: string | null; initialContentItems: LineContentItemDto[] }) {
  const t = useTranslations("AdminInbox");
  const [threads, setThreads] = useState(initialThreads);
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [selectedThread, setSelectedThread] = useState<ChatThreadDto | null>(null);
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [composer, setComposer] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [selectedContentId, setSelectedContentId] = useState("");
  const [isWorking, startWorking] = useTransition();
  const [messagesLoading, setMessagesLoading] = useState(false);

  const filteredThreads = useMemo(() => threads.filter((thread) => {
    if (filter === "waiting") return thread.status === "UNASSIGNED";
    if (filter === "takeover") return thread.automationEnabled === false;
    if (filter === "open") return thread.status === "OPEN";
    if (filter === "resolved") return thread.status === "RESOLVED" || thread.status === "CLOSED";
    return true;
  }), [filter, threads]);

  const refresh = useCallback(async (keepSelected = true) => {
    const result = await getStaffInboxThreads();
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    const nextThreads = result.threads ?? [];
    setThreads(nextThreads);
    if (keepSelected && selectedThread) setSelectedThread(nextThreads.find((thread) => thread.id === selectedThread.id) ?? null);
  }, [selectedThread]);

  const openThread = useCallback(async (thread: ChatThreadDto) => {
    setSelectedThread(thread);
    setMessagesLoading(true);
    const result = await getThreadMessages(thread.id, { limit: 100 });
    setMessagesLoading(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setMessages(result.messages ?? []);
    setThreads((current) => current.map((item) => item.id === thread.id ? { ...item, unreadCount: 0 } : item));
  }, []);

  const performThreadAction = (action: (threadId: string) => Promise<{ success: boolean; error?: string }>, successMessage: string) => {
    if (!selectedThread) return;
    startWorking(async () => {
      const result = await action(selectedThread.id);
      if (!result.success) {
        toast.error(result.error || t("actionFailed"));
        return;
      }
      toast.success(successMessage);
      await refresh();
      const next = (await getStaffInboxThreads());
      if (next.success) {
        const updated = (next.threads ?? []).find((thread) => thread.id === selectedThread.id);
        if (updated) await openThread(updated);
      }
    });
  };

  const send = () => {
    if (!selectedThread || !composer.trim()) return;
    startWorking(async () => {
      const result = await sendChatMessage(selectedThread.id, composer, { isInternalNote });
      if (!result.success || !result.message) {
        toast.error(result.error);
        return;
      }
      setMessages((current) => [...current, result.message]);
      setComposer("");
      toast.success(isInternalNote ? t("noteAdded") : t("messageSent"));
      await refresh();
    });
  };

  const sendContent = () => {
    if (!selectedThread || !selectedContentId || selectedThread.automationEnabled !== false) return;
    startWorking(async () => {
      const result = await sendPublishedLineContentToThread(selectedThread.id, selectedContentId);
      if (!result.success || !result.message) {
        toast.error(result.error);
        return;
      }
      setMessages((current) => [...current, result.message]);
      setSelectedContentId("");
      toast.success(t("contentSent"));
      await refresh();
    });
  };

  const resetDify = () => {
    if (!selectedThread || !window.confirm(t("resetDifyConfirm"))) return;
    performThreadAction(resetDifyConversationForThread, t("difyReset"));
  };

  return <div data-bagui="admin-inbox" className="space-y-4">{initialError ? <AdminErrorState title={t("unavailable")} description={initialError} /> : null}<div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-1 rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] p-1" role="tablist" aria-label={t("filtersLabel")}>{(["all", "waiting", "takeover", "open", "resolved"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={filter === item} onClick={() => setFilter(item)} className={`min-h-9 rounded-md px-3 text-xs font-semibold ${filter === item ? "bg-[var(--solar-ops-hover)] text-[var(--solar-ops-text)]" : "text-[var(--solar-ops-muted)] hover:bg-[var(--solar-ops-hover)]"}`}>{t(`filters.${item}`)}</button>)}</div><button type="button" onClick={() => { void refresh(false); }} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--solar-ops-border)] px-3 text-xs font-semibold text-[var(--solar-ops-body)] hover:bg-[var(--solar-ops-hover)]"><RefreshCw className="size-3.5" aria-hidden="true" />{t("refresh")}</button></div><div className="grid min-h-[32rem] gap-4 xl:grid-cols-[minmax(18rem,0.34fr)_minmax(0,0.66fr)]"><section className="overflow-hidden rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)]" aria-labelledby="inbox-list-heading"><div className="border-b border-[var(--solar-ops-border)] px-4 py-3"><div className="flex items-center justify-between gap-2"><h2 id="inbox-list-heading" className="text-sm font-semibold text-[var(--solar-ops-text)]">{t("threads")}</h2><span className="text-xs text-[var(--solar-ops-muted)]">{filteredThreads.length}</span></div></div>{filteredThreads.length ? <div className="max-h-[42rem] overflow-y-auto">{filteredThreads.map((thread) => <button key={thread.id} type="button" onClick={() => { void openThread(thread); }} className={`block w-full border-b border-[var(--solar-ops-border)] px-4 py-3 text-left transition-colors hover:bg-[var(--solar-ops-hover)] ${selectedThread?.id === thread.id ? "bg-[var(--solar-ops-hover)]" : ""}`}><div className="flex items-start justify-between gap-3"><span className="min-w-0 truncate text-sm font-semibold text-[var(--solar-ops-text)]">{thread.customerName || t("customer")}</span>{thread.unreadCount ? <span className="rounded-full bg-[#238636] px-1.5 py-0.5 text-[10px] font-bold text-white">{thread.unreadCount}</span> : null}</div><p className="mt-1 truncate text-xs text-[var(--solar-ops-body)]">{thread.topic}</p><div className="mt-2 flex items-center justify-between gap-2"><AdminStatusBadge value={thread.automationEnabled === false ? t("human") : t("automated")} tone={thread.automationEnabled === false ? "info" : "success"} /><span className="text-[10px] text-[var(--solar-ops-muted)]">{new Date(thread.updatedAt).toLocaleString()}</span></div></button>)}</div> : <AdminEmptyState title={t("emptyTitle")} description={t("emptyDescription")} />}</section><section className="flex min-h-[32rem] flex-col overflow-hidden rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)]" aria-labelledby="inbox-thread-heading">{selectedThread ? <><div className="border-b border-[var(--solar-ops-border)] px-4 py-3"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 id="inbox-thread-heading" className="truncate text-sm font-semibold text-[var(--solar-ops-text)]">{selectedThread.customerName || t("customer")}</h2><p className="mt-1 truncate text-xs text-[var(--solar-ops-muted)]">{selectedThread.topic}</p></div><div className="flex flex-wrap gap-2"><AdminStatusBadge value={selectedThread.status} /><AdminStatusBadge value={selectedThread.automationEnabled === false ? t("human") : t("automated")} tone={selectedThread.automationEnabled === false ? "info" : "success"} /></div></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => performThreadAction(takeOverChatThread, t("takenOver"))} disabled={isWorking || selectedThread.automationEnabled === false || selectedThread.status === "CLOSED"} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#58a6ff]/50 px-3 text-xs font-semibold text-[#79c0ff] disabled:opacity-50"><PauseCircle className="size-3.5" aria-hidden="true" />{t("takeover")}</button><button type="button" onClick={() => performThreadAction(returnChatThreadToAutomation, t("returnedToAutomation"))} disabled={isWorking || selectedThread.automationEnabled !== false || selectedThread.status === "CLOSED"} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#3fb950]/50 px-3 text-xs font-semibold text-[#7ee787] disabled:opacity-50"><PlayCircle className="size-3.5" aria-hidden="true" />{t("returnToAutomation")}</button>{selectedThread.status === "UNASSIGNED" ? <button type="button" onClick={() => performThreadAction(claimChatThread, t("claimed"))} disabled={isWorking} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--solar-ops-border)] px-3 text-xs font-semibold text-[var(--solar-ops-body)] disabled:opacity-50"><UserRound className="size-3.5" aria-hidden="true" />{t("claim")}</button> : null}{selectedThread.status === "OPEN" ? <button type="button" onClick={() => performThreadAction(() => updateThreadStatus(selectedThread.id, "RESOLVED"), t("resolved"))} disabled={isWorking} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--solar-ops-border)] px-3 text-xs font-semibold text-[var(--solar-ops-body)] disabled:opacity-50"><CheckCircle2 className="size-3.5" aria-hidden="true" />{t("resolve")}</button> : null}<button type="button" onClick={() => performThreadAction(releaseChatThread, t("released"))} disabled={isWorking || !selectedThread.staffId || selectedThread.status === "CLOSED"} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--solar-ops-border)] px-3 text-xs font-semibold text-[var(--solar-ops-muted)] disabled:opacity-50">{t("release")}</button><button type="button" onClick={resetDify} disabled={isWorking} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#d29922]/50 px-3 text-xs font-semibold text-[#e3b341] disabled:opacity-50"><RefreshCw className="size-3.5" aria-hidden="true" />{t("resetDify")}</button></div></div><div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">{messagesLoading ? <p className="text-sm text-[var(--solar-ops-muted)]">{t("loading")}</p> : messages.length ? messages.map((message) => <article key={message.id} className={`max-w-[90%] rounded-lg border px-3 py-2 text-sm ${message.isInternalNote ? "border-[#d29922]/40 bg-[#d29922]/10" : "border-[var(--solar-ops-border)] bg-[var(--solar-ops-workspace)]"}`}><div className="flex items-center justify-between gap-3 text-[10px] text-[var(--solar-ops-muted)]"><span>{message.isInternalNote ? t("internalNote") : message.senderName || t("customer")}{message.source ? ` · ${message.source}` : ""}</span><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time></div><p className="mt-1 whitespace-pre-wrap break-words leading-6 text-[var(--solar-ops-body)]">{message.message}</p></article>) : <p className="text-sm text-[var(--solar-ops-muted)]">{t("noMessages")}</p>}</div><div className="border-t border-[var(--solar-ops-border)] p-3"><textarea value={composer} onChange={(event) => setComposer(event.target.value)} className="min-h-20 w-full rounded-md border border-[var(--solar-ops-border)] bg-[var(--solar-ops-workspace)] p-3 text-sm text-[var(--solar-ops-body)]" placeholder={t("composerPlaceholder")} disabled={isWorking} /><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><label className="flex min-h-9 items-center gap-2 text-xs text-[var(--solar-ops-muted)]"><input type="checkbox" checked={isInternalNote} onChange={(event) => setIsInternalNote(event.target.checked)} className="size-4 accent-[#d29922]" />{t("internalNoteToggle")}</label><button type="button" onClick={send} disabled={isWorking || !composer.trim()} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--solar-ops-green)] px-3 text-sm font-semibold text-white disabled:opacity-50"><Send className="size-4" aria-hidden="true" />{isInternalNote ? t("addNote") : t("send")}</button></div>{initialContentItems.length ? <div className="mt-3 border-t border-[var(--solar-ops-border)] pt-3"><label className="block text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{t("contentLibrary")}</span><select value={selectedContentId} onChange={(event) => setSelectedContentId(event.target.value)} className="w-full px-3 text-sm"><option value="">{t("selectContent")}</option>{initialContentItems.map((item) => <option key={item.id} value={item.id}>{item.internalName} · {item.contentType}</option>)}</select></label><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><p className="text-[11px] text-[var(--solar-ops-muted)]">{selectedThread.automationEnabled === false ? t("contentLibraryHint") : t("takeoverBeforeContent")}</p><button type="button" onClick={sendContent} disabled={isWorking || !selectedContentId || selectedThread.automationEnabled !== false} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#3fb950]/50 px-3 text-xs font-semibold text-[#7ee787] disabled:opacity-50"><Send className="size-3.5" aria-hidden="true" />{t("sendContent")}</button></div></div> : null}</div></> : <div className="flex flex-1 flex-col items-center justify-center p-8 text-center"><MessageSquare className="size-10 text-[var(--solar-ops-muted)]" aria-hidden="true" /><h2 className="mt-3 text-sm font-semibold text-[var(--solar-ops-text)]">{t("selectThread")}</h2><p className="mt-1 max-w-sm text-xs leading-5 text-[var(--solar-ops-muted)]">{t("selectThreadDescription")}</p></div>}</section></div></div>;
}
