"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Provider } from "@supabase/auth-js";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import { login, signup } from "@/app/actions/auth";
import { getCurrentAccountSetupState } from "@/app/actions/profile";
import LineLoginButton from "@/components/auth/LineLoginButton";
import TurnstileWrapper from "@/components/security/TurnstileWrapper";
import type { ServiceLocation } from "@/components/services/ServiceLocationPicker";
import { Button } from "@/components/ui/button";
import {
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Fingerprint,
  Loader2,
  Lock,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  ShieldAlert,
  User,
} from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Skeleton from "@/components/ui/skeleton";
import { setAuthNextPathCookie } from "@/lib/authRedirect";
import {
  getPasskeyErrorMessage,
  getPasskeyPreflightError,
} from "@/lib/passkeyFeedback";
import { trackProductEvent } from "@/lib/productAnalytics";
import { getSafeInternalPath } from "@/lib/safeRedirect";
import { getBrowserPublicOrigin } from "@/lib/siteUrl";
import { cn } from "@/lib/utils";
import type { AuthClaimPrefill, AuthMode } from "@/types/auth";
import { createClient } from "@/utils/supabase/client";

export type { AuthMode } from "@/types/auth";

const ServiceLocationPicker = dynamic(
  () => import("@/components/services/ServiceLocationPicker"),
  { ssr: false },
);

type LoginFormProps = {
  mode?: AuthMode;
  onModeChange?: (mode: AuthMode) => void;
  claimPrefill?: AuthClaimPrefill | null;
};

type AuthFormValues = {
  name?: string;
  email: string;
  password: string;
  confirmPassword?: string;
  news: boolean;
  promotions: boolean;
  phone?: string;
  serviceAddress?: string;
};

const inputClassName =
  "solar-auth-input min-h-12 w-full rounded-t-xl rounded-b-none border-0 border-b-2 border-[#8E8B83] bg-[#F7F6F3] pl-11 pr-4 text-base font-medium text-[#2E2C27] transition-all focus:border-[#7CA8D0] focus:bg-[#F0EEE9] outline-none disabled:bg-slate-100 placeholder:text-[#8E8B83] placeholder:font-normal";
const primaryButtonClassName =
  "solar-auth-primary min-h-13 w-full rounded-full bg-[#B7D1EA] hover:bg-[#A5C2DE] text-white px-5 text-base font-bold tracking-tight transition-all disabled:opacity-70 active:scale-95 shadow-md";
const secondaryButtonClassName =
  "solar-auth-secondary min-h-13 w-full rounded-full border border-[#CBC7BE] bg-[#F0EEE9] hover:bg-[#DCE8F5] text-[#2E2C27] px-5 text-sm font-bold transition-all disabled:opacity-70 active:scale-95 shadow-sm";

function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="currentColor"
      {...props}
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </svg>
  );
}

function getPasswordStrength(password: string) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;

  if (!password) {
    return {
      level: 0,
      labelKey: "passwordStrengthWeak" as const,
      className: "bg-slate-200",
      textClassName: "text-slate-600",
    };
  }

  if (checks <= 1) {
    return {
      level: 1,
      labelKey: "passwordStrengthWeak" as const,
      className: "bg-rose-500",
      textClassName: "text-rose-700",
    };
  }

  if (checks <= 3) {
    return {
      level: 2,
      labelKey: "passwordStrengthGood" as const,
      className: "bg-amber-500",
      textClassName: "text-amber-800",
    };
  }

  return {
    level: 3,
    labelKey: "passwordStrengthStrong" as const,
    className: "bg-emerald-600",
    textClassName: "text-emerald-800",
  };
}

function getAccountSetupPath(locale: string, nextPath: string) {
  const safeNext = nextPath.startsWith(`/${locale}/account/setup`)
    ? `/${locale}`
    : nextPath;
  return `/${locale}/account/setup?next=${encodeURIComponent(safeNext)}`;
}

async function waitForSignedInUser(supabase: ReturnType<typeof createClient>) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) return user;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) return session.user;
    } catch {
      // Retry short-lived auth storage errors before showing a safe failure.
    }

    if (attempt < 3) {
      await new Promise((resolve) =>
        window.setTimeout(resolve, 125 * (attempt + 1)),
      );
    }
  }

  return null;
}

export default function LoginForm({
  mode,
  onModeChange,
  claimPrefill,
}: LoginFormProps) {
  const [internalMode, setInternalMode] = useState<AuthMode>(mode ?? "login");
  const activeMode = mode ?? internalMode;
  const isRegister = activeMode === "register";
  const [loading, setLoading] = useState(false);
  const [oauthProviderLoading, setOauthProviderLoading] = useState<
    "google" | "line" | null
  >(null);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [registrationLocationOpen, setRegistrationLocationOpen] =
    useState(false);
  const [registrationLocation, setRegistrationLocation] =
    useState<ServiceLocation | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<SupabaseUser | null>(null);
  const [checkingUser, setCheckingUser] = useState(true);
  const [isLineWebView] = useState(() =>
    typeof navigator !== "undefined"
      ? /Line/i.test(navigator.userAgent)
      : false,
  );
  const fieldPrefix = useId();

  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const consentT = useTranslations("RegisterForm.consent");
  const claimT = useTranslations("TrackPage.registration");
  const authT = useTranslations("AuthPage");
  const linkToken = searchParams.get("linkToken");
  const nextPath = getSafeInternalPath(searchParams.get("next"), `/${locale}`);
  const isDiscourseSsoFlow = nextPath.startsWith("/api/auth/discourse-sso");
  const forgotPasswordHref = `/${locale}/forgot-password`;

  const nameId = `${fieldPrefix}-name`;
  const emailId = `${fieldPrefix}-email`;
  const passwordId = `${fieldPrefix}-password`;
  const confirmPasswordId = `${fieldPrefix}-confirm-password`;
  const phoneId = `${fieldPrefix}-phone`;
  const serviceAddressId = `${fieldPrefix}-service-address`;
  const formErrorId = `${fieldPrefix}-form-error`;

  const authSchema = useMemo(
    () =>
      z.object({
        name: z.string().optional(),
        email: z.string().email(authT("emailValidation")),
        password: z
          .string()
          .min(
            isRegister ? 8 : 6,
            authT(
              isRegister ? "passwordValidation" : "loginPasswordValidation",
            ),
          ),
        confirmPassword: z.string().optional(),
        news: z.boolean(),
        promotions: z.boolean(),
        phone: z.string().optional(),
        serviceAddress: z.string().optional(),
      }),
    [authT, isRegister],
  );

  const {
    register,
    handleSubmit,
    reset,
    setError: setFieldError,
    setValue,
    control,
    formState: { errors },
  } = useForm<AuthFormValues>({
    resolver: zodResolver(authSchema),
    defaultValues: {
      name: claimPrefill?.fullName || "",
      email: claimPrefill?.email || "",
      password: "",
      confirmPassword: "",
      news: false,
      promotions: false,
      phone: claimPrefill?.phone || "",
      serviceAddress: claimPrefill?.serviceAddress || "",
    },
  });

  const password = useWatch({ control, name: "password", defaultValue: "" });
  const passwordStrength = useMemo(
    () => getPasswordStrength(password),
    [password],
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.location.hash) return;

    const hashParams = new URLSearchParams(
      window.location.hash.replace(/^#/, ""),
    );
    const oauthErrorDescription = hashParams.get("error_description");
    const oauthErrorCode = hashParams.get("error_code");
    if (!oauthErrorDescription && !oauthErrorCode) return;

    const message =
      oauthErrorDescription?.replace(/\+/g, " ") ||
      oauthErrorCode ||
      authT("authenticationFailed");
    const frame = window.requestAnimationFrame(() => {
      setError(message);
      toast.error(message);

      const cleanUrl = `${window.location.pathname}${window.location.search}`;
      window.history.replaceState(null, "", cleanUrl);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [authT]);

  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data: { user } }) => {
        if (user) setCurrentUser(user);
        setCheckingUser(false);
      })
      .catch(() => {
        setCheckingUser(false);
      });
  }, [supabase]);

  const switchMode = (nextMode: AuthMode) => {
    if (nextMode === activeMode) return;

    setError(null);
    setSuccessEmail(null);
    setShowPassword(false);
    setShowConfirmPassword(false);
    setRegistrationLocationOpen(false);
    setRegistrationLocation(null);
    setTurnstileToken(null);
    reset({
      name: nextMode === "register" ? claimPrefill?.fullName || "" : "",
      email: nextMode === "register" ? claimPrefill?.email || "" : "",
      password: "",
      confirmPassword: "",
      news: false,
      promotions: false,
      phone: nextMode === "register" ? claimPrefill?.phone || "" : "",
      serviceAddress:
        nextMode === "register" ? claimPrefill?.serviceAddress || "" : "",
    });
    onModeChange?.(nextMode);
    setInternalMode(nextMode);
  };

  const onSubmit = async (values: AuthFormValues) => {
    setLoading(true);
    setError(null);
    setSuccessEmail(null);
    void trackProductEvent(isRegister ? "sign_up_started" : "login_started", {
      method: "email",
      role: "client",
    });

    if (!turnstileToken) {
      const message = authT("securityCheckRequired");
      setError(message);
      toast.error(message);
      setLoading(false);
      return;
    }

    if (isRegister) {
      const name = values.name?.trim() ?? "";

      if (name.length < 2) {
        setFieldError("name", {
          type: "manual",
          message: authT("nameValidation"),
        });
        setLoading(false);
        return;
      }

      if (values.password.length < 8) {
        setFieldError("password", {
          type: "manual",
          message: authT("passwordValidation"),
        });
        setLoading(false);
        return;
      }

      if (values.password !== values.confirmPassword) {
        setFieldError("confirmPassword", {
          type: "manual",
          message: authT("passwordMismatch"),
        });
        setLoading(false);
        return;
      }

      const formData = new FormData();
      formData.append("name", name);
      formData.append("email", values.email);
      formData.append("password", values.password);
      formData.append("locale", locale);
      formData.append("next", nextPath);
      formData.append("turnstileToken", turnstileToken);
      if (values.phone) formData.append("phone", values.phone);
      if (values.serviceAddress) {
        formData.append("serviceAddress", values.serviceAddress);
      }
      if (values.news) formData.append("news", "on");
      if (values.promotions) formData.append("promotions", "on");

      const result = await signup(formData).catch((signupError: unknown) => {
        console.error("[Auth Form]: Signup action failed", signupError);
        return { error: authT("signupUnavailable") };
      });

      if (result?.error) {
        void trackProductEvent("sign_up_failed", {
          method: "email",
          role: "client",
        });
        setError(result.error);
        toast.error(result.error);
        setTurnstileToken(null);
      } else {
        void trackProductEvent("sign_up_succeeded", {
          method: "email",
          role: "client",
        });

        const setupState = await getCurrentAccountSetupState();
        if (setupState.authenticated && !setupState.complete) {
          toast.success(authT("accountCreatedSetup"));
          router.push(getAccountSetupPath(locale, nextPath));
        } else {
          setSuccessEmail(values.email);
          toast.success(authT("accountCreated"));
        }
      }

      setLoading(false);
      return;
    }

    const formData = new FormData();
    formData.append("email", values.email);
    formData.append("password", values.password);
    formData.append("turnstileToken", turnstileToken);

    const loginResult = await login(formData).catch((loginError: unknown) => {
      console.error("[Auth Form]: Login action failed", loginError);
      return { error: authT("loginUnavailable") };
    });

    if (loginResult?.error) {
      void trackProductEvent("login_failed", {
        method: "email",
        role: "client",
      });
      setError(loginResult.error);
      toast.error(loginResult.error);
      setTurnstileToken(null);
      setLoading(false);
      return;
    }

    const signedInUser = await waitForSignedInUser(supabase);
    const setupState = await getCurrentAccountSetupState();

    if (!setupState.authenticated) {
      void trackProductEvent("login_failed", {
        method: "email",
        role: "client",
        reason: "session_not_confirmed",
      });
      const message = authT("sessionNotConfirmed");
      setError(message);
      toast.error(message);
      setTurnstileToken(null);
      setLoading(false);
      return;
    }

    void trackProductEvent("login_succeeded", {
      method: "email",
      role: "client",
    });

    if (signedInUser) {
      try {
        const syncResponse = await fetch("/api/auth/sync-user", {
          method: "POST",
        });
        if (!syncResponse.ok) {
          console.warn("[Auth Form]: User profile sync failed after login", {
            status: syncResponse.status,
          });
        }
      } catch (syncError: unknown) {
        console.warn(
          "[Auth Form]: User profile sync failed after login",
          syncError,
        );
      }
      setCurrentUser(signedInUser);
    }

    if (linkToken) {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) setCurrentUser(user);
      } catch (sessionError: unknown) {
        console.error("Error fetching user session after login:", sessionError);
      } finally {
        setLoading(false);
      }
    } else {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("solardream:auth-changed"));
      }
      toast.success(authT("welcomeRedirecting"));
      const destination =
        setupState.authenticated && !setupState.complete
          ? getAccountSetupPath(locale, nextPath)
          : nextPath;
      router.push(destination);
      router.refresh();
    }
  };

  const handleOAuthLogin = async (provider: "google") => {
    setOauthProviderLoading(provider);
    setAuthNextPathCookie(nextPath);
    void trackProductEvent("auth_provider_selected", {
      method: provider,
      mode: isRegister ? "register" : "login",
    });
    toast.info(authT("connectingProvider", { provider: "Google" }));

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: provider as Provider,
      options: {
        redirectTo: `${getBrowserPublicOrigin()}/${locale}/auth/callback${
          nextPath !== `/${locale}`
            ? `?next=${encodeURIComponent(nextPath)}`
            : ""
        }`,
      },
    });

    if (oauthError) {
      toast.error(oauthError.message);
      setOauthProviderLoading(null);
    }
  };

  const handlePasskeyLogin = async () => {
    void trackProductEvent("auth_provider_selected", {
      method: "passkey",
      mode: "login",
    });
    const passkeyMessages = {
      insecureContext: authT("passkeyInsecureContext"),
      unsupported: authT("passkeyUnsupported"),
      disabled: authT("passkeyDisabled"),
      invalidRpId: authT("passkeyInvalidRpId"),
      failed: authT("passkeyFailed"),
    };
    const preflightError = getPasskeyPreflightError(passkeyMessages);
    if (preflightError) {
      toast.error(preflightError);
      return;
    }

    setPasskeyLoading(true);
    const { error: passkeyError } = await supabase.auth.signInWithPasskey();
    if (passkeyError) {
      toast.error(getPasskeyErrorMessage(passkeyError, passkeyMessages));
      setPasskeyLoading(false);
      return;
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("solardream:auth-changed"));
    }
    const setupState = await getCurrentAccountSetupState();
    const destination =
      setupState.authenticated && !setupState.complete
        ? getAccountSetupPath(locale, nextPath)
        : nextPath;
    router.push(destination);
    router.refresh();
  };

  if (linkToken && currentUser) {
    return (
      <div className="solar-auth-form space-y-6 text-left">
        <div className="solar-auth-notice space-y-4 rounded-xl p-5">
          <div className="flex items-center gap-2">
            <MessageCircle
              aria-hidden="true"
              className="h-5 w-5 text-[#4F7FA8]"
            />
            <h2 className="text-base font-bold text-foreground">
              {authT("lineLinkingTitle")}
            </h2>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="leading-6">{authT("lineSignedInAs")}</p>
            <p className="w-fit max-w-full break-all rounded-lg bg-white px-3 py-2 text-sm font-semibold text-foreground">
              {currentUser.email}
            </p>
            <p className="leading-6">{authT("lineLinkingQuestion")}</p>
          </div>
        </div>

        {error ? (
          <div
            role="alert"
            aria-live="polite"
            className="solar-auth-alert rounded-xl p-4 text-sm font-medium"
          >
            {error}
          </div>
        ) : null}

        <div className="space-y-3">
          <Button
            type="button"
            disabled={loading}
            aria-busy={loading}
            onClick={async () => {
              setLoading(true);
              setError(null);
              try {
                const { initiateLineLinking } =
                  await import("@/app/actions/profile");
                const result = await initiateLineLinking(linkToken, locale);
                if (result.error) {
                  setError(result.error);
                } else if (result.redirectUrl) {
                  toast.success(authT("lineRedirecting"));
                  window.location.assign(result.redirectUrl);
                }
              } catch {
                setError(authT("lineLinkFailed"));
              } finally {
                setLoading(false);
              }
            }}
            className={primaryButtonClassName}
          >
            {loading ? (
              <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
            ) : null}
            {authT("linkAccount")}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              setLoading(true);
              await supabase.auth.signOut();
              setCurrentUser(null);
              setLoading(false);
            }}
            className={secondaryButtonClassName}
          >
            {authT("useAnotherAccount")}
          </Button>
        </div>
      </div>
    );
  }

  if (checkingUser) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="solar-auth-form space-y-4 py-4"
      >
        <span className="sr-only">{authT("verifyingSession")}</span>
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-pill" />
      </div>
    );
  }

  if (successEmail) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="solar-auth-form solar-auth-success space-y-6 py-4 text-center"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/30 text-foreground">
          <CheckCircle2 aria-hidden="true" className="h-7 w-7" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">
            {authT("verifyEmailTitle")}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {authT.rich("verifyEmailDescription", {
              email: successEmail,
              strong: (chunks) => (
                <span className="font-semibold text-foreground">{chunks}</span>
              ),
            })}
          </p>
        </div>
        <Button
          type="button"
          onClick={() => switchMode("login")}
          className="min-h-12 px-6"
        >
          {authT("backToSignIn")}
        </Button>
      </div>
    );
  }

  return (
    <div className="solar-auth-form space-y-6">
      {linkToken ? (
        <div className="solar-auth-notice space-y-1.5 rounded-xl p-4 text-left text-sm text-foreground">
          <p className="flex items-center gap-2 font-bold">
            <MessageCircle
              aria-hidden="true"
              className="h-4 w-4 text-[#4F7FA8]"
            />
            {authT("lineLinkingTitle")}
          </p>
          <p className="leading-6 text-muted-foreground">
            {authT("lineLinkingInstructions")}
          </p>
        </div>
      ) : null}

      {isDiscourseSsoFlow && !isRegister ? (
        <div className="solar-auth-notice flex items-start gap-3 rounded-xl p-4 text-left text-sm text-muted-foreground">
          <MessageCircle
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0 text-[#4F7FA8]"
          />
          <div className="space-y-1">
            <p className="font-bold text-foreground">
              {authT("forumSsoTitle")}
            </p>
            <p className="leading-6">{authT("forumSsoDescription")}</p>
          </div>
        </div>
      ) : null}

      <form
        key={activeMode}
        onSubmit={handleSubmit(onSubmit)}
        data-analytics-form={isRegister ? "register" : "login"}
        data-analytics-submit-event={
          isRegister ? "sign_up_succeeded" : "login_succeeded"
        }
        aria-busy={loading}
        aria-describedby={error ? formErrorId : undefined}
        className="solar-auth-form-fields space-y-4"
      >
        {isRegister ? (
          <div className="space-y-2">
            <Label htmlFor={nameId}>{authT("fullNameLabel")}</Label>
            <div className="relative">
              <User
                aria-hidden="true"
                className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                {...register("name")}
                id={nameId}
                type="text"
                autoComplete="name"
                placeholder={authT("fullNamePlaceholder")}
                required
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? `${nameId}-error` : undefined}
                className={cn(
                  inputClassName,
                  errors.name
                    ? "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25"
                    : null,
                )}
              />
            </div>
            {errors.name ? (
              <p
                id={`${nameId}-error`}
                role="alert"
                className="text-xs font-medium text-destructive"
              >
                {errors.name.message}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor={emailId}>{authT("emailLabel")}</Label>
          <div className="relative">
            <Mail
              aria-hidden="true"
              className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              {...register("email")}
              id={emailId}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={authT("emailPlaceholder")}
              readOnly={Boolean(isRegister && claimPrefill?.email)}
              required
              aria-invalid={Boolean(errors.email)}
              aria-describedby={
                [
                  errors.email ? `${emailId}-error` : null,
                  isRegister && claimPrefill?.email
                    ? `${emailId}-claimed-note`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
              className={cn(
                inputClassName,
                errors.email
                  ? "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25"
                  : null,
              )}
            />
          </div>
          {errors.email ? (
            <p
              id={`${emailId}-error`}
              role="alert"
              className="text-xs font-medium text-destructive"
            >
              {errors.email.message}
            </p>
          ) : null}
          {isRegister && claimPrefill?.email ? (
            <p
              id={`${emailId}-claimed-note`}
              className="text-xs font-semibold text-[#4F7FA8]"
            >
              {claimT("lockedEmail")}
            </p>
          ) : null}
        </div>

        {isRegister && claimPrefill ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={phoneId}>{claimT("phone")}</Label>
              <div className="relative">
                <Phone
                  aria-hidden="true"
                  className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  {...register("phone")}
                  id={phoneId}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  className={inputClassName}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor={serviceAddressId}>
                {claimT("serviceAddress")}
              </Label>
              <div className="relative">
                <MapPin
                  aria-hidden="true"
                  className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  {...register("serviceAddress")}
                  id={serviceAddressId}
                  autoComplete="street-address"
                  className={inputClassName}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setRegistrationLocationOpen((open) => !open)}
                className="w-full justify-center sm:w-auto"
                aria-expanded={registrationLocationOpen}
              >
                <MapPin aria-hidden="true" className="h-4 w-4" />
                {authT("pinLocation")}
              </Button>
            </div>
            {registrationLocationOpen ? (
              <div className="sm:col-span-2">
                <ServiceLocationPicker
                  locale={locale}
                  value={registrationLocation}
                  onChange={(next) => {
                    setRegistrationLocation(next);
                    setValue("serviceAddress", next.displayName, {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                  }}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={passwordId}>{authT("passwordLabel")}</Label>
            {!isRegister ? (
              <Link
                href={forgotPasswordHref}
                className="inline-flex min-h-11 items-center rounded-lg px-1 text-xs font-semibold text-[#4F7FA8] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {authT("forgotPassword")}
              </Link>
            ) : null}
          </div>
          <div className="relative">
            <Lock
              aria-hidden="true"
              className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              {...register("password")}
              id={passwordId}
              type={showPassword ? "text" : "password"}
              autoComplete={isRegister ? "new-password" : "current-password"}
              placeholder={authT("passwordPlaceholder")}
              required
              aria-invalid={Boolean(errors.password)}
              aria-describedby={
                [
                  errors.password ? `${passwordId}-error` : null,
                  isRegister && password ? `${passwordId}-strength` : null,
                ]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
              className={cn(
                inputClassName,
                "pr-12",
                errors.password
                  ? "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25"
                  : null,
              )}
            />
            <Button
              type="button"
              variant="quiet"
              size="icon"
              aria-label={
                showPassword ? authT("hidePassword") : authT("showPassword")
              }
              aria-pressed={showPassword}
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-0.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              {showPassword ? (
                <EyeOff aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Eye aria-hidden="true" className="h-4 w-4" />
              )}
            </Button>
          </div>
          {errors.password ? (
            <p
              id={`${passwordId}-error`}
              role="alert"
              className="text-xs font-medium text-destructive"
            >
              {errors.password.message}
            </p>
          ) : null}

          {isRegister && password ? (
            <div id={`${passwordId}-strength`} className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-muted-foreground">
                  {authT("passwordStrength")}
                </span>
                <span
                  className={cn("font-bold", passwordStrength.textClassName)}
                >
                  {authT(passwordStrength.labelKey)}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={authT("passwordStrength")}
                aria-valuemin={0}
                aria-valuemax={3}
                aria-valuenow={passwordStrength.level}
                className="grid grid-cols-3 gap-1.5"
              >
                {[1, 2, 3].map((level) => (
                  <span
                    key={level}
                    aria-hidden="true"
                    className={cn(
                      "h-1.5 rounded-full transition-colors duration-200",
                      passwordStrength.level >= level
                        ? passwordStrength.className
                        : "bg-slate-200",
                    )}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {isRegister ? (
          <div className="space-y-2">
            <Label htmlFor={confirmPasswordId}>
              {authT("confirmPasswordLabel")}
            </Label>
            <div className="relative">
              <Lock
                aria-hidden="true"
                className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                {...register("confirmPassword")}
                id={confirmPasswordId}
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder={authT("confirmPasswordPlaceholder")}
                required
                aria-invalid={Boolean(errors.confirmPassword)}
                aria-describedby={
                  errors.confirmPassword
                    ? `${confirmPasswordId}-error`
                    : undefined
                }
                className={cn(
                  inputClassName,
                  "pr-12",
                  errors.confirmPassword
                    ? "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25"
                    : null,
                )}
              />
              <Button
                type="button"
                variant="quiet"
                size="icon"
                aria-label={
                  showConfirmPassword
                    ? authT("hideConfirmPassword")
                    : authT("showConfirmPassword")
                }
                aria-pressed={showConfirmPassword}
                onClick={() => setShowConfirmPassword((value) => !value)}
                className="absolute right-0.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showConfirmPassword ? (
                  <EyeOff aria-hidden="true" className="h-4 w-4" />
                ) : (
                  <Eye aria-hidden="true" className="h-4 w-4" />
                )}
              </Button>
            </div>
            {errors.confirmPassword ? (
              <p
                id={`${confirmPasswordId}-error`}
                role="alert"
                className="text-xs font-medium text-destructive"
              >
                {errors.confirmPassword.message}
              </p>
            ) : null}
          </div>
        ) : null}

        {isRegister ? (
          <fieldset className="solar-auth-consent rounded-xl p-4">
            <legend className="px-1 text-sm font-bold text-foreground">
              {consentT("title")}
            </legend>
            <p className="mb-3 mt-1 text-sm leading-6 text-muted-foreground">
              {consentT("description")}
            </p>
            <div className="space-y-2">
              {(["news", "promotions"] as const).map((key) => (
                <label
                  key={key}
                  className="group flex min-h-12 cursor-pointer items-start gap-3 rounded-lg px-2 py-2 transition-colors duration-200 hover:bg-white"
                >
                  <input
                    type="checkbox"
                    {...register(key)}
                    className="peer sr-only"
                  />
                  <span
                    className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border border-slate-400 bg-white text-transparent transition-colors duration-200 peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-ring"
                    aria-hidden="true"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-foreground">
                      {consentT(`${key}.label`)}
                    </span>
                    <span className="mt-0.5 block text-sm leading-5 text-muted-foreground">
                      {consentT(`${key}.description`)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {error ? (
          <div
            id={formErrorId}
            role="alert"
            aria-live="polite"
            className="solar-auth-alert rounded-xl p-4 text-sm font-medium"
          >
            {error}
          </div>
        ) : null}

        <TurnstileWrapper
          action={isRegister ? "auth_register" : "auth_login"}
          onTokenChange={setTurnstileToken}
        />

        <Button
          type="submit"
          size="lg"
          disabled={loading || !turnstileToken}
          className={primaryButtonClassName}
        >
          {loading ? (
            <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
          ) : null}
          {isRegister
            ? authT("createAccountButton")
            : linkToken
              ? authT("signInAndLink")
              : authT("signInButton")}
        </Button>

        {!isRegister ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => void handlePasskeyLogin()}
            disabled={loading || passkeyLoading}
            className={secondaryButtonClassName}
          >
            {passkeyLoading ? (
              <Loader2
                aria-hidden="true"
                className="h-5 w-5 animate-spin text-[#4F7FA8]"
              />
            ) : (
              <Fingerprint
                aria-hidden="true"
                className="h-5 w-5 text-[#4F7FA8]"
              />
            )}
            {authT("passkeyButton")}
          </Button>
        ) : null}
      </form>

      {!isRegister &&
        (isLineWebView ? (
          <div className="solar-auth-warning mt-4 space-y-1 rounded-xl p-4 text-left text-sm leading-6">
            <div className="flex items-center gap-2 font-bold">
              <ShieldAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
              {authT("lineWebViewTitle")}
            </div>
            <p className="leading-6 text-amber-900">
              {authT("lineWebViewDescription")}
            </p>
          </div>
        ) : (
          <>
            <div className="solar-auth-divider flex items-center gap-3 py-1 text-xs font-bold text-[#1C1C1A]">
              <span
                className="h-[2px] flex-1 bg-[#1C1C1A]/15"
                aria-hidden="true"
              />
              <span>{authT("orContinueWith")}</span>
              <span
                className="h-[2px] flex-1 bg-[#1C1C1A]/15"
                aria-hidden="true"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOAuthLogin("google")}
                disabled={loading || oauthProviderLoading !== null}
                className={secondaryButtonClassName}
              >
                {oauthProviderLoading === "google" ? (
                  <Loader2
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin"
                  />
                ) : (
                  <GoogleIcon aria-hidden="true" className="h-4 w-4" />
                )}
                {oauthProviderLoading === "google"
                  ? authT("connecting")
                  : "Google"}
              </Button>
              <LineLoginButton
                locale={locale}
                nextPath={nextPath}
                linkToken={linkToken}
                disabled={loading || oauthProviderLoading !== null}
                onLoadingChange={(isLoading) =>
                  setOauthProviderLoading(isLoading ? "line" : null)
                }
              />
            </div>
          </>
        ))}

      <p className="solar-auth-mode-switch pt-2 text-center text-sm font-semibold text-slate-600">
        {isRegister ? authT("alreadyHaveAccount") : authT("dontHaveAccount")}
        <Button
          type="button"
          variant="link"
          onClick={() => switchMode(isRegister ? "login" : "register")}
          className="ml-1 min-h-11 px-1 font-bold text-[#4F7FA8] underline decoration-2 underline-offset-4 hover:text-[#2E2C27]"
        >
          {isRegister ? authT("signInLink") : authT("signUpForFree")}
        </Button>
      </p>
    </div>
  );
}
