"use client";

import { Suspense, useState } from "react";
import { useTranslations } from "next-intl";
import AuthSplitLayout from "@/components/auth/AuthSplitLayout";
import LoginForm from "@/components/auth/LoginForm";
import OAuthCodeBridge from "@/components/auth/OAuthCodeBridge";
import { AuthFormSkeleton } from "@/components/auth/AuthPageSkeleton";
import type { AuthClaimPrefill, AuthMode } from "@/types/auth";

type AuthFlowPageProps = {
  initialMode: AuthMode;
  claimPrefill?: AuthClaimPrefill | null;
};

export default function AuthFlowPage({
  initialMode,
  claimPrefill,
}: AuthFlowPageProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const t = useTranslations("AuthPage");

  const title = mode === "register" ? t("registerTitle") : t("loginTitle");
  const subtitle = mode === "register" ? t("registerSubtitle") : t("loginSubtitle");

  return (
    <>
      <Suspense fallback={null}>
        <OAuthCodeBridge />
      </Suspense>
      <AuthSplitLayout
        title={title}
        subtitle={subtitle}
      >
        <Suspense fallback={<AuthFormSkeleton />}>
          <LoginForm
            mode={mode}
            onModeChange={setMode}
            claimPrefill={claimPrefill}
          />
        </Suspense>
      </AuthSplitLayout>
    </>
  );
}
