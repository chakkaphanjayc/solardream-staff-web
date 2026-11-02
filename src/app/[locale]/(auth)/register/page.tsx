import { Suspense } from "react";
import { cookies } from "next/headers";

import AuthFlowPage from "@/components/auth/AuthFlowPage";
import { getPortalClaimPrefill, SERVICE_PORTAL_CLAIM_COOKIE } from "@/lib/servicePortal";

async function RegisterAuthFlow() {
  const cookieStore = await cookies();
  const claimPrefill = await getPortalClaimPrefill(cookieStore.get(SERVICE_PORTAL_CLAIM_COOKIE)?.value).catch(() => null);
  return <AuthFlowPage initialMode="register" claimPrefill={claimPrefill} />;
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-[#F0EEE9]" aria-hidden="true" />}>
      <RegisterAuthFlow />
    </Suspense>
  );
}
