export function canRescheduleVisit(status: string): boolean {
  return status === "PLANNED" || status === "CONFIRMED";
}

export type VisitDateDraft = {
  originalDate: string;
  targetDate: string;
};

export const MAX_SCHEDULE_DAY_SPAN = 30;

export function clearVisitDateDraft<T>(
  drafts: Record<string, T>,
  visitId: string,
): Record<string, T> {
  const next = { ...drafts };
  delete next[visitId];
  return next;
}

export function reconcileVisitDateDrafts(
  drafts: Record<string, VisitDateDraft>,
  scheduledDateByVisit: Record<string, string>,
): Record<string, VisitDateDraft> {
  return Object.fromEntries(
    Object.entries(drafts).filter(([visitId, draft]) => scheduledDateByVisit[visitId] === draft.originalDate),
  );
}

type ZonedDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function zonedDateTimeParts(value: Date, timeZone: string): ZonedDateTimeParts | null {
  if (Number.isNaN(value.getTime())) return null;
  try {
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
    const values = new Map(parts.map(({ type, value: partValue }) => [type, partValue]));
    const result = {
      year: Number(values.get("year")),
      month: Number(values.get("month")),
      day: Number(values.get("day")),
      hour: Number(values.get("hour")),
      minute: Number(values.get("minute")),
      second: Number(values.get("second")),
    };
    return Object.values(result).every(Number.isFinite) ? result : null;
  } catch {
    return null;
  }
}

export function dateKeyInTimeZone(value: string | null, timeZone: string): string | null {
  if (!value) return null;
  const parts = zonedDateTimeParts(new Date(value), timeZone);
  if (!parts) return null;
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function calendarDateUtc(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.getTime();
}

export function scheduleQueryBounds(from: string, to: string): { from: string; to: string } | null {
  const fromUtc = calendarDateUtc(from);
  const toUtc = calendarDateUtc(to);
  if (fromUtc === null || toUtc === null || toUtc < fromUtc) return null;
  if ((toUtc - fromUtc) / 86_400_000 > MAX_SCHEDULE_DAY_SPAN) return null;

  // Include each visit's local date at the UTC+14 start and UTC-12 end extremes.
  const earliest = fromUtc - 14 * 60 * 60 * 1000;
  const latest = toUtc + 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000 - 1;
  return { from: new Date(earliest).toISOString(), to: new Date(latest).toISOString() };
}

export function isVisitWithinDateRange(
  scheduledStart: string | null,
  timeZone: string,
  from: string,
  to: string,
): boolean {
  if (!scheduledStart) return true;
  const localDate = dateKeyInTimeZone(scheduledStart, timeZone);
  return localDate !== null && localDate >= from && localDate <= to;
}

export function wallClockInTimeZone(value: Date, timeZone: string): { hour: number; minute: number } | null {
  const parts = zonedDateTimeParts(value, timeZone);
  return parts ? { hour: parts.hour, minute: parts.minute } : null;
}

export function dateTimeInTimeZone(
  date: string,
  hour: number,
  minute: number,
  timeZone: string,
): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const [year, month, day] = date.split("-").map(Number);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const requested = new Date(wallClockAsUtc);
  if (requested.getUTCFullYear() !== year || requested.getUTCMonth() !== month - 1 || requested.getUTCDate() !== day) return null;

  let candidate = wallClockAsUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observed = zonedDateTimeParts(new Date(candidate), timeZone);
    if (!observed) return null;
    const observedAsUtc = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, observed.second);
    const adjustment = wallClockAsUtc - observedAsUtc;
    candidate += adjustment;
    if (adjustment === 0) {
      const result = new Date(candidate);
      const verified = zonedDateTimeParts(result, timeZone);
      if (verified?.year === year && verified.month === month && verified.day === day && verified.hour === hour && verified.minute === minute) {
        return result;
      }
      return null;
    }
  }
  return null;
}
