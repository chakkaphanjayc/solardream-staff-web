import { requireAdmin } from "@/lib/auth-guard";
import { db } from "@/db";
import { proposals } from "@/db/schema";
import { desc } from "drizzle-orm";
import SandboxClient from "./SandboxClient";
import { Wrench } from "@/components/ui/icons";
import { getPaymentSettings } from "@/app/actions/settings/paymentSettings";


export default async function DeveloperSandboxPage() {
  // Enforce admin access
  await requireAdmin();

  // Load all proposals with user profile and their milestones
  const orders = await db.query.proposals.findMany({
    with: {
      user: {
        columns: {
          id: true,
          name: true,
          email: true,
        },
      },
      paymentMilestones: {
        orderBy: (milestones, { asc }) => [asc(milestones.milestoneOrder)],
      },
    },
    orderBy: [desc(proposals.createdAt)],
  });

  // Evaluate which environment keys are defined
  const envStatus = {
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    DATABASE_URL: !!process.env.DATABASE_URL,
    GOOGLE_SERVICE_ACCOUNT_EMAIL: !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    GOOGLE_PRIVATE_KEY: !!process.env.GOOGLE_PRIVATE_KEY,
    GOOGLE_DRIVE_ROOT_FOLDER_ID: !!process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID,
    ERPNEXT_BASE_URL: !!process.env.ERPNEXT_BASE_URL,
    ERPNEXT_API_KEY: !!process.env.ERPNEXT_API_KEY,
    ERPNEXT_API_SECRET: !!process.env.ERPNEXT_API_SECRET,
    PUSHER_APP_ID: !!process.env.PUSHER_APP_ID,
    NEXT_PUBLIC_PUSHER_KEY: !!process.env.NEXT_PUBLIC_PUSHER_KEY,
    PUSHER_SECRET: !!process.env.PUSHER_SECRET,
    NEXT_PUBLIC_PUSHER_CLUSTER: !!process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
    EASYSLIP_API_KEY: !!process.env.EASYSLIP_API_KEY,
    NEXT_PUBLIC_PROMPTPAY_ID: !!process.env.NEXT_PUBLIC_PROMPTPAY_ID,
    COMPANY_BANK_ACCOUNT: !!process.env.COMPANY_BANK_ACCOUNT,
    CRON_SECRET: !!process.env.CRON_SECRET,
  };

  const paymentSettings = await getPaymentSettings();

  return (
    <div className="space-y-10">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-gray-100 flex items-center gap-3 font-sans">
            Developer <span className="text-[#B7D1EA]">Sandbox & Testing</span>
          </h1>
          <p className="text-gray-400 text-xs mt-1 uppercase font-black tracking-widest">
            Manually trigger system logic, simulate payment flow updates, and test feature implementations.
          </p>
        </div>
        
        <div className="flex items-center gap-2.5 bg-[#0F172A] border border-[#1E293B] px-4 py-2.5 rounded-2xl text-[10px] font-mono font-black uppercase text-gray-400 self-start md:self-auto shadow-none">
          <Wrench className="w-4 h-4 text-[#B7D1EA]" />
          <span>Admin Sandbox Active</span>
        </div>
      </div>

      {/* Main Sandbox Interface */}
      <SandboxClient initialOrders={orders} envStatus={envStatus} paymentSettings={paymentSettings} />
    </div>
  );
}
