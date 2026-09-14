"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, MessageSquareText, Send, ShieldCheck, UserRound } from "@/components/ui/icons";
import { toast } from "sonner";

import {
  getLineUserProfile,
  sendLinePushText,
  validateLinePushText,
  type LineEnvStatus,
  type LineUserProfile,
} from "@/app/actions/settings/lineSettings";

type LineMessageLabProps = {
  envStatus: LineEnvStatus;
  initialDestination?: string;
};

type LabAction = "validate" | "send" | "profile" | null;

export default function LineMessageLab({ envStatus, initialDestination = "" }: LineMessageLabProps) {
  const [destination, setDestination] = useState(initialDestination);
  const [message, setMessage] = useState("");
  const [lastAction, setLastAction] = useState<"validated" | "sent" | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [profile, setProfile] = useState<LineUserProfile | null>(null);
  const [busyAction, setBusyAction] = useState<LabAction>(null);
  const [isPending, startTransition] = useTransition();

  const validateMessage = () => {
    setBusyAction("validate");
    startTransition(async () => {
      try {
        const result = await validateLinePushText(message);
        if (!result.success) {
          toast.error(result.error);
          setLastAction(null);
          return;
        }

        setLastAction("validated");
        setRequestId(result.requestId);
        toast.success("LINE accepted this push message payload.");
      } finally {
        setBusyAction(null);
      }
    });
  };

  const sendMessage = () => {
    if (!window.confirm("Send this message through LINE Messaging API now?")) return;

    setBusyAction("send");
    startTransition(async () => {
      try {
        const result = await sendLinePushText(destination, message);
        if (!result.success) {
          toast.error(result.error);
          setLastAction(null);
          return;
        }

        setLastAction("sent");
        setRequestId(result.requestId);
        toast.success("Push message sent through LINE.");
      } finally {
        setBusyAction(null);
      }
    });
  };

  const loadProfile = () => {
    setBusyAction("profile");
    startTransition(async () => {
      try {
        const result = await getLineUserProfile(destination);
        if (!result.success) {
          toast.error(result.error);
          setProfile(null);
          return;
        }

        setProfile(result.profile);
        toast.success("LINE user profile loaded.");
      } finally {
        setBusyAction(null);
      }
    });
  };

  return (
    <section className="rounded-xl border border-slate-800 bg-[#0B1121] p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#B7D1EA]/20 bg-[#B7D1EA]/10 text-[#B7D1EA]">
          <MessageSquareText className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Message API lab</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Validate a text push before sending it to one LINE user, group, or room. Broadcast and audience sends stay out of this quick test to prevent accidental campaigns.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500" htmlFor="line-message-destination">
            Destination ID
          </label>
          <input
            id="line-message-destination"
            type="text"
            value={destination}
            onChange={(event) => {
              setDestination(event.target.value);
              setProfile(null);
            }}
            placeholder="U… / C… / R…"
            className="mt-2 min-h-11 w-full rounded-lg border border-slate-700 bg-[#0F172A] px-3 font-mono text-xs text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-[#B7D1EA]"
          />
          <p className="mt-2 text-[10px] leading-4 text-slate-500">The recipient must have added this Official Account or belong to a permitted chat.</p>
          <button
            type="button"
            onClick={loadProfile}
            disabled={isPending || !destination.trim().startsWith("U") || !envStatus.LINE_CHANNEL_ACCESS_TOKEN}
            className="mt-3 inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 text-[10px] font-semibold text-slate-200 transition hover:border-[#B7D1EA]/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <UserRound className="h-3.5 w-3.5" />
            {busyAction === "profile" ? "Loading profile…" : "Load user profile"}
          </button>
          {profile ? (
            <div className="mt-3 rounded-lg border border-slate-800 bg-[#0F172A] px-3 py-2.5">
              <p className="truncate text-xs font-semibold text-slate-100">{profile.displayName}</p>
              {profile.statusMessage ? <p className="mt-1 truncate text-[10px] text-slate-400">{profile.statusMessage}</p> : null}
              <p className="mt-1 font-mono text-[10px] text-slate-600">{profile.userId}</p>
            </div>
          ) : null}
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500" htmlFor="line-message-text">
            Text message
          </label>
          <textarea
            id="line-message-text"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={3}
            maxLength={5000}
            placeholder="Write a controlled test message"
            className="mt-2 w-full resize-y rounded-lg border border-slate-700 bg-[#0F172A] px-3 py-2.5 text-xs leading-5 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-[#B7D1EA]"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={validateMessage}
          disabled={isPending || !envStatus.LINE_CHANNEL_ACCESS_TOKEN}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-700 px-4 text-xs font-semibold text-slate-200 transition hover:border-[#B7D1EA]/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ShieldCheck className="h-4 w-4" />
          {busyAction === "validate" ? "Validating…" : "Validate message"}
        </button>
        <button
          type="button"
          onClick={sendMessage}
          disabled={isPending || !envStatus.LINE_CHANNEL_ACCESS_TOKEN || !destination.trim() || !message.trim()}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#B7D1EA] px-4 text-xs font-semibold text-[#0F172A] transition hover:bg-[#c7def1] disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
        >
          <Send className="h-4 w-4" />
          {busyAction === "send" ? "Sending…" : "Send push message"}
        </button>
        {lastAction ? (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {lastAction === "validated" ? "Payload valid" : "Message sent"}
            {requestId ? ` · ${requestId}` : ""}
          </span>
        ) : null}
      </div>
    </section>
  );
}
