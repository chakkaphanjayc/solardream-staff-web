import Link from "next/link";
import { ArrowLeft, Users } from "@/components/ui/icons";
import { requireAdmin } from "@/lib/auth-guard";
import { getUserGroupAdminStateAction } from "@/app/actions/settings/userGroups";
import UserGroupsClient from "./UserGroupsClient";


export default async function UserGroupsPage() {
  await requireAdmin();
  const initialState = await getUserGroupAdminStateAction();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#B7D1EA]/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-gray-300">
            <Users className="h-4 w-4 text-[#B7D1EA]" />
            User Groups
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-black tracking-tight text-gray-100">
              User Group Rules
            </h1>
            <p className="max-w-3xl text-sm font-medium leading-6 text-gray-400">
              Manage reusable customer groups for rich menus, notifications, promotions, and future feature targeting.
            </p>
          </div>
        </div>

        <Link
          href="/admin/settings/line/scheduler"
          className="inline-flex items-center gap-2 rounded-xl border border-[#1E293B] bg-[#0F172A] px-3 py-2 text-xs font-black uppercase tracking-wider text-gray-400 transition hover:border-[#B7D1EA] hover:text-[#B7D1EA]"
        >
          <ArrowLeft className="h-4 w-4" />
          Rich Menu Scheduler
        </Link>
      </div>

      <UserGroupsClient initialState={initialState} />
    </div>
  );
}
