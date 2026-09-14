export const RICH_MENU_PROFILE_TYPES = [
  "GUEST",
  "MEMBER",
  "CLIENT",
  "MEMBER_RESIDENTIAL",
  "MEMBER_COMMERCIAL",
  "SUB_CONTRACTOR",
] as const;

export type RichMenuProfileType = (typeof RICH_MENU_PROFILE_TYPES)[number];

export type RichMenuProfileRecord = {
  id: string;
  profileType: RichMenuProfileType;
  name: string;
  description: string | null;
  imageUrl: string | null;
  richMenuId: string | null;
  lineRichMenuId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type RichMenuScheduleRecord = {
  id: string;
  profileType: RichMenuProfileType;
  richMenuId: string;
  lineRichMenuId: string;
  startTime: Date;
  endTime: Date;
  isActive: boolean;
  lastAppliedWindowKey: string | null;
  lastAppliedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function isRichMenuProfileType(value: unknown): value is RichMenuProfileType {
  return typeof value === "string" && (RICH_MENU_PROFILE_TYPES as readonly string[]).includes(value);
}

export function normalizeRichMenuProfileType(value: unknown): RichMenuProfileType | null {
  return isRichMenuProfileType(value) ? value : null;
}

export function getRichMenuProfileLabel(profileType: RichMenuProfileType) {
  switch (profileType) {
    case "GUEST":
      return "Guest";
    case "MEMBER":
      return "Member";
    case "CLIENT":
      return "Client";
    case "MEMBER_RESIDENTIAL":
      return "Member Residential";
    case "MEMBER_COMMERCIAL":
      return "Member Commercial";
    case "SUB_CONTRACTOR":
      return "Sub Contractor";
  }
}

export function isRichMenuScheduleOverlap(
  startTime: Date,
  endTime: Date,
  existingStartTime: Date,
  existingEndTime: Date,
) {
  return existingStartTime < endTime && existingEndTime > startTime;
}
