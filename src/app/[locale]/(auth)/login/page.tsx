import { Suspense } from "react";
import AuthFlowPage from "@/components/auth/AuthFlowPage";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-[#F0EEE9]" aria-hidden="true" />}>
      <AuthFlowPage initialMode="login" />
    </Suspense>
  );
}
