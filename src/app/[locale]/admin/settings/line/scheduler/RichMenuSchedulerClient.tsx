"use client";

import { useEffect, useMemo, useState, useCallback, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Activity,
  BadgeCheck,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Plus,
  Play,
  Repeat2,
  Trash2,
  X,
  Zap,
} from "@/components/ui/icons";
import {
  getRichMenuProfileLabel,
  isRichMenuScheduleOverlap,
  type RichMenuProfileRecord,
  type RichMenuScheduleRecord,
  RICH_MENU_PROFILE_TYPES,
} from "@/lib/richMenuSchedulerTypes";
import { applyProfileScheduleNow } from "@/app/actions/settings/richMenuActions";
import { GsapPulse, GsapSpinner } from "@/components/ui/GsapMotion";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

type ZonedDateParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
};

function getZonedDateParts(value: Date, timeZone: string): ZonedDateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
  return {
    year: values.year ?? "0000",
    month: values.month ?? "01",
    day: values.day ?? "01",
    hour: values.hour ?? "00",
    minute: values.minute ?? "00",
    second: values.second ?? "00",
  };
}

function formatDateTime(value: string | Date, timeZone: string) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

function toDatetimeLocal(value: Date, timeZone: string) {
  const parts = getZonedDateParts(value, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function schedulerLocalToDate(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return new Date(value);
  const [, year, month, day, hour, minute] = match;
  const localAsUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  if (!Number.isFinite(localAsUtc)) return new Date(value);

  const getOffset = (candidate: Date) => {
    const parts = getZonedDateParts(candidate, timeZone);
    return Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    ) - candidate.getTime();
  };

  const firstUtc = localAsUtc - getOffset(new Date(localAsUtc));
  const secondUtc = localAsUtc - getOffset(new Date(firstUtc));
  return new Date(secondUtc);
}

function isScheduleActiveNow(schedule: RichMenuScheduleRecord): boolean {
  const now = new Date();
  return (
    schedule.isActive &&
    new Date(schedule.startTime) <= now &&
    new Date(schedule.endTime) > now
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Confirm Delete Modal
// ─────────────────────────────────────────────────────────────────────────────

function ConfirmDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  isDeleting,
  title,
  message,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
  title: string;
  message: string;
}) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-50 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-[#1E293B] bg-[#0F172A] p-6 shadow-none">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-xl p-1.5 text-gray-500 hover:bg-[#0B1121]"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100">
            <Trash2 className="h-5 w-5 text-rose-600" />
          </span>
          <h3 className="text-base font-black text-gray-100">{title}</h3>
        </div>
        <p className="mb-6 text-sm leading-6 text-gray-400">{message}</p>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="rounded-xl border border-[#1E293B] bg-[#0F172A] px-4 py-2 text-xs font-bold text-gray-400 transition hover:bg-[#0B1121] disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-black text-white transition hover:bg-rose-700 disabled:opacity-50"
          >
            {isDeleting ? (
              <GsapSpinner className="h-4 w-4" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {isDeleting ? "กำลังลบ..." : "ยืนยันลบ"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Add Schedule Modal (Feature 3a)
// ─────────────────────────────────────────────────────────────────────────────

function AddScheduleModal({
  isOpen,
  onClose,
  profiles,
  schedules,
  schedulerTimezone,
  onScheduleAdded,
}: {
  isOpen: boolean;
  onClose: () => void;
  profiles: RichMenuProfileRecord[];
  schedules: RichMenuScheduleRecord[];
  schedulerTimezone: string;
  onScheduleAdded: (schedule: RichMenuScheduleRecord) => void;
}) {
  const [profileType, setProfileType] = useState<RichMenuProfileRecord["profileType"]>(
    RICH_MENU_PROFILE_TYPES[0],
  );
  const [startTime, setStartTime] = useState(() =>
    toDatetimeLocal(new Date(), schedulerTimezone),
  );
  const [endTime, setEndTime] = useState(() =>
    toDatetimeLocal(new Date(Date.now() + 3600000), schedulerTimezone),
  );
  const [saving, setSaving] = useState(false);

  const selectedProfile = profiles.find((p) => p.profileType === profileType);

  // Client-side overlap conflict detection
  const conflictingSchedule = useMemo<RichMenuScheduleRecord | null>(() => {
    const start = schedulerLocalToDate(startTime, schedulerTimezone);
    const end = schedulerLocalToDate(endTime, schedulerTimezone);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) return null;
    return (
      schedules.find(
        (s) =>
          s.profileType === profileType &&
          isRichMenuScheduleOverlap(start, end, new Date(s.startTime), new Date(s.endTime)),
      ) ?? null
    );
  }, [startTime, endTime, profileType, schedules, schedulerTimezone]);

  const hasTimeError = useMemo(() => {
    const start = schedulerLocalToDate(startTime, schedulerTimezone);
    const end = schedulerLocalToDate(endTime, schedulerTimezone);
    return !isNaN(start.getTime()) && !isNaN(end.getTime()) && start >= end;
  }, [startTime, endTime, schedulerTimezone]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (hasTimeError) { toast.error("เวลาเริ่มต้นต้องน้อยกว่าเวลาสิ้นสุด"); return; }
    if (!selectedProfile?.lineRichMenuId) { toast.error("Profile นี้ยังไม่มี LINE Rich Menu ID"); return; }

    setSaving(true);
    try {
      const response = await fetch("/api/richmenu/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "schedule",
          profileType,
          startTime: schedulerLocalToDate(startTime, schedulerTimezone).toISOString(),
          endTime: schedulerLocalToDate(endTime, schedulerTimezone).toISOString(),
          overwrite: Boolean(conflictingSchedule),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Failed");
      toast.success(conflictingSchedule ? "เขียนทับ Schedule เดิมสำเร็จ" : "เพิ่ม Schedule สำเร็จ");
      onScheduleAdded(data.schedule as RichMenuScheduleRecord);
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-[#1E293B] bg-[#0F172A] shadow-none">
        {/* Modal header */}
        <div className="flex items-center justify-between border-b border-[#1E293B] p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#B7D1EA]/10">
              <CalendarPlus className="h-5 w-5 text-[#B7D1EA]" />
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-gray-500">
                Scheduling Engine
              </p>
              <h2 className="text-base font-black text-gray-100">เพิ่มช่วงเวลา Rich Menu</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-gray-500 hover:bg-[#0B1121]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          {/* User group selector */}
          <label className="block space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-gray-400">
              กลุ่มผู้ใช้ (User Group)
            </span>
            <select
              value={profileType}
              onChange={(e) => setProfileType(e.target.value as RichMenuProfileRecord["profileType"])}
              className="w-full rounded-xl border border-[#1E293B] bg-[#0B1121] px-4 py-3 text-sm text-gray-100 outline-none focus:border-[#B7D1EA] focus:ring-4 focus:ring-[#B7D1EA]/10"
            >
              {RICH_MENU_PROFILE_TYPES.map((type) => {
                const p = profiles.find((pr) => pr.profileType === type);
                return (
                  <option key={type} value={type}>
                    {getRichMenuProfileLabel(type)}
                    {p?.lineRichMenuId ? "" : " — ⚠️ ยังไม่มี LINE Menu ID"}
                  </option>
                );
              })}
            </select>
          </label>

          {/* Show selected profile's LINE Rich Menu ID for reference */}
          {selectedProfile?.lineRichMenuId ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-800">
              <span className="font-black">LINE Rich Menu ID:</span>{" "}
              <span className="font-mono">{selectedProfile.lineRichMenuId}</span>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-800">
              ⚠️ Profile นี้ยังไม่มี LINE Rich Menu ID — กรุณาบันทึก Profile ก่อน
            </div>
          )}

          {/* Date range */}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-gray-400">
                เวลาเริ่มต้น
              </span>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={`w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-4 ${
                  hasTimeError
                    ? "border-rose-300 bg-rose-500/10 focus:border-rose-400 focus:ring-rose-100"
                    : "border-[#1E293B] bg-[#0B1121] text-gray-100 focus:border-[#B7D1EA] focus:ring-[#B7D1EA]/10"
                }`}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-gray-400">
                เวลาสิ้นสุด
              </span>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={`w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-4 ${
                  hasTimeError
                    ? "border-rose-300 bg-rose-500/10 focus:border-rose-400 focus:ring-rose-100"
                    : "border-[#1E293B] bg-[#0B1121] text-gray-100 focus:border-[#B7D1EA] focus:ring-[#B7D1EA]/10"
                }`}
              />
            </label>
          </div>
          <p className="-mt-2 text-[11px] leading-5 text-slate-400">
            Times are entered and displayed in <span className="font-semibold text-slate-200">{schedulerTimezone}</span>. The server stores UTC instants so cron workers and staff in other time zones use the same window.
          </p>

          {/* Time error */}
          {hasTimeError && (
            <div className="rounded-xl border border-rose-200 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-700">
              🚫 เวลาเริ่มต้นต้องอยู่ก่อนเวลาสิ้นสุด
            </div>
          )}

          {/* Overlap conflict warning ───────────────────────────────────────────
              Logic: existingStart < newEnd AND existingEnd > newStart
          ──────────────────────────────────────────────────────────────────── */}
          {!hasTimeError && conflictingSchedule && (
            <div className="rounded-xl border border-amber-200 bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
              <p className="font-black uppercase tracking-wide">⚠️ ช่วงเวลาทับซ้อน — จะเขียนทับ Schedule เดิม</p>
              <p className="mt-1">
                กลุ่ม{" "}
                <strong>{getRichMenuProfileLabel(conflictingSchedule.profileType)}</strong>{" "}
                มี Schedule ในช่วง{" "}
                <strong>{formatDateTime(conflictingSchedule.startTime, schedulerTimezone)}</strong> ถึง{" "}
                <strong>{formatDateTime(conflictingSchedule.endTime, schedulerTimezone)}</strong>{" "}
                ซึ่งทับซ้อนกับเวลาที่เลือก
              </p>
              <p className="mt-1 font-medium text-amber-700">
                เมื่อกด Overwrite ระบบจะลบ Schedule ที่ชนกันของกลุ่มนี้ แล้วบันทึกช่วงเวลาใหม่แทน
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-[#1E293B] bg-[#0F172A] px-4 py-2.5 text-xs font-bold text-gray-400 transition hover:bg-[#0B1121] disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={
                saving ||
                hasTimeError ||
                !selectedProfile?.lineRichMenuId
              }
              className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-black text-white transition disabled:cursor-not-allowed disabled:bg-[#1E293B] disabled:text-gray-500 ${
                conflictingSchedule
                  ? "bg-amber-600 hover:bg-amber-700"
                  : "bg-[#B7D1EA] hover:bg-[#99BFE3]"
              }`}
            >
              {saving ? (
                <GsapSpinner className="h-4 w-4" />
              ) : (
                <CalendarPlus className="h-4 w-4" />
              )}
              {saving
                ? "กำลังบันทึก..."
                : conflictingSchedule
                  ? "Overwrite Existing Schedule"
                  : "บันทึก Schedule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Active Status Dashboard
// ─────────────────────────────────────────────────────────────────────────────

function ActiveStatusDashboard({
  schedules,
  profiles,
  schedulerTimezone,
}: {
  schedules: RichMenuScheduleRecord[];
  profiles: RichMenuProfileRecord[];
  schedulerTimezone: string;
}) {
  const profileLineMenuMap = useMemo(
    () => new Map(profiles.map((p) => [p.profileType, p.lineRichMenuId])),
    [profiles],
  );

  const summaryItems = useMemo(() => {
    const now = new Date();
    return RICH_MENU_PROFILE_TYPES.map((profileType) => {
      const activeSchedule = schedules.find(
        (s) =>
          s.profileType === profileType &&
          s.isActive &&
          new Date(s.startTime) <= now &&
          new Date(s.endTime) > now,
      );
      return {
        profileType,
        profileLabel: getRichMenuProfileLabel(profileType),
        lineRichMenuId:
          activeSchedule?.lineRichMenuId ??
          profileLineMenuMap.get(profileType) ??
          null,
        endTime: activeSchedule ? new Date(activeSchedule.endTime) : null,
        isActiveNow: Boolean(activeSchedule),
      };
    });
  }, [schedules, profileLineMenuMap]);

  const activeCount = summaryItems.filter((s) => s.isActiveNow).length;

  return (
    <section className="space-y-4 rounded-2xl border border-slate-800 bg-[#0F172A] p-6 shadow-none">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">
            Live Dashboard
          </p>
          <h2 className="mt-1.5 text-2xl font-black text-white">
            Active Status — Real Time
          </h2>
          <p className="mt-1.5 text-sm font-medium leading-6 text-slate-300">
            Rich Menu ที่กำลังแสดงผลบนหน้าจอ LINE ของลูกค้าในขณะนี้
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-[#B7D1EA]/40 bg-[#B7D1EA]/15 px-3 py-1.5">
          <Activity className="h-4 w-4 text-[#B7D1EA]" />
          <span className="text-[11px] font-black uppercase tracking-wider text-[#B7D1EA]">
            {activeCount} Active
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryItems.map((item) => (
          <div
            key={item.profileType}
            className={`relative overflow-hidden rounded-2xl border p-4 transition-all ${
              item.isActiveNow
                ? "border-[#B7D1EA]/50 bg-slate-900 shadow-xs"
                : "border-slate-800 bg-slate-900/60"
            }`}
          >
            {item.isActiveNow && (
              <span className="absolute right-3 top-3 flex h-2.5 w-2.5">
                <GsapPulse className="absolute inline-flex h-full w-full rounded-full bg-[#B7D1EA] opacity-75" scale={1.75}>
                  <span className="sr-only">Active</span>
                </GsapPulse>
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#B7D1EA]" />
              </span>
            )}
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">
              {item.profileType}
            </p>
            <h3 className="mt-1.5 text-sm font-black text-white">{item.profileLabel}</h3>
            {item.isActiveNow ? (
              <>
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#B7D1EA]/40 bg-[#B7D1EA] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.2em] text-[#0F172A]">
                  <CheckCircle2 className="h-3 w-3" />
                  ACTIVE NOW
                </span>
                {item.lineRichMenuId && (
                  <p className="mt-2 truncate font-mono text-[10px] text-slate-400">
                    {item.lineRichMenuId}
                  </p>
                )}
                {item.endTime && (
                  <p className="mt-1 text-[10px] text-slate-400">
                    ถึง {formatDateTime(item.endTime, schedulerTimezone)}
                  </p>
                )}
              </>
            ) : (
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400">
                <CircleDashed className="h-3.5 w-3.5" />
                <span>ไม่มี Schedule Active</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Add / Swap Profile Modal
// ─────────────────────────────────────────────────────────────────────────────

function ProfileMappingModal({
  isOpen,
  onClose,
  initialProfile,
  onProfileSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialProfile: RichMenuProfileRecord | null;
  onProfileSaved: (profile: RichMenuProfileRecord) => void;
}) {
  const [profileType, setProfileType] = useState<RichMenuProfileRecord["profileType"]>(
    initialProfile?.profileType ?? RICH_MENU_PROFILE_TYPES[0],
  );
  const [name, setName] = useState(initialProfile?.name ?? getRichMenuProfileLabel(RICH_MENU_PROFILE_TYPES[0]));
  const [description, setDescription] = useState(initialProfile?.description ?? "");
  const [lineRichMenuId, setLineRichMenuId] = useState(initialProfile?.lineRichMenuId ?? "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanName = name.trim() || getRichMenuProfileLabel(profileType);
    setSaving(true);
    try {
      const response = await fetch("/api/richmenu/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "profile",
          profileType,
          name: cleanName,
          description: description.trim() || null,
          imageUrl: null,
          lineRichMenuId: lineRichMenuId.trim() || null,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        profile?: RichMenuProfileRecord;
      };

      if (!response.ok || !data.success || !data.profile) {
        throw new Error(data.error || "บันทึกข้อมูลไม่สำเร็จ");
      }

      onProfileSaved(data.profile);
      toast.success(
        initialProfile
          ? `อัปเดต LINE Rich Menu ID ของกลุ่ม "${cleanName}" สำเร็จ`
          : `ผูกกลุ่มผู้ใช้ "${cleanName}" สำเร็จ`,
      );
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs" onClick={onClose} />
      <div className="relative z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-[#0F172A] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#B7D1EA]/15 text-[#B7D1EA]">
              {initialProfile ? (
                <Repeat2 className="h-5 w-5 text-[#B7D1EA]" />
              ) : (
                <Plus className="h-5 w-5 text-[#B7D1EA]" />
              )}
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">
                User Group Mapping
              </p>
              <h2 className="text-base font-black text-white">
                {initialProfile ? "Edit Rich Menu Profile" : "Link Rich Menu to User Group"}
              </h2>
            </div>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              User Group
            </span>
            <select
              value={profileType}
              disabled={Boolean(initialProfile)}
              onChange={(event) => {
                const nextType = event.target.value as RichMenuProfileRecord["profileType"];
                setProfileType(nextType);
                setName(getRichMenuProfileLabel(nextType));
              }}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-bold text-white outline-none focus:border-[#B7D1EA] disabled:opacity-60"
            >
              {RICH_MENU_PROFILE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {getRichMenuProfileLabel(type)}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Display Name
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-bold text-white outline-none focus:border-[#B7D1EA]"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Description
            </span>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional note for this user segment"
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-semibold text-white outline-none focus:border-[#B7D1EA]"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              LINE Rich Menu ID
            </span>
            <input
              value={lineRichMenuId}
              onChange={(event) => setLineRichMenuId(event.target.value)}
              placeholder="richmenu-..."
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 font-mono text-xs text-white outline-none focus:border-[#B7D1EA]"
            />
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700 hover:text-white disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-[#B7D1EA] px-5 py-2.5 text-xs font-black text-[#0F172A] transition hover:bg-[#99BFE3] disabled:opacity-50"
            >
              {saving ? (
                <GsapSpinner className="h-4 w-4" />
              ) : initialProfile ? (
                <Repeat2 className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {saving ? "Saving..." : initialProfile ? "Update Profile" : "Save Profile"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function RichMenuSchedulerClient({
  initialProfiles,
  initialSchedules,
  schedulerTimezone,
}: {
  initialProfiles: RichMenuProfileRecord[];
  initialSchedules: RichMenuScheduleRecord[];
  schedulerTimezone: string;
}) {
  const [profiles, setProfiles] = useState(initialProfiles);
  const [schedules, setSchedules] = useState(initialSchedules);
  const [applyingProfileType, setApplyingProfileType] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [profileModalTarget, setProfileModalTarget] = useState<RichMenuProfileRecord | null | "new">(null);
  const [resetAllOpen, setResetAllOpen] = useState(false);
  const [resettingAll, setResettingAll] = useState(false);

  // Confirm delete state
  const [deleteTarget, setDeleteTarget] = useState<{
    kind: "profile" | "schedule";
    id: string;
    profileType?: string;
    label: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const selection = useAdminSelection(schedules.map((schedule) => schedule.id));

  // ── Feature 1: Apply Now ────────────────────────────────────────────────────
  const handleApplyNow = useCallback(async (profileType: RichMenuProfileRecord["profileType"]) => {
    setApplyingProfileType(profileType);
    try {
      const result = await applyProfileScheduleNow(profileType);
      const label = getRichMenuProfileLabel(profileType);
      if (!result.success) {
        toast.error(result.error ?? "ไม่สามารถส่งคำสั่งไปยัง LINE API ได้");
        return;
      }
      if (result.simulated) {
        toast.info(`[Simulated] Apply Now สำหรับกลุ่ม ${label} — ไม่มี Token จริง`);
      } else {
        toast.success(`ส่ง Rich Menu ไปยังกลุ่ม ${label} สำเร็จ — ${result.linkedCount ?? 0} ผู้ใช้`);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setApplyingProfileType(null);
    }
  }, []);

  // ── Feature 3b: Delete Schedule (via /api/richmenu/mapping/[id]) ────────────
  // ── Feature 1: Delete Profile (via /api/admin/richmenu/profile/[id]) ────────
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      let url: string;
      if (deleteTarget.kind === "schedule") {
        url = `/api/richmenu/mapping/${deleteTarget.id}`;
      } else {
        url = `/api/admin/richmenu/profile/${deleteTarget.id}`;
      }

      const res = await fetch(url, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to delete");

      if (deleteTarget.kind === "profile") {
        // Remove profile + all its schedules from local state
        setProfiles((prev) => prev.filter((p) => p.id !== deleteTarget.id));
        setSchedules((prev) => prev.filter((s) => s.profileType !== deleteTarget.profileType));
        const deletedSchedules = (data as { deletedScheduleCount?: number }).deletedScheduleCount ?? 0;
        const unlinked = (data as { totalLineUnlinkedUsers?: number }).totalLineUnlinkedUsers ?? 0;
        toast.success(
          `ลบ Profile "${deleteTarget.label}" สำเร็จ — ${deletedSchedules} Schedules ถูกลบ${unlinked > 0 ? `, ${unlinked} LINE ผู้ใช้ถูกปลดล็อก` : ""}`,
        );
      } else {
        setSchedules((prev) => prev.filter((s) => s.id !== deleteTarget.id));
        const wasActive = (data as { wasActive?: boolean }).wasActive;
        toast.success(
          wasActive
            ? "ลบ Schedule สำเร็จ และยกเลิก Rich Menu จาก LINE ของผู้ใช้แล้ว"
            : "ลบ Schedule สำเร็จ",
        );
      }
      setDeleteTarget(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget]);

  const handleBulkDeleteSchedules = async () => {
    if (selection.selectedCount === 0) return;
    if (!window.confirm(`Delete ${selection.selectedCount} selected schedule(s)? Active menus may be unlinked from LINE.`)) return;
    setDeleting(true);
    try {
      const ids = selection.selectedIds;
      const results = await Promise.all(ids.map(async (id) => {
        const response = await fetch(`/api/richmenu/mapping/${encodeURIComponent(id)}`, { method: "DELETE" });
        const payload: unknown = await response.json();
        if (!response.ok || !payload || typeof payload !== "object" || (payload as { success?: unknown }).success !== true) {
          throw new Error("A schedule could not be deleted.");
        }
        return id;
      }));
      setSchedules((current) => current.filter((schedule) => !results.includes(schedule.id)));
      selection.clear();
      toast.success(`${results.length} schedule(s) deleted.`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Some schedules could not be deleted.");
    } finally {
      setDeleting(false);
    }
  };

  // ── Schedule added callback ─────────────────────────────────────────────────
  const handleScheduleAdded = useCallback((schedule: RichMenuScheduleRecord) => {
    setSchedules((prev) =>
      [
        ...prev.filter(
          (existingSchedule) =>
            existingSchedule.profileType !== schedule.profileType ||
            !isRichMenuScheduleOverlap(
              new Date(schedule.startTime),
              new Date(schedule.endTime),
              new Date(existingSchedule.startTime),
              new Date(existingSchedule.endTime),
            ),
        ),
        schedule,
      ].sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
      ),
    );
  }, []);

  const handleProfileSaved = useCallback((profile: RichMenuProfileRecord) => {
    setProfiles((prev) => {
      const withoutExisting = prev.filter((item) => item.profileType !== profile.profileType);
      return [...withoutExisting, profile].sort(
        (a, b) =>
          RICH_MENU_PROFILE_TYPES.indexOf(a.profileType) -
          RICH_MENU_PROFILE_TYPES.indexOf(b.profileType),
      );
    });
    if (profile.lineRichMenuId) {
      setSchedules((prev) =>
        prev.map((schedule) =>
          schedule.profileType === profile.profileType
            ? { ...schedule, lineRichMenuId: profile.lineRichMenuId ?? schedule.lineRichMenuId }
            : schedule,
        ),
      );
    }
  }, []);

  const handleResetAll = useCallback(async () => {
    setResettingAll(true);
    try {
      const res = await fetch("/api/admin/richmenu/reset-all", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Reset all failed");
      }
      setProfiles([]);
      setSchedules([]);
      setResetAllOpen(false);
      toast.success(
        `Reset สำเร็จ: ลบ LINE ${data.deletedFromLine ?? 0}, Profiles ${data.deletedProfiles ?? 0}, Schedules ${data.deletedSchedules ?? 0}`,
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setResettingAll(false);
    }
  }, []);

  // ── Group schedules by profileType for the table ────────────────────────────
  const schedulesByProfile = useMemo(() => {
    const map = new Map<string, RichMenuScheduleRecord[]>();
    for (const s of schedules) {
      const key = s.profileType;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [schedules]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Add Schedule Modal — Feature 3a */}
      <AddScheduleModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        profiles={profiles}
        schedules={schedules}
        schedulerTimezone={schedulerTimezone}
        onScheduleAdded={handleScheduleAdded}
      />

      <ProfileMappingModal
        key={profileModalTarget === "new" ? "new" : profileModalTarget?.id ?? "closed"}
        isOpen={profileModalTarget !== null}
        onClose={() => setProfileModalTarget(null)}
        initialProfile={profileModalTarget === "new" ? null : profileModalTarget}
        onProfileSaved={handleProfileSaved}
      />

      {/* Confirm Delete Modal */}
      <ConfirmDeleteModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        isDeleting={deleting}
        title={deleteTarget?.kind === "profile" ? "ลบ Profile ทั้งชุด" : "ลบ Schedule"}
        message={
          deleteTarget?.kind === "profile"
            ? `ลบ Profile "${deleteTarget?.label}" และ Schedule ที่เชื่อมอยู่ทั้งหมด? หากมี Schedule Active อยู่ ระบบจะยิง LINE Unlink API ให้ผู้ใช้เด้งกลับเมนูเริ่มต้นอัตโนมัติ`
            : `ลบ Schedule ของกลุ่ม "${deleteTarget?.label}"? หากเมนูกำลัง Active อยู่ ระบบจะ Unlink จาก LINE ก่อนลบ`
        }
      />

      <ConfirmDeleteModal
        isOpen={resetAllOpen}
        onClose={() => setResetAllOpen(false)}
        onConfirm={() => void handleResetAll()}
        isDeleting={resettingAll}
        title="Reset All Rich Menus"
        message="ลบ Rich Menu ทั้งหมดจาก LINE API และล้าง Profiles, Schedules, Drafts ในฐานข้อมูล? การกระทำนี้ย้อนกลับไม่ได้"
      />

      <div className="space-y-6">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setResetAllOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/15 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-rose-300 transition hover:bg-rose-500/25"
          >
            <Trash2 className="h-4 w-4" />
            Reset All Rich Menus
          </button>
        </div>

        {/* ── Feature 4: Active Status Dashboard ── */}
        <ActiveStatusDashboard schedules={schedules} profiles={profiles} schedulerTimezone={schedulerTimezone} />

        {/* ── User Group Mappings ── */}
        <section className="rounded-2xl border border-slate-800 bg-[#0F172A] p-6 shadow-none">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">
                User Group Mappings
              </p>
              <h2 className="mt-1.5 text-xl font-black text-white">Rich Menu Profiles Linked to User Groups</h2>
              <p className="mt-1 text-sm font-medium text-slate-300">
                กำหนด LINE Rich Menu ID ต่อ User Group. เมื่อ user ถูกจัดกลุ่มใหม่ ระบบจะใช้ Rich Menu ของกลุ่มนั้นในรอบ Schedule หรือ Apply Now ถัดไป
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setProfileModalTarget("new")}
                className="inline-flex items-center gap-2 rounded-xl bg-[#B7D1EA] px-4 py-2.5 text-xs font-black text-[#0F172A] transition hover:bg-[#99BFE3]"
              >
                <Plus className="h-4 w-4" />
                Link User Group
              </button>
              <BadgeCheck className="hidden h-5 w-5 text-[#B7D1EA] sm:block" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
            {profiles.map((profile) => {
              const isApplying = applyingProfileType === profile.profileType;
              const profileSchedules = schedulesByProfile.get(profile.profileType) ?? [];
              const activeSchedule = profileSchedules.find(isScheduleActiveNow);

              return (
                <div
                  key={profile.id}
                  className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-5"
                >
                  {/* Active indicator */}
                  {activeSchedule && (
                    <span className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full border border-[#B7D1EA]/40 bg-[#B7D1EA] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#0F172A]">
                      <span className="relative flex h-2 w-2">
                        <GsapPulse className="absolute inline-flex h-full w-full rounded-full bg-[#0F172A] opacity-75" scale={1.75}>
                          <span className="sr-only">Active</span>
                        </GsapPulse>
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#0F172A]" />
                      </span>
                      ACTIVE NOW
                    </span>
                  )}

                  {/* Profile header */}
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">
                    {profile.profileType}
                  </p>
                  <h3 className="mt-1 text-base font-black text-white">{profile.name}</h3>
                  {profile.description && (
                    <p className="mt-0.5 text-xs text-gray-400">{profile.description}</p>
                  )}

                  {/* LINE Rich Menu ID display */}
                  <div className="mt-3 rounded-xl border border-[#1E293B] bg-[#0F172A] px-3.5 py-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-500">
                      LINE Rich Menu ID
                    </p>
                    {profile.lineRichMenuId ? (
                      <p className="mt-0.5 truncate font-mono text-[11px] font-bold text-gray-300">
                        {profile.lineRichMenuId}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-[11px] text-gray-500">— ยังไม่ได้กำหนด —</p>
                    )}
                  </div>

                  {/* Schedule count badge */}
                  <div className="mt-3 flex items-center gap-2">
                    <CalendarClock className="h-3.5 w-3.5 text-gray-500" />
                    <span className="text-[11px] text-gray-400">
                      {profileSchedules.length} Schedule{profileSchedules.length !== 1 ? "s" : ""}
                    </span>
                    <ChevronRight className="h-3 w-3 text-slate-300" />
                    <span className="text-[11px] text-gray-500">
                      {profileSchedules.filter(isScheduleActiveNow).length > 0 ? "1 Active" : "None Active"}
                    </span>
                  </div>

                  {/* Action buttons */}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {/* Apply Now — Feature 1 */}
                    <button
                      type="button"
                      disabled={isApplying || !profile.lineRichMenuId}
                      onClick={() => void handleApplyNow(profile.profileType)}
                      title={!profile.lineRichMenuId ? "ยังไม่มี LINE Rich Menu ID" : "ส่ง Rich Menu ที่ Active ให้ผู้ใช้กลุ่มนี้"}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#B7D1EA] bg-[#B7D1EA]/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-gray-300 transition hover:bg-[#B7D1EA]/25 disabled:cursor-not-allowed disabled:opacity-40"
                    >
	                      {isApplying ? (
	                        <GsapSpinner className="h-3.5 w-3.5 text-[#B7D1EA]" />
	                      ) : (
                        <Zap className="h-3.5 w-3.5 text-[#B7D1EA]" />
                      )}
                      {isApplying ? "Applying..." : "Apply Now"}
                    </button>

                    <button
                      type="button"
                      onClick={() => setProfileModalTarget(profile)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#1E293B] bg-[#0F172A] px-3 py-2 text-[10px] font-black uppercase tracking-wider text-gray-400 transition hover:bg-[#0B1121]"
                    >
                      <Repeat2 className="h-3.5 w-3.5 text-gray-400" />
                      Swap ID
                    </button>

                    {/* Delete Profile — Feature 1/3c */}
                    <button
                      type="button"
                      onClick={() =>
                        setDeleteTarget({
                          kind: "profile",
                          id: profile.id,
                          profileType: profile.profileType,
                          label: profile.name,
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-rose-600 transition hover:bg-rose-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete Profile
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Schedule Management ── */}
        <section className="rounded-2xl border border-[#1E293B] bg-[#0F172A] p-6 shadow-none">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-gray-400">
                Scheduling Engine
              </p>
              <h2 className="mt-1.5 text-xl font-black text-gray-100">Schedule Management</h2>
              <p className="mt-1 text-sm text-gray-400">
                กำหนดช่วงเวลาที่แต่ละ Rich Menu จะแสดงผล — ระบบจะปฏิเสธช่วงเวลาที่ทับซ้อนกัน
              </p>
            </div>
            {/* Feature 3a: Add Schedule button */}
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#B7D1EA] px-4 py-2.5 text-xs font-black text-white transition hover:bg-[#99BFE3]"
            >
              <CalendarPlus className="h-4 w-4" />
              เพิ่ม Schedule
            </button>
          </div>

          {/* Schedules table */}
          <div className="space-y-3">
          <AdminBulkActionBar
            selectedCount={selection.selectedCount}
            visibleCount={schedules.length}
            allVisibleSelected={selection.allVisibleSelected}
            someVisibleSelected={selection.someVisibleSelected}
            onToggleVisible={selection.toggleVisible}
            onClear={selection.clear}
            isPending={deleting}
            actions={[{
              id: "delete",
              label: "Delete",
              icon: Trash2,
              tone: "danger",
              onClick: () => void handleBulkDeleteSchedules(),
            }]}
          />
          <div className="overflow-hidden rounded-2xl border border-[#1E293B]">
            <table className="min-w-full divide-y divide-slate-200 text-left">
              <thead className="bg-[#0B1121]">
                <tr className="text-[10px] font-black uppercase tracking-[0.28em] text-gray-500">
                  <th className="w-14 px-5 py-3.5">
                    <AdminSelectionCheckbox
                      checked={selection.allVisibleSelected}
                      indeterminate={selection.someVisibleSelected}
                      disabled={schedules.length === 0 || deleting}
                      label="Select all schedules"
                      onChange={selection.toggleVisible}
                    />
                  </th>
                  <th className="px-5 py-3.5">Profile</th>
                  <th className="px-5 py-3.5">LINE Rich Menu ID</th>
                  <th className="px-5 py-3.5">เวลาเริ่ม</th>
                  <th className="px-5 py-3.5">เวลาสิ้นสุด</th>
                  <th className="px-5 py-3.5">สถานะ</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-[#0F172A]">
                {schedules.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-12 text-center text-xs font-bold uppercase tracking-widest text-gray-500"
                    >
                      ยังไม่มีตารางเวลา. กดปุ่ม เพิ่ม Schedule เพื่อเริ่มต้น
                    </td>
                  </tr>
                ) : (
                  schedules.map((schedule) => {
                    const active = isScheduleActiveNow(schedule);
                    return (
                      <tr
                        key={schedule.id}
                        className={`transition-colors ${
                          active ? "bg-emerald-500/10 hover:bg-emerald-500/10" : "hover:bg-[#0B1121]/70"
                        }`}
                      >
                        <td className="px-5 py-4">
                          <AdminSelectionCheckbox
                            checked={selection.isSelected(schedule.id)}
                            disabled={deleting}
                            label={`Select schedule for ${getRichMenuProfileLabel(schedule.profileType)}`}
                            onChange={() => selection.toggle(schedule.id)}
                          />
                        </td>
                        <td className="px-5 py-4">
                          <div>
                            <p className="text-sm font-black text-gray-100">
                              {getRichMenuProfileLabel(schedule.profileType)}
                            </p>
                            <p className="text-[10px] font-mono text-gray-500">
                              {schedule.profileType}
                            </p>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <p className="max-w-[180px] truncate font-mono text-[11px] text-gray-400">
                            {schedule.lineRichMenuId || "—"}
                          </p>
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-400">
                          {formatDateTime(schedule.startTime, schedulerTimezone)}
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-400">
                          {formatDateTime(schedule.endTime, schedulerTimezone)}
                        </td>
                        <td className="px-5 py-4">
                          {active ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.35em] text-emerald-700">
	                              <span className="relative flex h-2 w-2">
	                                <GsapPulse className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" scale={1.75}>
                                    <span className="sr-only">Active</span>
                                  </GsapPulse>
	                                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
	                              </span>
                              ACTIVE NOW
                            </span>
                          ) : (
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.35em] ${
                                schedule.isActive
                                  ? "border-[#1E293B] bg-[#0B1121] text-gray-400"
                                  : "border-[#1E293B] bg-[#0B1121] text-gray-500"
                              }`}
                            >
                              {schedule.isActive ? "Scheduled" : "Disabled"}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {active && (
                              <button
                                type="button"
                                onClick={() => void handleApplyNow(schedule.profileType)}
                                disabled={applyingProfileType === schedule.profileType}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-[#B7D1EA] bg-[#B7D1EA]/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-gray-300 transition hover:bg-[#B7D1EA]/25 disabled:opacity-50"
                              >
                                <Play className="h-3.5 w-3.5 text-[#B7D1EA]" />
                                Apply
                              </button>
                            )}
                            {/* Feature 3b: Delete Schedule */}
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteTarget({
                                  kind: "schedule",
                                  id: schedule.id,
                                  label: getRichMenuProfileLabel(schedule.profileType),
                                })
                              }
                              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-rose-600 transition hover:bg-rose-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          </div>

          {/* Summary footer */}
          <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
            <span>{schedules.length} Schedule{schedules.length !== 1 ? "s" : ""} ทั้งหมด</span>
            <span>{schedules.filter(isScheduleActiveNow).length} กำลัง Active</span>
          </div>
        </section>
      </div>
    </>
  );
}
