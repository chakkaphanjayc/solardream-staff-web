"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Camera,
  Laptop,
  Loader2,
  LogOut,
  Shield,
  User as UserIcon,
} from "@/components/ui/icons";
import GeneralInfo from "./GeneralInfo";
import SecurityTab from "./SecurityTab";
import SavedBuildsTab from "./SavedBuildsTab";
import { signOut } from "@/app/actions/auth";
import { uploadAvatar } from "@/app/actions/profile";
import { createClient } from "@/utils/supabase/client";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import ProgressiveImage from "@/components/ui/progressive-image";
import CommunicationPreferences from "./CommunicationPreferences";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { ProfileUser } from "@/types/profile";

export type { ProfileUser } from "@/types/profile";

type ProfileTab = "general" | "security" | "builds";

export default function ProfileLayout({ user }: { user: ProfileUser }) {
  const t = useTranslations("ProfileLayout");
  const generalT = useTranslations("ProfileGeneralInfo");
  const [activeTab, setActiveTab] = useState<ProfileTab>("general");
  const supabase = createClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const avatar = event.target.files?.[0];
    if (!avatar) return;
    setAvatarLoading(true);
    const formData = new FormData();
    formData.append("avatar", avatar);
    const result = await uploadAvatar(formData);
    if (result.error) toast.error(result.error);
    else {
      toast.success(t("avatarUpdated"));
      router.refresh();
    }
    setAvatarLoading(false);
  }

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam === "unauthorized") {
      toast.error(t("errors.unauthorized"));
      const url = new URL(window.location.href);
      url.searchParams.delete("error");
      window.history.replaceState({}, document.title, url.pathname + url.search);
    }
  }, [searchParams, t]);

  const tabs: Array<{ id: ProfileTab; label: string; icon: typeof UserIcon }> = [
    { id: "general", label: t("tabs.general"), icon: UserIcon },
    { id: "security", label: t("tabs.security"), icon: Shield },
    { id: "builds", label: t("tabs.builds"), icon: Laptop },
  ];

  async function handleSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    await signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="solar-profile-layout mx-auto w-full max-w-5xl pb-12">
      <PageHeader
        className="solar-profile-page-header"
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
        actions={(
          <Badge variant="info" className="gap-2">
            <Shield className="h-3.5 w-3.5" aria-hidden="true" />
            {t("secureAccount")}
          </Badge>
        )}
      />

      <section
        className="solar-profile-identity mt-7 rounded-[1.5rem] px-5 py-5 sm:px-6 sm:py-6"
        aria-labelledby="profile-identity-name"
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="solar-profile-avatar relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl sm:h-20 sm:w-20">
              {user.avatarUrl && user.avatarUrl.trim() !== "" ? (
                <ProgressiveImage
                  src={user.avatarUrl}
                  alt={user.name || t("fallbackUserName")}
                  fill
                  sizes="(min-width: 640px) 80px, 64px"
                  className="h-full w-full object-cover"
                />
              ) : (
                <UserIcon className="h-8 w-8" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="profile-identity-name" className="text-xl font-black tracking-tight text-slate-950">
                  {user.name || t("fallbackUserName")}
                </h2>
                <Badge variant="primary">{user.role || "USER"}</Badge>
              </div>
              <p className="mt-1 truncate text-sm font-bold text-slate-700">{user.email}</p>
              <p id="avatar-help" role="status" aria-live="polite" className="mt-1 text-xs font-bold text-slate-500">
                {avatarLoading
                  ? t("uploadingAvatar")
                  : `${t("changeAvatarHint")} ${generalT("imageHint")}`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5 sm:shrink-0">
            <label
              className="solar-profile-upload relative inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-xs font-black transition-all duration-200 ease-expo"
            >
              {avatarLoading ? (
                <Loader2 className="animate-spin stroke-[3]" aria-hidden="true" />
              ) : (
                <Camera className="stroke-[2.5]" aria-hidden="true" />
              )}
              <span>{avatarLoading ? t("uploadingAvatar") : generalT("clickToUpload")}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarChange}
                disabled={avatarLoading}
                aria-describedby="avatar-help"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0 focus-visible:outline-none"
              />
            </label>
            <Button
              type="button"
              variant="quiet"
              disabled={signingOut}
              onClick={() => void handleSignOut()}
              className="solar-profile-signout inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-xs font-black transition-all duration-200 ease-expo"
            >
              {signingOut ? (
                <Loader2 className="animate-spin stroke-[3]" aria-hidden="true" />
              ) : (
                <LogOut className="stroke-[2.5]" aria-hidden="true" />
              )}
              {t("signOut")}
            </Button>
          </div>
        </div>
      </section>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as ProfileTab)}
        className="mt-8"
      >
        <TabsList
          aria-label={t("title")}
          className="solar-profile-tabs-list flex w-full max-w-none items-center gap-1 overflow-x-auto rounded-full p-1"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className={cn(
                  "solar-profile-tab group relative flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full px-4 py-2.5 text-sm font-black transition-all duration-200 ease-expo sm:px-5",
                  isActive
                    ? "z-10 text-slate-950"
                    : "text-slate-600 hover:text-slate-950"
                )}
              >
                <tab.icon className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
                <span>{tab.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <div className="solar-profile-panel relative z-0 mt-3 rounded-[1.5rem] px-5 py-7 sm:px-8 sm:py-8 lg:px-9 lg:py-9">
          <TabsContent value="general" className="mt-0">
            <GeneralInfo user={user} />
            <CommunicationPreferences />
          </TabsContent>
          <TabsContent value="security" className="mt-0">
            <SecurityTab />
          </TabsContent>
          <TabsContent value="builds" className="mt-0">
            <SavedBuildsTab configurations={user.savedConfigurations || []} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
