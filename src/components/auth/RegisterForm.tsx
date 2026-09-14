"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import { signup } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import {
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  User,
} from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { AuthClaimPrefill } from "@/types/auth";

type RegisterFormValues = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export default function RegisterForm({
  claimPrefill,
}: {
  claimPrefill?: AuthClaimPrefill | null;
}) {
  const locale = useLocale();
  const searchParams = useSearchParams();
  const referenceNumber = searchParams.get("reference_number") || "";
  const t = useTranslations("RegisterForm");
  const authT = useTranslations("AuthPage");
  const fieldPrefix = useId();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newsConsent, setNewsConsent] = useState(false);
  const [promotionsConsent, setPromotionsConsent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const loginHref = `/${locale}/login`;

  const registerSchema = useMemo(
    () =>
      z
        .object({
          name: z.string().min(2, authT("nameValidation")),
          email: z.string().email(authT("emailValidation")),
          password: z.string().min(8, authT("passwordValidation")),
          confirmPassword: z.string(),
        })
        .refine((data) => data.password === data.confirmPassword, {
          message: authT("passwordMismatch"),
          path: ["confirmPassword"],
        }),
    [authT],
  );

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: claimPrefill?.fullName || "",
      email: claimPrefill?.email || "",
      password: "",
      confirmPassword: "",
    },
  });

  const password = useWatch({ control, name: "password", defaultValue: "" });
  const registeredEmail = useWatch({
    control,
    name: "email",
    defaultValue: claimPrefill?.email || "",
  });

  const passwordStrength = useMemo(() => {
    let strength = 0;
    if (password.length >= 8) strength += 25;
    if (/[A-Z]/.test(password)) strength += 25;
    if (/[0-9]/.test(password)) strength += 25;
    if (/[^A-Za-z0-9]/.test(password)) strength += 25;
    return strength;
  }, [password]);

  const onSubmit = async (values: RegisterFormValues) => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.append("email", values.email);
    formData.append("password", values.password);
    formData.append("name", values.name);
    formData.append("locale", locale);
    if (newsConsent) formData.append("news", "on");
    if (promotionsConsent) formData.append("promotions", "on");
    if (referenceNumber) formData.append("reference_number", referenceNumber);

    const result = await signup(formData);

    if (result?.error) {
      setError(result.error);
      toast.error(result.error);
    } else {
      setSuccess(t("successMessage"));
      toast.success(t("successToast"));
    }
    setLoading(false);
  };

  const nameId = `${fieldPrefix}-name`;
  const emailId = `${fieldPrefix}-email`;
  const passwordId = `${fieldPrefix}-password`;
  const confirmPasswordId = `${fieldPrefix}-confirm-password`;

  if (success) {
    return (
      <div role="status" aria-live="polite" className="space-y-6 py-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/30 text-foreground">
          <CheckCircle2 aria-hidden="true" className="h-7 w-7" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">{t("verifyEmail")}</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {t.rich("verifyEmailDescription", {
              email: registeredEmail,
              strong: (chunks) => (
                <span className="font-semibold text-foreground">{chunks}</span>
              ),
            })}
          </p>
        </div>
        <Button asChild className="min-h-12 px-6">
          <Link href={loginHref}>{t("backToLogin")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit(onSubmit)} aria-busy={loading} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor={nameId}>{t("fullName")}</Label>
          <div className="relative">
            <User aria-hidden="true" className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              {...register("name")}
              id={nameId}
              autoComplete="name"
              required
              placeholder={t("namePlaceholder")}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? `${nameId}-error` : undefined}
              className={cn("min-h-12 pl-11 text-base", errors.name ? "border-destructive" : null)}
            />
          </div>
          {errors.name ? (
            <p id={`${nameId}-error`} role="alert" className="text-xs font-medium text-destructive">
              {errors.name.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor={emailId}>{t("emailAddress")}</Label>
          <div className="relative">
            <Mail aria-hidden="true" className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              {...register("email")}
              id={emailId}
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              readOnly={Boolean(claimPrefill?.email)}
              placeholder="name@example.com"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? `${emailId}-error` : undefined}
              className={cn("min-h-12 pl-11 text-base", errors.email ? "border-destructive" : null)}
            />
          </div>
          {errors.email ? (
            <p id={`${emailId}-error`} role="alert" className="text-xs font-medium text-destructive">
              {errors.email.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor={passwordId}>{t("password")}</Label>
          <div className="relative">
            <Lock aria-hidden="true" className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              {...register("password")}
              id={passwordId}
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              placeholder="••••••••"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={[
                errors.password ? `${passwordId}-error` : null,
                password ? `${passwordId}-strength` : null,
              ].filter(Boolean).join(" ") || undefined}
              className={cn("min-h-12 pl-11 pr-12 text-base", errors.password ? "border-destructive" : null)}
            />
            <Button
              type="button"
              variant="quiet"
              size="icon"
              aria-label={showPassword ? authT("hidePassword") : authT("showPassword")}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-0.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </Button>
          </div>
          {password ? (
            <div id={`${passwordId}-strength`} className="space-y-2 pt-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{t("strength")}</span>
                <span className="font-semibold text-foreground">{passwordStrength}%</span>
              </div>
              <div
                role="progressbar"
                aria-label={t("strength")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={passwordStrength}
                className="h-1.5 overflow-hidden rounded-full bg-slate-200"
              >
                <div
                  className={cn(
                    "h-full transition-[width,background-color] duration-200",
                    passwordStrength <= 25
                      ? "bg-rose-500"
                      : passwordStrength <= 50
                        ? "bg-orange-500"
                        : passwordStrength <= 75
                          ? "bg-amber-500"
                          : "bg-emerald-600",
                  )}
                  style={{ width: `${passwordStrength}%` }}
                />
              </div>
            </div>
          ) : null}
          {errors.password ? (
            <p id={`${passwordId}-error`} role="alert" className="text-xs font-medium text-destructive">
              {errors.password.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor={confirmPasswordId}>{t("confirmPassword")}</Label>
          <div className="relative">
            <Lock aria-hidden="true" className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              {...register("confirmPassword")}
              id={confirmPasswordId}
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              placeholder="••••••••"
              aria-invalid={Boolean(errors.confirmPassword)}
              aria-describedby={errors.confirmPassword ? `${confirmPasswordId}-error` : undefined}
              className={cn("min-h-12 pl-11 pr-12 text-base", errors.confirmPassword ? "border-destructive" : null)}
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
              {showConfirmPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </Button>
          </div>
          {errors.confirmPassword ? (
            <p id={`${confirmPasswordId}-error`} role="alert" className="text-xs font-medium text-destructive">
              {errors.confirmPassword.message}
            </p>
          ) : null}
        </div>

        {error ? (
          <div role="alert" aria-live="polite" className="rounded-xl bg-rose-50 p-4 text-sm font-medium text-rose-800">
            {error}
          </div>
        ) : null}

        <fieldset className="rounded-xl bg-muted p-4">
          <legend className="px-1 text-sm font-bold text-foreground">{t("consent.title")}</legend>
          <p className="mb-3 mt-1 text-sm leading-6 text-muted-foreground">{t("consent.description")}</p>
          <div className="space-y-2">
            <ConsentCheckbox
              name="news"
              checked={newsConsent}
              onChange={setNewsConsent}
              label={t("consent.news.label")}
              description={t("consent.news.description")}
            />
            <ConsentCheckbox
              name="promotions"
              checked={promotionsConsent}
              onChange={setPromotionsConsent}
              label={t("consent.promotions.label")}
              description={t("consent.promotions.description")}
            />
          </div>
        </fieldset>

        <Button type="submit" size="lg" disabled={loading} className="min-h-12 w-full rounded-full bg-[#B7D1EA] text-white hover:bg-[#A5C2DE] active:scale-95 shadow-md font-bold">
          {loading ? <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" /> : null}
          {t("createAccount")}
        </Button>
      </form>

      <p className="pt-2 text-center text-sm text-muted-foreground">
        {t("alreadyHaveAccount")}{" "}
        <Link
          href={loginHref}
          className="inline-flex min-h-11 items-center rounded-lg px-1 font-bold text-[#4F7FA8] underline-offset-4 hover:underline hover:text-[#2E2C27] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("signInInstead")}
        </Link>
      </p>
    </div>
  );
}

function ConsentCheckbox({
  name,
  checked,
  onChange,
  label,
  description,
}: {
  name: "news" | "promotions";
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <label className="group flex min-h-12 cursor-pointer items-start gap-3 rounded-lg px-2 py-2 transition-colors duration-200 hover:bg-white">
      <input
        type="checkbox"
        name={name}
        value="on"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        className={cn(
          "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors duration-200 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-ring",
          checked
            ? "border-[#7CA8D0] bg-[#B7D1EA] text-white"
            : "border-slate-400 bg-white text-transparent",
        )}
        aria-hidden="true"
      >
        <Check className="h-3.5 w-3.5" />
      </span>
      <span>
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        <span className="mt-0.5 block text-sm leading-5 text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}
