import { connection } from "next/server";
import Link from "next/link";
import { ArrowLeft, CalendarRange } from "@/components/ui/icons";
import { requireAdmin } from "@/lib/auth-guard";
import { getRichMenuProfiles, getRichMenuSchedules, getRichMenuSchedulerTimezone, type RichMenuProfileRecord } from "@/lib/richMenuScheduler";
import { RICH_MENU_PROFILE_TYPES } from "@/lib/richMenuScheduler";
import RichMenuSchedulerClient from "./RichMenuSchedulerClient";


export default async function RichMenuSchedulerPage() {
  await connection();
  await requireAdmin();

  const [profiles, schedules] = await Promise.all([
    getRichMenuProfiles(),
    getRichMenuSchedules(),
  ]);

  const profileMap = new Map(profiles.map((profile) => [profile.profileType, profile]));
  const normalizedProfiles: RichMenuProfileRecord[] = RICH_MENU_PROFILE_TYPES.map((profileType) => {
    const existing = profileMap.get(profileType);
    return (
      existing ?? {
        id: `draft-${profileType.toLowerCase()}`,
        profileType,
        name: profileType.replace(/_/g, " "),
        description: null,
        imageUrl: null,
        richMenuId: null,
        lineRichMenuId: null,
        isActive: true,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      }
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#B7D1EA]/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-gray-300">
            <CalendarRange className="h-4 w-4 text-[#B7D1EA]" />
            Rich Menu Scheduler
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-black tracking-tight text-gray-100">
              Rich Menu Profile & Scheduling Management
            </h1>
            <p className="max-w-3xl text-sm font-medium leading-6 text-gray-400">
              Configure segment profiles, replace overlapping time windows when needed, and automate LINE menu switching across customer groups.
            </p>
          </div>
        </div>

        <Link
          href="/admin/settings/line"
          className="inline-flex items-center gap-2 rounded-xl border border-[#1E293B] bg-[#0F172A] px-3 py-2 text-xs font-black uppercase tracking-wider text-gray-400 transition hover:border-[#B7D1EA] hover:text-[#B7D1EA]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      </div>

      <RichMenuSchedulerClient
        initialProfiles={normalizedProfiles}
        initialSchedules={schedules}
        schedulerTimezone={getRichMenuSchedulerTimezone()}
      />
    </div>
  );
}
