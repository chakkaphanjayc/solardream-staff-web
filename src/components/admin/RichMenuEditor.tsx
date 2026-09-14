"use client";

import { useState, useEffect, useTransition, useRef, useMemo, useCallback, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import {
  LayoutGrid,
  Type,
  Link as LinkIcon,
  Info,
  Save,
  CheckCircle2,
  Copy,
  Smartphone,
  Layers,
  Plus,
  Image as ImageIcon,
  Send,
  AlertTriangle,
  Eye,
  EyeOff,
  X,
  CalendarPlus,
  Users,
  SkipForward,
  Trash2,
  Upload,
} from "@/components/ui/icons";
import { toast } from "sonner";
import {
  deleteRichMenuDraftAction,
  getRichMenusAction,
  saveRichMenuDraftAction,
  uploadRichMenuImage,
  RichMenuRecord,
  type RichMenuArea,
} from "@/app/actions/settings/lineSettings";
import {
  RICH_MENU_PROFILE_TYPES,
  getRichMenuProfileLabel,
  isRichMenuScheduleOverlap,
  type RichMenuProfileType,
  type RichMenuScheduleRecord,
} from "@/lib/richMenuSchedulerTypes";
import { GsapPulse, GsapSpinner } from "@/components/ui/GsapMotion";

// ── Types ─────────────────────────────────────────────────────────────────────
type LayoutTemplate =
  | "4-cell"   // T-Shape: full top + 3 bottom
  | "6-cell"   // 3×2 equal grid
  | "3-cell"   // Single row 3 columns
  | "2-cell"   // 2 stacked full-width rows
  | "large-left"  // Large left + 2 stacked right
  | "2x2";     // 2×2 square grid

type CellId = "A" | "B" | "C" | "D" | "E" | "F";

interface CellConfig {
  label: string;
  showLabel: boolean; // Whether to composite label text onto image
  type: "message" | "uri";
  value: string;
}

type CellsState = Record<CellId, CellConfig>;

interface RichMenuEditorProps {
  channelAccessTokenConfigured: boolean;
  initialLineRichMenuId?: string | null;
  onMenuCreated?: (newId: string) => void;
}

// ── Canvas dimensions (LINE fixed spec) ───────────────────────────────────────
const CANVAS_W = 2500;
const CANVAS_H = 1686;
const MAX_RICH_MENU_IMAGE_BYTES = 10 * 1024 * 1024;

// ── Layout Template Definitions ───────────────────────────────────────────────
interface TemplateCellDef {
  id: CellId;
  bounds: { x: number; y: number; width: number; height: number };
  previewPct: { left: number; top: number; width: number; height: number };
}

interface TemplateDescriptor {
  label: string;
  subtitle: string;
  cells: TemplateCellDef[];
  /** Mini visual diagram — grid of filled/empty slots for icon rendering */
  diagram: Array<{ col: number; row: number; colSpan: number; rowSpan: number }>;
  cols: number; // diagram grid columns
  rows: number; // diagram grid rows
}

const TEMPLATES: Record<LayoutTemplate, TemplateDescriptor> = {
  "4-cell": {
    label: "T-Shape",
    subtitle: "A=Full Top · B/C/D=Bottom",
    cols: 3,
    rows: 2,
    diagram: [
      { col: 1, row: 1, colSpan: 3, rowSpan: 1 },
      { col: 1, row: 2, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 2, colSpan: 1, rowSpan: 1 },
      { col: 3, row: 2, colSpan: 1, rowSpan: 1 },
    ],
    cells: [
      { id: "A", bounds: { x: 0, y: 0, width: 2500, height: 843 }, previewPct: { left: 0, top: 0, width: 100, height: 50 } },
      { id: "B", bounds: { x: 0, y: 843, width: 833, height: 843 }, previewPct: { left: 0, top: 50, width: 33.33, height: 50 } },
      { id: "C", bounds: { x: 833, y: 843, width: 834, height: 843 }, previewPct: { left: 33.33, top: 50, width: 33.34, height: 50 } },
      { id: "D", bounds: { x: 1667, y: 843, width: 833, height: 843 }, previewPct: { left: 66.67, top: 50, width: 33.33, height: 50 } },
    ],
  },
  "6-cell": {
    label: "Grid 3×2",
    subtitle: "A/B/C=Top · D/E/F=Bottom",
    cols: 3,
    rows: 2,
    diagram: [
      { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 3, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 2, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 2, colSpan: 1, rowSpan: 1 },
      { col: 3, row: 2, colSpan: 1, rowSpan: 1 },
    ],
    cells: [
      { id: "A", bounds: { x: 0, y: 0, width: 833, height: 843 }, previewPct: { left: 0, top: 0, width: 33.33, height: 50 } },
      { id: "B", bounds: { x: 833, y: 0, width: 834, height: 843 }, previewPct: { left: 33.33, top: 0, width: 33.34, height: 50 } },
      { id: "C", bounds: { x: 1667, y: 0, width: 833, height: 843 }, previewPct: { left: 66.67, top: 0, width: 33.33, height: 50 } },
      { id: "D", bounds: { x: 0, y: 843, width: 833, height: 843 }, previewPct: { left: 0, top: 50, width: 33.33, height: 50 } },
      { id: "E", bounds: { x: 833, y: 843, width: 834, height: 843 }, previewPct: { left: 33.33, top: 50, width: 33.34, height: 50 } },
      { id: "F", bounds: { x: 1667, y: 843, width: 833, height: 843 }, previewPct: { left: 66.67, top: 50, width: 33.33, height: 50 } },
    ],
  },
  "3-cell": {
    label: "Row 3",
    subtitle: "3 Columns · Full Height",
    cols: 3,
    rows: 1,
    diagram: [
      { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 3, row: 1, colSpan: 1, rowSpan: 1 },
    ],
    cells: [
      { id: "A", bounds: { x: 0, y: 0, width: 833, height: 1686 }, previewPct: { left: 0, top: 0, width: 33.33, height: 100 } },
      { id: "B", bounds: { x: 833, y: 0, width: 834, height: 1686 }, previewPct: { left: 33.33, top: 0, width: 33.34, height: 100 } },
      { id: "C", bounds: { x: 1667, y: 0, width: 833, height: 1686 }, previewPct: { left: 66.67, top: 0, width: 33.33, height: 100 } },
    ],
  },
  "2-cell": {
    label: "Stack 2",
    subtitle: "A=Top Row · B=Bottom Row",
    cols: 1,
    rows: 2,
    diagram: [
      { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 2, colSpan: 1, rowSpan: 1 },
    ],
    cells: [
      { id: "A", bounds: { x: 0, y: 0, width: 2500, height: 843 }, previewPct: { left: 0, top: 0, width: 100, height: 50 } },
      { id: "B", bounds: { x: 0, y: 843, width: 2500, height: 843 }, previewPct: { left: 0, top: 50, width: 100, height: 50 } },
    ],
  },
  "large-left": {
    label: "Large Left",
    subtitle: "A=Big Left · B/C=Right",
    cols: 2,
    rows: 2,
    diagram: [
      { col: 1, row: 1, colSpan: 1, rowSpan: 2 },
      { col: 2, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 2, colSpan: 1, rowSpan: 1 },
    ],
    cells: [
      { id: "A", bounds: { x: 0, y: 0, width: 1250, height: 1686 }, previewPct: { left: 0, top: 0, width: 50, height: 100 } },
      { id: "B", bounds: { x: 1250, y: 0, width: 1250, height: 843 }, previewPct: { left: 50, top: 0, width: 50, height: 50 } },
      { id: "C", bounds: { x: 1250, y: 843, width: 1250, height: 843 }, previewPct: { left: 50, top: 50, width: 50, height: 50 } },
    ],
  },
  "2x2": {
    label: "Grid 2×2",
    subtitle: "A/B=Top · C/D=Bottom",
    cols: 2,
    rows: 2,
    diagram: [
      { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 2, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 2, colSpan: 1, rowSpan: 1 },
    ],
    cells: [
      { id: "A", bounds: { x: 0, y: 0, width: 1250, height: 843 }, previewPct: { left: 0, top: 0, width: 50, height: 50 } },
      { id: "B", bounds: { x: 1250, y: 0, width: 1250, height: 843 }, previewPct: { left: 50, top: 0, width: 50, height: 50 } },
      { id: "C", bounds: { x: 0, y: 843, width: 1250, height: 843 }, previewPct: { left: 0, top: 50, width: 50, height: 50 } },
      { id: "D", bounds: { x: 1250, y: 843, width: 1250, height: 843 }, previewPct: { left: 50, top: 50, width: 50, height: 50 } },
    ],
  },
};

const TEMPLATE_KEYS = Object.keys(TEMPLATES) as LayoutTemplate[];

// ── Default cell configurations ───────────────────────────────────────────────
const BASE_DEFAULTS: Record<CellId, Omit<CellConfig, "showLabel">> = {
  A: { label: "Build ออกแบบระบบ", type: "uri", value: "https://solar-dream.org/th/build" },
  B: { label: "Wizard ขอใบเสนอราคา", type: "uri", value: "https://solar-dream.org/th/wizard" },
  C: { label: "ติดตามใบเสนอราคา", type: "message", value: "ติดตามใบเสนอราคา" },
  D: { label: "ติดตามงานติดตั้ง", type: "message", value: "ติดตามงานติดตั้ง" },
  E: { label: "My Proposals", type: "uri", value: "https://solar-dream.org/th/proposals" },
  F: { label: "ผูกบัญชีสมาชิก", type: "message", value: "ผูกบัญชีสมาชิก" },
};

function makeDefaultCells(): CellsState {
  return Object.fromEntries(
    (Object.keys(BASE_DEFAULTS) as CellId[]).map((id) => [
      id,
      { ...BASE_DEFAULTS[id], showLabel: true },
    ])
  ) as CellsState;
}

function getActiveCellIds(template: LayoutTemplate): CellId[] {
  return TEMPLATES[template].cells.map((c) => c.id);
}

// ── Payload builders ───────────────────────────────────────────────────────────
function buildAreasPayload(template: LayoutTemplate, cells: CellsState): RichMenuArea[] {
  return TEMPLATES[template].cells.map(({ id, bounds }) => {
    const cell = cells[id];
    const action: RichMenuArea["action"] = cell.type === "message"
      ? { type: "message", text: cell.value }
      : { type: "uri", uri: cell.value };

    return {
      bounds,
      label: cell.label,
      showLabel: cell.showLabel, // stored in DB only; stripped before sending to LINE
      action,
    };
  });
}

function areasToState(
  areas: RichMenuRecord["areas"],
  template: LayoutTemplate
): Partial<CellsState> {
  const result: Partial<CellsState> = {};
  TEMPLATES[template].cells.forEach(({ id }, index) => {
    const area = areas[index];
    if (!area) return;
    result[id] = {
      label: area.label || id,
      showLabel: area.showLabel !== false, // default to true if missing
      type: area.action.type as "message" | "uri",
      value:
        area.action.type === "message"
          ? (area.action.text || "")
          : (area.action.uri || ""),
    };
  });
  return result;
}

// ── Mini diagram SVG renderer ────────────────────────────────────────────────
function TemplateDiagram({
  template,
  active,
}: {
  template: LayoutTemplate;
  active: boolean;
}) {
  const { cols, rows, diagram } = TEMPLATES[template];
  const cellW = 100 / cols;
  const cellH = 100 / rows;
  const accent = active ? "#B7D1EA" : "#94a3b8";
  const fill = active ? "#B7D1EA33" : "#e2e8f0";

  return (
    <svg viewBox="0 0 100 60" className="w-full h-10" xmlns="http://www.w3.org/2000/svg">
      {diagram.map((slot, i) => {
        const x = (slot.col - 1) * cellW + 0.5;
        const y = (slot.row - 1) * cellH + 0.5;
        const w = slot.colSpan * cellW - 1;
        const h = slot.rowSpan * cellH - 1;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={w}
            height={h}
            rx="3"
            fill={fill}
            stroke={accent}
            strokeWidth="1.5"
          />
        );
      })}
    </svg>
  );
}

// ── Assign Profile Modal ──────────────────────────────────────────────────────
function toDatetimeLocal(value: Date) {
  const offset = value.getTimezoneOffset() * 60000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function AssignProfileModal({
  isOpen,
  onClose,
  lineRichMenuId,
  menuName,
}: {
  isOpen: boolean;
  onClose: () => void;
  lineRichMenuId: string;
  menuName: string;
}) {
  const [profileType, setProfileType] = useState<RichMenuProfileType>(RICH_MENU_PROFILE_TYPES[0]);
  const [startTime, setStartTime] = useState(() => toDatetimeLocal(new Date()));
  const [endTime, setEndTime] = useState(() => toDatetimeLocal(new Date(Date.now() + 7 * 24 * 3600000)));
  const [saving, setSaving] = useState(false);
  const [schedules, setSchedules] = useState<RichMenuScheduleRecord[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void fetch("/api/richmenu/schedule")
      .then((response) => response.json())
      .then((data: { schedules?: RichMenuScheduleRecord[] }) => {
        if (!cancelled) setSchedules(Array.isArray(data.schedules) ? data.schedules : []);
      })
      .catch(() => {
        if (!cancelled) setSchedules([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const hasTimeError = useMemo(() => {
    const s = new Date(startTime);
    const e = new Date(endTime);
    return !isNaN(s.getTime()) && !isNaN(e.getTime()) && s >= e;
  }, [startTime, endTime]);

  const conflictingSchedule = useMemo(() => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) return null;
    return (
      schedules.find(
        (schedule) =>
          schedule.profileType === profileType &&
          isRichMenuScheduleOverlap(
            start,
            end,
            new Date(schedule.startTime),
            new Date(schedule.endTime),
          ),
      ) ?? null
    );
  }, [endTime, profileType, schedules, startTime]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (hasTimeError) { toast.error("เวลาเริ่มต้นต้องน้อยกว่าเวลาสิ้นสุด"); return; }
    setSaving(true);
    try {
      // Step 1: Upsert the profile with the new lineRichMenuId
      const profileRes = await fetch("/api/richmenu/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "profile",
          profileType,
          name: `${getRichMenuProfileLabel(profileType)} - ${menuName}`,
          imageUrl: null,
          lineRichMenuId,
        }),
      });
      const profileData = await profileRes.json();
      if (!profileRes.ok || !profileData.success) {
        throw new Error(profileData.error || "Failed to save profile");
      }

      // Step 2: Create the schedule entry
      const scheduleRes = await fetch("/api/richmenu/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "schedule",
          profileType,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
          overwrite: Boolean(conflictingSchedule),
        }),
      });
      const scheduleData = await scheduleRes.json();
      if (!scheduleRes.ok || !scheduleData.success) {
        throw new Error(scheduleData.error || "Failed to create schedule");
      }

      toast.success(
        conflictingSchedule
          ? `เขียนทับ Schedule ของ User Group ${getRichMenuProfileLabel(profileType)} สำเร็จ`
          : `กำหนด Rich Menu ให้ User Group ${getRichMenuProfileLabel(profileType)} สำเร็จ`,
      );
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
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-[#1E293B] bg-[#0F172A] shadow-none">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1E293B] p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#B7D1EA]/10">
              <Users className="h-5 w-5 text-[#B7D1EA]" />
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-gray-500">
                Assign to User Group
              </p>
              <h2 className="text-base font-black text-gray-100">กำหนดกลุ่มผู้ใช้ &amp; ช่วงเวลา</h2>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close profile assignment" className="rounded-xl p-2 text-gray-500 hover:bg-[#0B1121]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mx-6 mt-5 rounded-xl border border-emerald-200 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-800">
          <span className="font-black">Registered on LINE:</span>{" "}
          <span className="font-mono text-[11px]">{lineRichMenuId}</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          {/* User group selector */}
          <label className="block space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-gray-400">
              กลุ่มผู้ใช้ (User Group)
            </span>
            <select
              value={profileType}
              onChange={(e) => setProfileType(e.target.value as RichMenuProfileType)}
              className="w-full rounded-xl border border-[#1E293B] bg-[#0B1121] px-4 py-3 text-sm text-gray-100 outline-none focus:border-[#B7D1EA] focus:ring-4 focus:ring-[#B7D1EA]/10"
            >
              {RICH_MENU_PROFILE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {getRichMenuProfileLabel(type)}
                </option>
              ))}
            </select>
          </label>

          {/* Date range */}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-gray-400">เวลาเริ่มต้น</span>
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
              <span className="text-xs font-black uppercase tracking-wider text-gray-400">เวลาสิ้นสุด</span>
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

          {hasTimeError && (
            <div className="rounded-xl border border-rose-200 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-700">
              เวลาเริ่มต้นต้องอยู่ก่อนเวลาสิ้นสุด
            </div>
          )}

          {!hasTimeError && conflictingSchedule && (
            <div className="rounded-xl border border-amber-200 bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
              <p className="font-black">ช่วงเวลาทับซ้อน — จะเขียนทับ Schedule เดิม</p>
              <p className="mt-1">
                {getRichMenuProfileLabel(conflictingSchedule.profileType)} มี Schedule ที่ชนกับช่วงเวลานี้แล้ว
              </p>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl border border-[#1E293B] bg-[#0F172A] px-4 py-2.5 text-xs font-bold text-gray-400 transition hover:bg-[#0B1121] disabled:opacity-50"
            >
              <SkipForward className="h-4 w-4" />
              ข้ามขั้นตอนนี้
            </button>
            <button
              type="submit"
              disabled={saving || hasTimeError}
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
                  : "Overwrite User Group & Schedule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function RichMenuEditor({
  channelAccessTokenConfigured,
  initialLineRichMenuId,
  onMenuCreated,
}: RichMenuEditorProps) {
  const [menus, setMenus] = useState<RichMenuRecord[]>([]);
  const [selectedMenuId, setSelectedMenuId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  // Assign Profile Modal state (opens after successful publish)
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [publishedLineMenuId, setPublishedLineMenuId] = useState("");
  const [isDeletingDraft, setIsDeletingDraft] = useState(false);

  const [menuName, setMenuName] = useState("");
  const [chatBarText, setChatBarText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploadedImageName, setUploadedImageName] = useState("");
  const [uploadedImageDimensions, setUploadedImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [imageUploadError, setImageUploadError] = useState("");
  const [previewImageError, setPreviewImageError] = useState(false);
  const [isMemberMenu, setIsMemberMenu] = useState(false);
  const [status, setStatus] = useState<"DRAFT" | "PUBLISHED">("DRAFT");
  const [lineRichMenuId, setLineRichMenuId] = useState<string | null>(null);

  const [layoutTemplate, setLayoutTemplate] = useState<LayoutTemplate>("4-cell");
  const [cells, setCells] = useState<CellsState>(makeDefaultCells());
  const [activeCellId, setActiveCellId] = useState<CellId>("A");

  const actionFormRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [isSaving, startSaveTransition] = useTransition();
  const [isPublishing, startPublishTransition] = useTransition();
  const [isUploadingImage, startImageUploadTransition] = useTransition();

  // ── Load a menu record into form state ────────────────────────────────────
  const loadMenuToForm = useCallback((menu: RichMenuRecord) => {
    if (!menu) return;
    setMenuName(menu.menuName);
    setChatBarText(menu.chatBarText);
    setImageUrl(menu.imageUrl);
    setUploadedImageName("");
    setUploadedImageDimensions(null);
    setImageUploadError("");
    setPreviewImageError(false);
    setIsMemberMenu(menu.isMemberMenu);
    setStatus(menu.status);
    setLineRichMenuId(menu.lineRichMenuId);

    // Detect template from area count
    const areaCount = menu.areas.length;
    let detected: LayoutTemplate = "4-cell";
    if (areaCount === 2) detected = "2-cell";
    else if (areaCount === 3) {
      // Distinguish large-left (A takes full height) from 3-cell (equal columns)
      const firstBounds = menu.areas[0]?.bounds;
      detected =
        firstBounds?.width <= 1300 && firstBounds?.height > 1200
          ? "large-left"
          : "3-cell";
    } else if (areaCount === 4) {
      // Distinguish 2x2 (first cell half-width) from 4-cell T (first cell full-width)
      const firstBounds = menu.areas[0]?.bounds;
      detected = firstBounds?.width <= 1300 ? "2x2" : "4-cell";
    } else if (areaCount >= 6) detected = "6-cell";

    setLayoutTemplate(detected);
    setActiveCellId("A");
    const defaults = makeDefaultCells();
    const fromAreas = areasToState(menu.areas, detected);
    setCells({ ...defaults, ...fromAreas });
  }, []);

  const findMenuByReference = useCallback(
    (list: RichMenuRecord[], reference: string | null | undefined) => {
      if (!reference) return undefined;
      return list.find((menu) => menu.id === reference || menu.lineRichMenuId === reference);
    },
    [],
  );

  // ── Load from DB ──────────────────────────────────────────────────────────
  const loadMenus = useCallback(async (selectId?: string) => {
    setIsLoading(true);
    try {
      const list = await getRichMenusAction();
      setMenus(list);
      const target =
        findMenuByReference(list, selectId) ??
        findMenuByReference(list, initialLineRichMenuId) ??
        list[0];
      if (target) {
        // `initialLineRichMenuId` is LINE's remote ID while the editor publishes
        // the local draft record. Keep the selector and form on the local ID.
        setSelectedMenuId(target.id);
        loadMenuToForm(target);
      } else {
        setSelectedMenuId("");
      }
    } catch {
      toast.error("ไม่สามารถโหลดประวัติ Rich Menus ได้");
    } finally {
      setIsLoading(false);
    }
  }, [findMenuByReference, initialLineRichMenuId, loadMenuToForm]);

  useEffect(() => {
    void Promise.resolve().then(() => loadMenus());
  }, [loadMenus]);

  const handleSelectMenu = (id: string) => {
    setSelectedMenuId(id);
    const target = menus.find((m) => m.id === id);
    if (target) loadMenuToForm(target);
  };

  const handleSwitchTemplate = (t: LayoutTemplate) => {
    setLayoutTemplate(t);
    setActiveCellId(TEMPLATES[t].cells[0].id);
    setCells(makeDefaultCells());
  };

  const handleRichMenuImageFile = (file: File | undefined) => {
    if (!file || isUploadingImage) return;

    if (file.size > MAX_RICH_MENU_IMAGE_BYTES) {
      const errorMessage = "Rich Menu image ต้องมีขนาดไม่เกิน 10 MB";
      setImageUploadError(errorMessage);
      toast.error(errorMessage);
      return;
    }

    setImageUploadError("");
    const formData = new FormData();
    formData.set("file", file);

    startImageUploadTransition(async () => {
      try {
        const result = await uploadRichMenuImage(formData);
        if (!result.success) {
          setImageUploadError(result.error);
          toast.error(result.error);
          return;
        }

        setImageUrl(result.url);
        setUploadedImageName(result.fileName);
        setUploadedImageDimensions({ width: result.width, height: result.height });
        setStatus("DRAFT");
        setLineRichMenuId(null);
        setPreviewImageError(false);
        toast.success("อัปโหลด Rich Menu image สำเร็จ");
      } catch {
        const errorMessage = "ไม่สามารถอัปโหลด Rich Menu image ได้";
        setImageUploadError(errorMessage);
        toast.error(errorMessage);
      }
    });
  };

  const handleRichMenuImageInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleRichMenuImageFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const handleRichMenuImageDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!isUploadingImage) handleRichMenuImageFile(event.dataTransfer.files[0]);
  };

  const handleClearRichMenuImage = () => {
    setImageUrl("");
    setUploadedImageName("");
    setUploadedImageDimensions(null);
    setImageUploadError("");
    setPreviewImageError(false);
    setStatus("DRAFT");
    setLineRichMenuId(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const handleCreateNewProfile = () => {
    const newId = `menu_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
    const defaultRecord: RichMenuRecord = {
      id: newId,
      menuName: "New Draft Menu Profile",
      chatBarText: "เมนูบริการ",
      imageUrl:
        "https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&q=80&w=1200",
      status: "DRAFT",
      lineRichMenuId: null,
      isMemberMenu: false,
      areas: buildAreasPayload("4-cell", makeDefaultCells()),
    };
    setMenus((prev) => [...prev, defaultRecord]);
    setSelectedMenuId(newId);
    loadMenuToForm(defaultRecord);
    toast.success("สร้างร่างเมนูโปรไฟล์ใหม่แล้ว");
  };

  const handleDeleteCurrentProfile = async () => {
    if (!selectedMenuId) return;
    const target = menus.find((menu) => menu.id === selectedMenuId);
    if (!target) return;

    setIsDeletingDraft(true);
    try {
      const res = await deleteRichMenuDraftAction(selectedMenuId);
      if (!res.success) {
        toast.error(res.error || "ลบ Rich Menu Profile ไม่สำเร็จ");
        return;
      }

      const nextMenus = menus.filter((menu) => menu.id !== selectedMenuId);
      if (nextMenus.length > 0) {
        setMenus(nextMenus);
        setSelectedMenuId(nextMenus[0].id);
        loadMenuToForm(nextMenus[0]);
      } else {
        const newId = `menu_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
        const defaultRecord: RichMenuRecord = {
          id: newId,
          menuName: "New Draft Menu Profile",
          chatBarText: "เมนูบริการ",
          imageUrl:
            "https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&q=80&w=1200",
          status: "DRAFT",
          lineRichMenuId: null,
          isMemberMenu: false,
          areas: buildAreasPayload("4-cell", makeDefaultCells()),
        };
        setMenus([defaultRecord]);
        setSelectedMenuId(defaultRecord.id);
        loadMenuToForm(defaultRecord);
      }

      toast.success(`ลบ "${target.menuName}" แล้ว`);
    } finally {
      setIsDeletingDraft(false);
    }
  };

  // ── Click preview cell → focus form ──────────────────────────────────────
  const handleCellClick = (cellId: CellId) => {
    setActiveCellId(cellId);
    setTimeout(() => {
      actionFormRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
  };

  // ── Toggle show/hide label for active cell ────────────────────────────────
  const toggleShowLabel = () => {
    setCells((prev) => ({
      ...prev,
      [activeCellId]: { ...prev[activeCellId], showLabel: !prev[activeCellId].showLabel },
    }));
  };

  // ── Save Draft ─────────────────────────────────────────────────────────────
  const handleSaveDraft = () => {
    if (!menuName.trim() || !chatBarText.trim() || !imageUrl.trim()) {
      toast.error("กรุณากรอกข้อมูลจำเป็นก่อนบันทึกร่าง");
      return;
    }
    const payload: RichMenuRecord = {
      id: selectedMenuId,
      menuName,
      chatBarText,
      imageUrl,
      status: "DRAFT",
      lineRichMenuId: null,
      isMemberMenu,
      areas: buildAreasPayload(layoutTemplate, cells),
    };
    startSaveTransition(async () => {
      const res = await saveRichMenuDraftAction(payload);
      if (res.success) {
        toast.success("บันทึกร่าง (Save Draft) สำเร็จ!");
        setStatus("DRAFT");
        setLineRichMenuId(null);
        await loadMenus(selectedMenuId);
      } else {
        toast.error(res.error || "เกิดข้อผิดพลาดในการบันทึกร่าง");
      }
    });
  };

  // ── Publish ───────────────────────────────────────────────────────────────
  const handlePublishMenu = () => {
    if (!channelAccessTokenConfigured) {
      toast.error("กรุณาตั้งค่า LINE_CHANNEL_ACCESS_TOKEN");
      return;
    }
    const publishMenuId = selectedMenuId;
    const publishMenu = menus.find((menu) => menu.id === publishMenuId);
    if (!publishMenuId || !publishMenu) {
      toast.error("กรุณาเลือก Rich Menu ที่ต้องการแก้ไขก่อน Publish");
      return;
    }
    for (const id of getActiveCellIds(layoutTemplate)) {
      const config = cells[id];
      if (!config.value.trim()) { toast.error(`กรุณากรอก Action Value ช่อง ${id}`); return; }
      if (config.type === "message" && config.value.length > 50) { toast.error(`ข้อความช่อง ${id} ยาวเกิน 50 ตัว`); return; }
      if (config.type === "uri" && !config.value.startsWith("http")) { toast.error(`URI ช่อง ${id} ต้องขึ้นต้นด้วย http`); return; }
    }
    if (!imageUrl.startsWith("http")) { toast.error("โปรดระบุ Image URL ที่ถูกต้อง"); return; }

    const draftPayload: RichMenuRecord = {
      id: publishMenuId, menuName, chatBarText, imageUrl, status: "DRAFT",
      lineRichMenuId: null, isMemberMenu,
      areas: buildAreasPayload(layoutTemplate, cells),
    };

    startPublishTransition(async () => {
      const saveRes = await saveRichMenuDraftAction(draftPayload);
      if (!saveRes.success) { toast.error("บันทึก Draft ก่อน Publish ล้มเหลว"); return; }
      try {
        const res = await fetch("/api/richmenu/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ menuId: publishMenuId }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || "Publish ล้มเหลว"); return; }
        toast.success(`เผยแพร่ “${publishMenu.menuName || menuName}” เข้า LINE สำเร็จ`);
        setStatus("PUBLISHED");
        setLineRichMenuId(data.lineRichMenuId);
        if (onMenuCreated && data.lineRichMenuId) onMenuCreated(data.lineRichMenuId);
        await loadMenus(publishMenuId);
        // Open Assign Profile Modal instead of redirecting
        setPublishedLineMenuId(data.lineRichMenuId);
        setAssignModalOpen(true);
      } catch {
        toast.error("เกิดข้อผิดพลาดใน Publishing Pipeline");
      }
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("คัดลอก LINE ID สำเร็จ!");
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
        <GsapSpinner className="w-8 h-8 text-[#B7D1EA]" />
        <p className="text-xs font-bold uppercase tracking-wider">Loading Menu Configurations...</p>
      </div>
    );
  }

  const activeCell = cells[activeCellId];
  const activeTemplateLayout = TEMPLATES[layoutTemplate].cells;
  const activeCellIds = getActiveCellIds(layoutTemplate);
  const hasPreviewImage = Boolean(imageUrl.trim()) && !previewImageError;
  const selectedMenu = menus.find((menu) => menu.id === selectedMenuId);

  return (
    <>
      {/* Assign User Group Modal: shown after successful publish */}
      <AssignProfileModal
        key={`${assignModalOpen ? "open" : "closed"}:${publishedLineMenuId}`}
        isOpen={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        lineRichMenuId={publishedLineMenuId}
        menuName={menuName}
      />

      <div className="space-y-6 text-left">

      {/* ── Rich Menu Draft Selector Bar ─────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-[#1E293B] pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#B7D1EA]/10 border border-[#B7D1EA]/30 flex items-center justify-center text-[#B7D1EA]">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-black text-gray-100 leading-tight uppercase tracking-wider">
              Rich Menu Drafts
            </h3>
            <p className="text-[10px] text-gray-400 mt-0.5">Choose a menu to edit. Publish always uses this selected menu.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={selectedMenuId}
            onChange={(e) => handleSelectMenu(e.target.value)}
            disabled={isSaving || isPublishing || menus.length === 0}
            aria-label="Rich Menu being edited"
            className="flex-1 sm:w-64 px-3 py-2 rounded-xl border border-[#1E293B] bg-[#0B1121] text-xs font-bold text-gray-100 focus:outline-none focus:bg-[#0F172A]"
          >
            {menus.map((m) => (
              <option key={m.id} value={m.id}>[{m.status}] {m.menuName}</option>
            ))}
          </select>
          <button
            onClick={handleCreateNewProfile}
            className="p-2 bg-[#0B1121] hover:bg-[#1E293B] border border-[#1E293B] text-gray-100 rounded-xl transition-all cursor-pointer"
            title="Create New Rich Menu Draft"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={() => void handleDeleteCurrentProfile()}
            disabled={isDeletingDraft || !selectedMenuId}
            className="p-2 rounded-xl border border-rose-200 bg-rose-500/10 text-rose-600 transition-all hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
            title="Delete selected Rich Menu Draft"
          >
            {isDeletingDraft ? (
              <GsapSpinner className="h-4 w-4" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* ── Template Selector Grid (3 columns) ───────────────────────────── */}
      <div className="space-y-2">
        <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
          Layout Template — เลือกรูปแบบตาราง
        </p>
        <div className="grid grid-cols-3 gap-2.5">
          {TEMPLATE_KEYS.map((key) => {
            const tmpl = TEMPLATES[key];
            const active = layoutTemplate === key;
            return (
              <button
                key={key}
                onClick={() => handleSwitchTemplate(key)}
                className={`relative p-3 rounded-2xl border-2 transition-all cursor-pointer flex flex-col items-center gap-2 text-center group ${
                  active
                    ? "border-[#B7D1EA] bg-[#B7D1EA]/5 shadow-none"
                    : "border-[#1E293B] bg-[#0F172A] hover:border-[#1E293B] hover:bg-[#0B1121]"
                }`}
              >
                {active && (
                  <CheckCircle2 className="absolute top-1.5 right-1.5 w-3 h-3 text-[#B7D1EA]" />
                )}
                <TemplateDiagram template={key} active={active} />
                <span className={`text-[10px] font-black leading-tight ${active ? "text-[#B7D1EA]" : "text-gray-400"}`}>
                  {tmpl.label}
                </span>
                <span className="text-[8px] text-gray-500 leading-tight">
                  {tmpl.subtitle}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main Editor Grid ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* LEFT: Smartphone Preview (lg:col-span-5) */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <span className="text-[9px] font-black tracking-widest text-gray-500 uppercase flex items-center gap-1 mb-3">
            <Smartphone className="w-4 h-4" />
            Preview · คลิกพื้นที่เพื่อแก้ไข
          </span>

          {/* Phone frame */}
          <div className="relative w-full max-w-[300px] aspect-[9/18.5] rounded-[2.5rem] border-8 border-slate-900 bg-[#0F172A] shadow-none overflow-hidden flex flex-col">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 h-4 w-24 bg-slate-900 rounded-b-xl z-30" />
            {/* Header */}
            <div className="pt-6 pb-2.5 px-4 bg-[#0F172A] border-b border-slate-800 flex items-center justify-between text-white shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-cyan-950 flex items-center justify-center text-[10px] font-black text-[#B7D1EA]">SD</div>
                <p className="text-[10px] font-extrabold">SolarDream OA</p>
              </div>
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            </div>
            {/* Chat area */}
            <div className="flex-1 relative overflow-hidden flex flex-col justify-end">
              <div className="p-3 shrink-0 relative z-10 opacity-70">
                <div className="p-2.5 bg-[#0F172A] border border-[#1E293B] rounded-2xl rounded-tl-none text-[9px] text-left max-w-[190px]">
                  สวัสดีค่ะ SolarDream 👇 เลือกกดเมนูด้านล่างได้เลยค่ะ
                </div>
              </div>
            </div>
            {/* Rich Menu Canvas */}
            <div
              className="relative z-20 w-full shrink-0 overflow-hidden border-t border-slate-900 bg-slate-950"
              style={{ aspectRatio: `${CANVAS_W}/${CANVAS_H}` }}
            >
              {hasPreviewImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt="Rich Menu artwork"
                  className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover object-center"
                  decoding="async"
                  onError={() => setPreviewImageError(true)}
                />
              )}
              {!hasPreviewImage && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950 px-5 text-center text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  Upload Rich Menu artwork to preview the LINE canvas
                </div>
              )}

              {/* Cell bounding boxes */}
              {activeTemplateLayout.map(({ id, previewPct }) => {
                const isActive = activeCellId === id;
                const cell = cells[id];
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleCellClick(id)}
                    style={{
                      position: "absolute",
                      left: `${previewPct.left}%`,
                      top: `${previewPct.top}%`,
                      width: `${previewPct.width}%`,
                      height: `${previewPct.height}%`,
                    }}
                    aria-label={`Edit rich menu area ${id}: ${cell.label || `ช่อง ${id}`}`}
                    title={hasPreviewImage ? `${id} · ${cell.label || `ช่อง ${id}`}` : undefined}
                    className={`group flex cursor-pointer flex-col items-center justify-center border-2 p-0.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] ${
                      hasPreviewImage
                        ? isActive
                          ? "z-10 border-[#B7D1EA]/90 bg-transparent ring-1 ring-[#B7D1EA]/60"
                          : "border-transparent bg-transparent hover:border-white/80 hover:bg-black/10"
                        : isActive
                          ? "z-10 border-[#B7D1EA] bg-[#B7D1EA]/20 ring-1 ring-[#B7D1EA]/50"
                          : "border-white/20 hover:border-white/50 hover:bg-[#0B1121]/5"
                    }`}
                  >
                    {!hasPreviewImage && (
                      <>
                        <span className={`mb-0.5 rounded px-1.5 py-0.5 text-[7px] font-black ${
                          isActive ? "bg-[#B7D1EA] text-white" : "bg-slate-900/70 text-slate-300"
                        }`}>{id}</span>
                        {cell.showLabel ? (
                          <span className={`block max-w-full truncate px-1 text-center text-[8px] font-black leading-tight ${
                            isActive ? "text-white drop-shadow" : "text-slate-200"
                          }`}>{cell.label || `ช่อง ${id}`}</span>
                        ) : (
                          <EyeOff className="h-3 w-3 text-gray-500 opacity-60" />
                        )}
                        <span className="mt-0.5 max-w-full truncate px-1 font-mono text-[6px] uppercase text-gray-500">
                          {cell.type}
                        </span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
            {/* Chat bar footer */}
            <div className="bg-[#0F172A] border-t border-[#1E293B] py-2.5 text-center text-[10px] font-black text-gray-100 uppercase tracking-widest shrink-0">
              {chatBarText || "เมนูบริการ"}
            </div>
          </div>

          {/* Status badge */}
          <div className="mt-5 flex w-full max-w-[300px] justify-between items-center bg-[#0F172A] border border-[#1E293B] px-4 py-2.5 rounded-2xl shadow-none">
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Publish State:</span>
            <span className={`px-2 py-0.5 border rounded-full text-[9px] font-black uppercase tracking-wider ${
              status === "PUBLISHED"
                ? "bg-emerald-500/10 border-emerald-200 text-emerald-800"
                : "bg-amber-500/10 border-amber-200 text-amber-800"
            }`}>{status}</span>
          </div>
        </div>

        {/* RIGHT: Form Configs (lg:col-span-7) */}
        <div className="lg:col-span-7 space-y-6 text-left">

          {/* Profile metadata */}
          <div className="bg-[#0F172A] border border-[#1E293B] rounded-[2rem] p-6 shadow-none space-y-4">
            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest block">
              1. Rich Menu Profile Configurations
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  Rich Menu Title
                </label>
                <input type="text" value={menuName} onChange={(e) => setMenuName(e.target.value)}
                  placeholder="เช่น Member Default Menu"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#1E293B] text-xs font-bold bg-[#0B1121] focus:bg-[#0F172A] focus:outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  Chat Bar Label
                </label>
                <input type="text" value={chatBarText} onChange={(e) => setChatBarText(e.target.value)}
                  maxLength={20} placeholder="เช่น เมนูสมาชิก"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#1E293B] text-xs font-bold bg-[#0B1121] focus:bg-[#0F172A] focus:outline-none" />
              </div>
            </div>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <label htmlFor="rich-menu-image" className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  Rich Menu image
                </label>
                <span className="text-[9px] font-bold text-[#B7D1EA] uppercase tracking-wider">LINE canvas · 2500 × 1686 px</span>
              </div>
              <p className="text-[10px] text-gray-500 mb-3">
                Upload JPEG, PNG, or WebP up to 10 MB. This artwork is uploaded to the LINE Rich Menu canvas; it does not change the chat-room wallpaper.
              </p>

              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                }}
                onDrop={handleRichMenuImageDrop}
                className={`rounded-2xl border border-dashed px-4 py-5 text-center transition-colors ${
                  isUploadingImage
                    ? "border-[#B7D1EA] bg-[#B7D1EA]/10"
                    : "border-[#1E293B] bg-[#0B1121] hover:border-[#B7D1EA]/60"
                }`}
              >
                <input
                  id="rich-menu-image"
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  disabled={isUploadingImage}
                  onChange={handleRichMenuImageInputChange}
                />
                <div className="flex flex-col items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#B7D1EA]/30 bg-[#B7D1EA]/10 text-[#B7D1EA]">
                    {isUploadingImage ? <GsapSpinner className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                  </span>
                  <p className="text-xs font-bold text-gray-200">
                    {isUploadingImage ? "Uploading Rich Menu image..." : imageUrl ? "Replace the Rich Menu image" : "Upload a Rich Menu image"}
                  </p>
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={isUploadingImage}
                    className="rounded-lg border border-[#B7D1EA]/40 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-[#B7D1EA] transition-colors hover:bg-[#B7D1EA]/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {imageUrl ? "Choose replacement" : "Choose image"}
                  </button>
                  <span className="text-[10px] text-gray-500">or drag and drop an image here</span>
                </div>
              </div>

              {imageUploadError && (
                <p role="alert" className="mt-2 text-[10px] font-bold text-rose-300">
                  {imageUploadError}
                </p>
              )}

              <div className="mt-3">
                <label htmlFor="rich-menu-image-url" className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                  Or use a Rich Menu image URL
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500">
                    <ImageIcon className="w-4 h-4" />
                  </span>
                  <input
                    id="rich-menu-image-url"
                    type="url"
                    value={imageUrl}
                    onChange={(event) => {
                      setImageUrl(event.target.value);
                      setUploadedImageName("");
                      setUploadedImageDimensions(null);
                      setImageUploadError("");
                      setPreviewImageError(false);
                    }}
                    placeholder="https://domain.com/image.jpg"
                    className={`w-full pl-10 ${imageUrl ? "pr-10" : "pr-4"} py-2.5 rounded-xl border border-[#1E293B] text-xs font-mono font-bold bg-[#0B1121] focus:bg-[#0F172A] focus:outline-none`}
                  />
                  {imageUrl && (
                    <button
                      type="button"
                      onClick={handleClearRichMenuImage}
                      aria-label="Remove Rich Menu image"
                      title="Remove Rich Menu image"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-500 transition-colors hover:bg-[#1E293B] hover:text-gray-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {imageUrl && (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) && (
                <div className="mt-3 overflow-hidden rounded-2xl border border-[#1E293B] bg-[#0B1121]">
                  <div className="flex items-center justify-between gap-3 border-b border-[#1E293B] px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[10px] font-bold text-gray-200">
                        {uploadedImageName || "Current Rich Menu image"}
                      </p>
                      <p className="text-[9px] text-gray-500">
                        {uploadedImageDimensions
                          ? `${uploadedImageDimensions.width} × ${uploadedImageDimensions.height} px`
                          : "Image URL source"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleClearRichMenuImage}
                      className="shrink-0 rounded-lg border border-[#1E293B] p-1.5 text-gray-500 transition-colors hover:bg-[#1E293B] hover:text-gray-100"
                      aria-label="Remove Rich Menu image"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="relative aspect-[2500/1686] max-h-36">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrl}
                      alt="Rich Menu image preview"
                      className="h-full w-full object-cover"
                      onError={(event) => {
                        (event.target as HTMLImageElement).style.display = "none";
                        setPreviewImageError(true);
                        setImageUploadError("The Rich Menu image preview could not be loaded. Check the URL or upload another image.");
                      }}
                    />
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-900/40 text-[10px] font-bold uppercase tracking-widest text-white opacity-0 transition-opacity hover:opacity-100">
                      Image Preview · 2500 × 1686
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="pt-1">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={isMemberMenu} onChange={(e) => setIsMemberMenu(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-500 border-[#1E293B] focus:ring-emerald-500" />
                <div>
                  <span className="text-xs font-bold text-gray-100 block">Mark as Member Menu Draft</span>
                  <span className="text-[10px] text-gray-500">ใช้เป็น metadata ภายใน ระบบจะยังไม่ push ไปยังผู้ใช้ตอน Publish</span>
                </div>
              </label>
            </div>
          </div>

          {/* ── Area Actions Configuration ──────────────────────────────── */}
          <div ref={actionFormRef} className="bg-[#0F172A] border border-[#1E293B] rounded-[2rem] p-6 shadow-none space-y-5">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-[#1E293B] pb-3 gap-3">
              <div className="min-w-0">
                <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest block">
                  2. Area Actions Configuration
                </span>
                <h3 className="text-sm font-black text-gray-100 mt-0.5">
                  ช่อง{" "}
                  <span className="text-[#B7D1EA] font-extrabold font-mono">{activeCellId}</span>
                  {!activeCell.showLabel && (
                    <span className="ml-2 text-[9px] font-bold text-gray-500 bg-[#0B1121] px-2 py-0.5 rounded-full uppercase tracking-wider align-middle">
                      ซ่อนข้อความ
                    </span>
                  )}
                </h3>
              </div>
              {/* Cell selector pills */}
              <div className="flex flex-wrap gap-1 justify-end shrink-0">
                {activeCellIds.map((id) => (
                  <button key={id} onClick={() => setActiveCellId(id)}
                    className={`w-7 h-7 rounded-lg text-xs font-black uppercase transition-all flex items-center justify-center border cursor-pointer ${
                      activeCellId === id
                        ? "bg-[#B7D1EA] border-[#B7D1EA] text-white shadow-none"
                        : "bg-[#0F172A] border-[#1E293B] text-gray-400 hover:bg-[#0B1121]"
                    }`}
                  >{id}</button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {/* Display Label + Show/Hide toggle */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Display Label — วาดลงรูปภาพโดย Server
                  </label>
                  {/* Show / Hide toggle */}
                  <button
                    type="button"
                    onClick={toggleShowLabel}
                    title={activeCell.showLabel ? "ซ่อนข้อความบนรูปภาพ" : "แสดงข้อความบนรูปภาพ"}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                      activeCell.showLabel
                        ? "border-emerald-200 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-100"
                        : "border-[#1E293B] bg-[#0B1121] text-gray-400 hover:bg-[#1E293B]"
                    }`}
                  >
                    {activeCell.showLabel ? (
                      <><Eye className="w-3 h-3" />แสดง</>
                    ) : (
                      <><EyeOff className="w-3 h-3" />ซ่อน</>
                    )}
                  </button>
                </div>

                {/* Label input — dimmed when hidden */}
                <div className={`relative transition-opacity ${!activeCell.showLabel ? "opacity-40 pointer-events-none" : ""}`}>
                  <input
                    type="text"
                    value={activeCell.label}
                    onChange={(e) => setCells((prev) => ({
                      ...prev,
                      [activeCellId]: { ...prev[activeCellId], label: e.target.value },
                    }))}
                    placeholder="เช่น เช็คออเดอร์"
                    className="w-full px-3.5 py-2 rounded-xl border border-[#1E293B] text-xs font-bold bg-[#0B1121] focus:bg-[#0F172A] focus:outline-none"
                  />
                </div>

                {/* Status hint */}
                <p className={`text-[9px] mt-1 ${activeCell.showLabel ? "text-gray-500" : "text-amber-600 font-bold"}`}>
                  {activeCell.showLabel
                    ? "✏️ Server จะ composite ข้อความนี้ตรงกลางช่องบนรูปภาพก่อนส่งไป LINE"
                    : "👁‍🗨 ข้อความจะไม่ถูกวาดบนรูปภาพสำหรับช่องนี้ — ตรวจสอบว่ารูปพื้นหลังมีข้อความอยู่แล้ว"}
                </p>
              </div>

              {/* Action Type */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  Action Type (ประเภทปุ่ม)
                </label>
                <p className="mb-2 text-[9px] leading-relaxed text-gray-500">
                  Text actions send the Action Value to the LINE webhook. URI actions open the destination directly in LINE and do not create a webhook event.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {(["message", "uri"] as const).map((t) => (
                    <button key={t} type="button"
                      onClick={() => setCells((prev) => ({ ...prev, [activeCellId]: { ...prev[activeCellId], type: t } }))}
                      className={`py-2 px-3 border rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer ${
                        activeCell.type === t
                          ? "border-emerald-500 bg-emerald-500/10/50 text-emerald-800"
                          : "border-[#1E293B] bg-[#0F172A] text-gray-400 hover:bg-[#0B1121]"
                      }`}
                    >
                      {t === "message" ? <><Type className="w-4 h-4" />ข้อความ (Text)</> : <><LinkIcon className="w-4 h-4" />ลิงก์ (URI)</>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Value */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Action Value ({activeCell.type === "message" ? "ข้อความตอบกลับ" : "ลิงก์ปลายทาง"})
                  </label>
	                  {activeCell.type === "message" && (
                      activeCell.value.length > 50 ? (
                        <GsapPulse className="text-[9px] font-black text-rose-500">
                          {activeCell.value.length} / 50
                        </GsapPulse>
                      ) : (
                        <span className="text-[9px] font-black text-gray-500">
                          {activeCell.value.length} / 50
                        </span>
                      )
	                  )}
                </div>
                <input type="text" value={activeCell.value}
                  onChange={(e) => setCells((prev) => ({ ...prev, [activeCellId]: { ...prev[activeCellId], value: e.target.value } }))}
                  placeholder={activeCell.type === "message" ? "เช่น ดูคะแนนสะสม" : "https://solardream.onrender.com/booking"}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#1E293B] text-xs font-mono font-bold bg-[#0B1121] focus:bg-[#0F172A] focus:outline-none"
                />
                {activeCell.type === "message" && (
                  <p className="text-[9px] leading-relaxed text-gray-500">
                    Use the same phrase as a configured LINE trigger so the webhook can route this action.
                  </p>
                )}
              </div>

              {/* Quick overview strip — all cells at a glance */}
              <div className="pt-3 border-t border-[#1E293B]">
                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2">All Cells Overview</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {activeCellIds.map((id) => {
                    const c = cells[id];
                    const isActive = activeCellId === id;
                    return (
                      <button
                        key={id}
                        onClick={() => setActiveCellId(id)}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-left transition-all cursor-pointer ${
                          isActive
                            ? "border-[#B7D1EA] bg-[#B7D1EA]/5"
                            : "border-[#1E293B] bg-[#0B1121] hover:border-[#1E293B]"
                        }`}
                      >
                        <span className={`text-[9px] font-black w-5 h-5 flex items-center justify-center rounded-lg flex-shrink-0 ${
                          isActive ? "bg-[#B7D1EA] text-white" : "bg-[#1E293B] text-gray-400"
                        }`}>{id}</span>
                        <span className="text-[10px] font-bold text-gray-300 truncate flex-1">{c.label || `ช่อง ${id}`}</span>
                        {!c.showLabel && <EyeOff className="w-3 h-3 text-gray-500 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* ── Action Buttons ──────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button type="button" onClick={handleSaveDraft} disabled={isSaving || isPublishing || !selectedMenuId}
              className="w-full bg-[#0B1121] hover:bg-[#1E293B] disabled:bg-[#0B1121] disabled:text-gray-500 text-gray-100 py-3.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer border border-[#1E293B] shadow-none"
            >
	              {isSaving
	                ? <><GsapSpinner className="w-4 h-4 text-gray-400" /><span>Saving...</span></>
	                : <><Save className="w-4 h-4 text-gray-400" /><span>Save Draft</span></>}
            </button>
            <button type="button" onClick={handlePublishMenu} disabled={isSaving || isPublishing || !channelAccessTokenConfigured || !selectedMenuId}
              className="w-full bg-[#B7D1EA] hover:bg-[#a5c2de] disabled:bg-[#0B1121] disabled:text-gray-500 text-[#0F172A] py-3.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer border border-[#1E293B] shadow-none"
            >
	              {isPublishing
	                ? <><GsapSpinner className="w-4 h-4" /><span>Processing...</span></>
		                : <><Send className="w-4 h-4" /><span>Publish {selectedMenu ? `“${selectedMenu.menuName}”` : "to LINE"}</span></>}
            </button>
          </div>

          {!channelAccessTokenConfigured && (
            <p className="text-[9px] text-rose-500 text-center font-bold">
              *ปุ่ม Publish ปิดอยู่ — ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN
            </p>
          )}

          {/* Published ID display */}
          {status === "PUBLISHED" && lineRichMenuId && (
            <div className="bg-emerald-500/10/50 border border-emerald-200 p-4 rounded-[2rem] space-y-2">
              <div className="flex items-center gap-1.5 text-emerald-800 font-extrabold text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Rich Menu Registered on LINE</span>
              </div>
              <div className="flex gap-2">
                <code className="flex-1 bg-[#0F172A] border border-emerald-200 p-2 rounded-xl text-[10px] font-mono font-black text-gray-100 select-text truncate">
                  {lineRichMenuId}
                </code>
                <button onClick={() => copyToClipboard(lineRichMenuId)}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black flex items-center gap-1 transition-all cursor-pointer shadow-none"
                >
                  <Copy className="w-3.5 h-3.5" /><span>Copy</span>
                </button>
              </div>
            </div>
          )}

          {/* Pipeline Info */}
          <div className="bg-[#0F172A] border border-[#1E293B] rounded-[2rem] p-6 shadow-none space-y-4">
            <div className="flex items-center gap-2 border-b border-[#1E293B] pb-3">
              <Info className="w-5 h-5 text-[#B7D1EA]" />
              <h4 className="text-xs font-black text-gray-100 uppercase tracking-widest">
                Server-side Text Overlay Pipeline
              </h4>
            </div>
            <div className="space-y-3 text-[11px] text-gray-400 leading-relaxed">
              <div className="flex items-start gap-2 text-amber-700 bg-amber-500/10/50 p-3 rounded-2xl border border-amber-200">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>รูปพื้นหลังต้องมีขนาด <b>2500 × 1686 px</b> ไม่เกิน 1 MB · ระบบ resize &amp; compress อัตโนมัติด้วย <code>sharp</code></p>
              </div>
              <ol className="mt-1 space-y-1.5 pl-4 list-decimal">
                <li><b>Metadata</b> — ยิง JSON พิกัดช่อง ({activeCellIds.join(", ")}) ไปที่ LINE API</li>
                <li><b>Text Overlay</b> — composite SVG label บนช่องที่เปิด แสดง เท่านั้น</li>
                <li><b>Binary Upload</b> — ส่งไฟล์ JPEG ไปที่ <code>api-data.line.me</code></li>
                <li><b>Profile Assignment</b> — เลือกกลุ่มและช่วงเวลา จากนั้น Scheduler หรือ Apply Now จะ push ไปยัง LINE users</li>
              </ol>
            </div>
          </div>

          {/* Template legend */}
          <div className="flex items-center gap-2 pt-2 border-t border-[#1E293B]">
            <LayoutGrid className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
              {TEMPLATES[layoutTemplate].label}: {TEMPLATES[layoutTemplate].subtitle}
            </span>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
