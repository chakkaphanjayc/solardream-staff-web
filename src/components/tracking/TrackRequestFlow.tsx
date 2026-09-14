"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { useLocale } from "next-intl";
import {
  Activity,
  Check,
  CheckCircle2,
  Clock,
  ChevronDown,
  Info,
  Loader2,
  Lock,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import InvisibleTurnstile, {
  type InvisibleTurnstileHandle,
} from "@/components/security/InvisibleTurnstile";
import {
  isEmailLike,
  isTrackingReference,
  normalizeTrackingReference,
} from "@/lib/trackingReference";
import { trackProductEvent } from "@/lib/productAnalytics";
import { cn } from "@/lib/utils";
import SegmentedTrackingInput from "./SegmentedTrackingInput";
import styles from "./track-request-flow.module.css";

type PipelineStep = Readonly<{
  label: string;
  labelTh: string;
  desc?: string;
  descTh?: string;
  status: "completed" | "active" | "upcoming";
}>;

type ProgressData = Readonly<{
  success: boolean;
  reference: string;
  type: "SERVICE_ORDER" | "QUOTATION" | "CONSULTATION_LEAD";
  status: string;
  percent: number;
  current_step: string;
  current_step_th: string;
  maskedCustomerName?: string;
  systemSizeKwp?: number;
  updatedAt?: string;
  steps: readonly PipelineStep[];
}>;

export type TrackRequestSurface = "home" | "services" | "page";

export type TrackRequestFlowProps = Readonly<{
  surface?: TrackRequestSurface;
  presentation?: "dialog" | "page";
  className?: string;
}>;

const copy = {
  en: {
    title: "Track your request",
    description:
      "Enter the reference from your confirmation email or quotation to see the latest milestone without signing in.",
    query: "Tracking reference",
    referencePlaceholder: "SD-QT-123456",
    referenceHint:
      "Use the reference from your confirmation email or quotation.",
    referenceReady: "Ready to check",
    email: "Registered email",
    emailHint:
      "Optional. Add it when you need private documents, pricing, or account updates.",
    emailPlaceholder: "name@example.com",
    submit: "View progress",
    send: "Send secure link",
    sending: "Checking…",
    generic:
      "If a request is linked to these details, a secure access link has been sent to your inbox.",
    privacy: "We never reveal whether a request or email exists.",
    timelineHeader: "Request progress",
    progressDescription:
      "This reference shows the latest milestone without exposing private project details.",
    currentStep: "Current step",
    lastUpdated: "Last updated",
    customer: "Customer",
    systemSize: "System profile",
    notAvailable: "Not available in reference view",
    completed: "Completed",
    active: "In progress",
    upcoming: "Upcoming",
    newLookup: "Track another request",
    unlockTitle: "Need the full project view?",
    upsellText:
      "Send a secure link to your registered email to open documents, pricing, and private account updates.",
    recoveryTitle: "Recover a tracking reference",
    recoveryDesc:
      "Enter your registered email and the last four digits of your phone number. If matched, we will email a secure link to your requests.",
    registeredEmail: "Registered email",
    phoneLast4: "Last 4 digits of phone number (optional)",
    phoneLast4Placeholder: "e.g. 1234",
    requestRecovery: "Forgot your reference number?",
    sendRecovery: "Send recovery link",
    backToTracking: "Back to request tracking",
    correctReference: "Check the reference format and try again.",
    lookupError: "Tracking reference not found. Please verify and try again.",
    magicLinkError: "Could not send a secure link. Please try again.",
    recoveryError: "Could not request recovery. Please try again.",
    securityError: "Security check could not be completed. Please try again.",
    privateAccessToggle: "Need documents or pricing?",
    privateAccessDescription:
      "Add your registered email to receive a secure link.",
    privateAccessHide: "Hide email option",
    pasteReference: "Paste",
    clearReference: "Clear reference",
    maskedNote:
      "Personal details, documents, and pricing stay protected until you verify your email.",
  },
  th: {
    title: "ติดตามคำขอของคุณ",
    description:
      "กรอกหมายเลขจากอีเมลยืนยันหรือใบเสนอราคาเพื่อดูขั้นตอนล่าสุด โดยไม่ต้องเข้าสู่ระบบ",
    query: "หมายเลขติดตาม",
    referencePlaceholder: "SD-QT-123456",
    referenceHint: "ตัวอย่าง: SD-QT-123456 หรือ SD-SV-123456",
    referenceReady: "พร้อมตรวจสอบ",
    email: "อีเมลที่ลงทะเบียน",
    emailHint:
      "ไม่บังคับ ใช้เมื่อต้องการดูเอกสาร ราคา หรือการอัปเดตบัญชีส่วนตัว",
    emailPlaceholder: "name@example.com",
    submit: "ดูความคืบหน้า",
    send: "ส่งลิงก์ปลอดภัย",
    sending: "กำลังตรวจสอบ…",
    generic:
      "หากมีคำขอที่ตรงกับข้อมูลนี้ ระบบจะส่งลิงก์ปลอดภัยไปยังอีเมลของคุณ",
    privacy: "เราไม่เปิดเผยว่าเลขคำขอหรืออีเมลมีอยู่ในระบบหรือไม่",
    timelineHeader: "ความคืบหน้าคำขอ",
    progressDescription:
      "หมายเลขนี้จะแสดงขั้นตอนล่าสุดโดยไม่เปิดเผยรายละเอียดโครงการส่วนตัว",
    currentStep: "ขั้นตอนปัจจุบัน",
    lastUpdated: "อัปเดตล่าสุด",
    customer: "ผู้ขอรับบริการ",
    systemSize: "ขนาดระบบ",
    notAvailable: "ไม่มีข้อมูลในมุมมองหมายเลขอ้างอิง",
    completed: "เสร็จสิ้น",
    active: "กำลังดำเนินการ",
    upcoming: "รอดำเนินการ",
    newLookup: "ติดตามคำขออื่น",
    unlockTitle: "ต้องการดูข้อมูลโครงการทั้งหมดหรือไม่?",
    upsellText:
      "ส่งลิงก์ปลอดภัยไปยังอีเมลที่ลงทะเบียนเพื่อเปิดดูเอกสาร ราคา และการอัปเดตบัญชีส่วนตัว",
    recoveryTitle: "กู้คืนหมายเลขติดตาม",
    recoveryDesc:
      "กรอกอีเมลและหมายเลขโทรศัพท์ 4 หลักสุดท้าย หากข้อมูลตรงกัน ระบบจะส่งลิงก์ปลอดภัยไปยังคำขอของคุณ",
    registeredEmail: "อีเมลที่ลงทะเบียน",
    phoneLast4: "หมายเลขโทรศัพท์ 4 หลักสุดท้าย (ไม่บังคับ)",
    phoneLast4Placeholder: "เช่น 1234",
    requestRecovery: "ลืมหมายเลขติดตามใช่หรือไม่?",
    sendRecovery: "ส่งลิงก์กู้คืนข้อมูล",
    backToTracking: "กลับไปติดตามคำขอ",
    correctReference: "ตรวจสอบรูปแบบหมายเลขแล้วลองอีกครั้ง",
    lookupError: "ไม่พบหมายเลขติดตามนี้ กรุณาตรวจสอบแล้วลองอีกครั้ง",
    magicLinkError: "ไม่สามารถส่งลิงก์ปลอดภัยได้ กรุณาลองอีกครั้ง",
    recoveryError: "ไม่สามารถกู้คืนข้อมูลได้ กรุณาลองอีกครั้ง",
    securityError: "ไม่สามารถตรวจสอบความปลอดภัยได้ กรุณาลองอีกครั้ง",
    privateAccessToggle: "ต้องการดูเอกสารหรือราคาใช่ไหม?",
    privateAccessDescription:
      "เพิ่มอีเมลที่ลงทะเบียนเพื่อรับลิงก์ปลอดภัย",
    privateAccessHide: "ซ่อนตัวเลือกอีเมล",
    pasteReference: "วาง",
    clearReference: "ล้างหมายเลขติดตาม",
    maskedNote:
      "ข้อมูลส่วนตัว เอกสาร และราคาจะได้รับการปกป้องจนกว่าคุณจะยืนยันอีเมล",
  },
} as const;

function getNormalizedPayloadId(rawValue: string) {
  return normalizeTrackingReference(rawValue);
}

function getTypeLabel(type: ProgressData["type"], isThai: boolean) {
  if (type === "SERVICE_ORDER") {
    return isThai ? "คำสั่งบริการ" : "Service order";
  }
  if (type === "CONSULTATION_LEAD") {
    return isThai ? "คำขอประเมินระบบ" : "Consultation request";
  }
  return isThai ? "ใบเสนอราคา" : "Quotation";
}

function formatUpdatedAt(value: string | undefined, lang: "en" | "th") {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

type StatusLabels = Readonly<{
  completed: string;
  active: string;
  upcoming: string;
}>;

function statusLabel(status: PipelineStep["status"], labels: StatusLabels) {
  if (status === "completed") return labels.completed;
  if (status === "active") return labels.active;
  return labels.upcoming;
}

export default function TrackRequestFlow({
  surface = "page",
  presentation = "page",
  className,
}: TrackRequestFlowProps) {
  const locale = useLocale();
  const lang = locale === "en" ? "en" : "th";
  const isThai = lang === "th";
  const c = copy[lang];
  const [query, setQuery] = useState("");
  const [email, setEmail] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [showPrivateAccess, setShowPrivateAccess] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [securityError, setSecurityError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [progressData, setProgressData] = useState<ProgressData | null>(null);
  const turnstileRef = useRef<InvisibleTurnstileHandle>(null);
  const hasTrackedStart = useRef(false);

  const normalizedQuery = normalizeTrackingReference(query);
  const hasCompleteReference = isTrackingReference(normalizedQuery);
  const hasValidEmail = email.trim().length > 0 && isEmailLike(email);
  const emailIsEmptyOrValid = !email.trim() || isEmailLike(email);
  const hasReferenceInput = query.trim().length > 0;
  const referenceCharacterCount = query.replace(/[^a-zA-Z0-9]/g, "").length;
  const referenceHasError =
    hasReferenceInput &&
    referenceCharacterCount >= 8 &&
    !hasCompleteReference &&
    !email.trim();
  const privateAccessVisible = showPrivateAccess || Boolean(email.trim());
  const formIsValid =
    (hasCompleteReference || hasValidEmail) && emailIsEmptyOrValid;
  const requiresSecurity = email.trim().length > 0;
  const securityIsReady = Boolean(turnstileToken);
  const canSubmitPrimary =
    formIsValid &&
    (!requiresSecurity || securityIsReady) &&
    !(complete && email.trim().length > 0);

  const markTrackingStarted = useCallback(() => {
    if (presentation !== "page") return;
    if (hasTrackedStart.current) return;
    hasTrackedStart.current = true;
    void trackProductEvent("support_started", {
      surface,
      entry_point: "tracking_page",
    });
  }, [presentation, surface]);

  const resetTurnstile = useCallback(() => {
    setTurnstileToken(null);
    turnstileRef.current?.reset();
  }, []);

  const handleTurnstileVerify = useCallback((token: string | null) => {
    setTurnstileToken(token);
  }, []);

  const readErrorMessage = useCallback(
    async (response: Response, fallback: string) => {
      if (response.status === 403) resetTurnstile();
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      return payload.error || fallback;
    },
    [resetTurnstile],
  );

  const clearFeedback = () => {
    setComplete(false);
    setSecurityError("");
  };

  const resetFlow = () => {
    setQuery("");
    setEmail("");
    setPhoneLast4("");
    setShowPrivateAccess(false);
    setIsRecovering(false);
    setBusy(false);
    setComplete(false);
    setSecurityError("");
    setProgressData(null);
    resetTurnstile();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const needsSecurity = email.trim().length > 0;
    if (needsSecurity && !turnstileToken) return;

    markTrackingStarted();
    setBusy(true);
    setComplete(false);
    setSecurityError("");
    const payloadId = getNormalizedPayloadId(query);

    try {
      if (email.trim() && !hasCompleteReference) {
        const response = await fetch("/api/track/recover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim(),
            locale: lang,
            turnstileToken,
          }),
        });

        if (!response.ok) {
          setSecurityError(await readErrorMessage(response, c.recoveryError));
          return;
        }

        resetTurnstile();
        setComplete(true);
        void trackProductEvent("support_request_submitted", {
          surface,
          request_type: "tracking_recovery",
        });
      } else if (email.trim()) {
        const response = await fetch("/api/track/magic-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trackingRef: payloadId,
            email: email.trim(),
            locale: lang,
            turnstileToken,
          }),
        });

        if (!response.ok) {
          setSecurityError(await readErrorMessage(response, c.magicLinkError));
          return;
        }

        resetTurnstile();
        setComplete(true);
        void trackProductEvent("support_request_submitted", {
          surface,
          request_type: "tracking_magic_link",
        });
      } else {
        const response = await fetch(
          `/api/track/${encodeURIComponent(payloadId)}`,
          {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          },
        );

        if (!response.ok) {
          setSecurityError(await readErrorMessage(response, c.lookupError));
          return;
        }

        const data = (await response.json()) as ProgressData;
        setProgressData(data);
        void trackProductEvent("support_request_submitted", {
          surface,
          request_type: "tracking_reference_lookup",
          result_type: data.type,
        });
      }
    } catch {
      setSecurityError(c.securityError);
    } finally {
      setBusy(false);
    }
  };

  const submitMagicLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || busy || !turnstileToken) return;

    setBusy(true);
    setComplete(false);
    setSecurityError("");
    const payloadId = getNormalizedPayloadId(query);

    try {
      const response = await fetch("/api/track/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackingRef: payloadId,
          email: email.trim(),
          locale: lang,
          turnstileToken,
        }),
      });

      if (!response.ok) {
        setSecurityError(await readErrorMessage(response, c.magicLinkError));
        return;
      }

      resetTurnstile();
      setComplete(true);
      void trackProductEvent("support_request_submitted", {
        surface,
        request_type: "tracking_magic_link_upsell",
      });
    } catch {
      setSecurityError(c.magicLinkError);
    } finally {
      setBusy(false);
    }
  };

  const submitRecovery = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || busy || !turnstileToken) return;

    setBusy(true);
    setComplete(false);
    setSecurityError("");

    try {
      const response = await fetch("/api/track/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          phoneLast4: phoneLast4.trim(),
          locale: lang,
          turnstileToken,
        }),
      });

      if (!response.ok) {
        setSecurityError(await readErrorMessage(response, c.recoveryError));
        return;
      }

      resetTurnstile();
      setComplete(true);
      setEmail("");
      setPhoneLast4("");
      void trackProductEvent("support_request_submitted", {
        surface,
        request_type: "tracking_recovery",
      });
    } catch {
      setSecurityError(c.recoveryError);
    } finally {
      setBusy(false);
    }
  };

  const flowClassName = cn(
    styles.flow,
    presentation === "page" ? styles.pageFlow : styles.dialogFlow,
    progressData && presentation === "page" ? styles.pageFlowResult : "",
    className,
  );

  if (isRecovering) {
    return (
      <div
        data-bagui="tracking-flow"
        data-liquid-glass={presentation === "page" ? "surface" : undefined}
        className={flowClassName}
      >
        <form
          onSubmit={submitRecovery}
          data-analytics-form="tracking_recovery"
          data-analytics-submit-event="support_request_submitted"
          className={styles.form}
        >
          <div className={styles.flowIcon}>
            <ShieldCheck aria-hidden="true" />
          </div>
          <div className={styles.formHeading}>
            <p className={styles.flowEyebrow}>{isThai ? "กู้คืนการเข้าถึง" : "Recover access"}</p>
            <h2 id="track-request-title">{c.recoveryTitle}</h2>
            <p>{c.recoveryDesc}</p>
          </div>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>{c.registeredEmail}</span>
            <input
              required
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                clearFeedback();
              }}
              autoComplete="email"
              placeholder={c.emailPlaceholder}
              className={styles.input}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>{c.phoneLast4}</span>
            <input
              type="text"
              maxLength={4}
              pattern="[0-9]*"
              inputMode="numeric"
              value={phoneLast4}
              onChange={(event) => {
                setPhoneLast4(event.target.value.replace(/\D/g, ""));
                clearFeedback();
              }}
              placeholder={c.phoneLast4Placeholder}
              className={styles.input}
            />
          </label>

          <FlowFeedback
            complete={complete}
            error={securityError}
            successMessage={c.generic}
          />
          <InvisibleTurnstile
            ref={turnstileRef}
            action="track_request"
            onVerify={handleTurnstileVerify}
          />
          <Button
            type="submit"
            size="lg"
            disabled={busy || !isEmailLike(email) || !securityIsReady}
            className={styles.submitButton}
          >
            {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Mail aria-hidden="true" />}
            {busy ? c.sending : c.sendRecovery}
          </Button>
          <button
            type="button"
            className={styles.textButton}
            onClick={() => {
              setIsRecovering(false);
              clearFeedback();
            }}
          >
            {c.backToTracking}
          </button>
        </form>
      </div>
    );
  }

  if (progressData) {
    const updatedAt = formatUpdatedAt(progressData.updatedAt, lang);

    return (
      <div
        data-bagui="tracking-flow"
        data-liquid-glass={presentation === "page" ? "surface" : undefined}
        className={flowClassName}
      >
        <div className={styles.resultHeader}>
          <div className={styles.resultTitleGroup}>
            <p className={styles.flowEyebrow}>
              <Activity aria-hidden="true" />
              {c.timelineHeader}
            </p>
            <h2 id="track-request-title">
              {getTypeLabel(progressData.type, isThai)}
            </h2>
            <p className={styles.resultReference}>{progressData.reference}</p>
          </div>
          <button type="button" className={styles.resetButton} onClick={resetFlow}>
            <RefreshCw aria-hidden="true" />
            <span>{c.newLookup}</span>
          </button>
        </div>

        <div className={styles.resultProgressCard}>
          <div className={styles.progressHeading}>
            <div>
              <p className={styles.fieldLabel}>{c.currentStep}</p>
              <p className={styles.currentStep}>
                {isThai ? progressData.current_step_th : progressData.current_step}
              </p>
            </div>
            <strong>{progressData.percent}%</strong>
          </div>
          <div
            role="progressbar"
            aria-label={isThai ? "ความคืบหน้าโครงการ" : "Project progress"}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressData.percent}
            className={styles.progressTrack}
          >
            <span style={{ width: `${progressData.percent}%` }} />
          </div>
          <p className={styles.progressDescription}>{c.progressDescription}</p>
        </div>

        <div className={styles.resultGrid}>
          <section className={styles.timelineSection} aria-labelledby="track-timeline-title">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.flowEyebrow}>{isThai ? "เส้นทางโครงการ" : "Project journey"}</p>
                <h3 id="track-timeline-title">{c.timelineHeader}</h3>
              </div>
              {updatedAt ? (
                <p className={styles.updatedAt}>
                  <span>{c.lastUpdated}</span>
                  {updatedAt}
                </p>
              ) : null}
            </div>

            <ol className={styles.timeline}>
              {progressData.steps.map((step) => {
                const isPast = step.status === "completed";
                const isCurrent = step.status === "active";
                const status = statusLabel(step.status, c);

                return (
                  <li
                    key={`${step.label}-${step.labelTh}`}
                    className={cn(
                      styles.timelineItem,
                      isPast && styles.timelineItemCompleted,
                      isCurrent && styles.timelineItemActive,
                    )}
                  >
                    <span className={styles.timelineMarker}>
                      {isPast ? (
                        <CheckCircle2 aria-hidden="true" />
                      ) : isCurrent ? (
                        <Clock aria-hidden="true" />
                      ) : (
                        <Lock aria-hidden="true" />
                      )}
                    </span>
                    <div className={styles.timelineCopy}>
                      <div className={styles.timelineTitleRow}>
                        <h4>{isThai ? step.labelTh : step.label}</h4>
                        <span className={styles.timelineStatus}>{status}</span>
                      </div>
                      {(isThai ? step.descTh : step.desc) ? (
                        <p>{isThai ? step.descTh : step.desc}</p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <aside className={styles.unlockCard}>
            <div className={styles.unlockIcon}>
              <Lock aria-hidden="true" />
            </div>
            <p className={styles.flowEyebrow}>{isThai ? "ข้อมูลส่วนตัว" : "Private details"}</p>
            <h3>{c.unlockTitle}</h3>
            <p>{c.upsellText}</p>
            <div className={styles.detailList}>
              <div>
                <span>{c.customer}</span>
                <strong>{progressData.maskedCustomerName || (isThai ? "ปกปิดเพื่อความเป็นส่วนตัว" : "Masked for privacy")}</strong>
              </div>
              <div>
                <span>{c.systemSize}</span>
                <strong>
                  {progressData.systemSizeKwp
                    ? `${progressData.systemSizeKwp} kWp`
                    : c.notAvailable}
                </strong>
              </div>
            </div>

            <form
              onSubmit={submitMagicLink}
              data-analytics-form="tracking_magic_link_upsell"
              data-analytics-submit-event="support_request_submitted"
              className={styles.unlockForm}
            >
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{c.registeredEmail}</span>
                <input
                  required
                  type="email"
                  value={email}
                  disabled={busy || complete}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    clearFeedback();
                  }}
                  autoComplete="email"
                  placeholder={c.emailPlaceholder}
                  className={styles.input}
                />
              </label>
              <FlowFeedback
                complete={complete}
                error={securityError}
                successMessage={c.generic}
              />
              <InvisibleTurnstile
                ref={turnstileRef}
                action="track_request"
                onVerify={handleTurnstileVerify}
              />
              <Button
                type="submit"
                disabled={busy || !isEmailLike(email) || !securityIsReady || complete}
                className={styles.submitButton}
              >
                {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Mail aria-hidden="true" />}
                {busy ? c.sending : c.send}
              </Button>
            </form>
            <p className={styles.privacyNote}>
              <Info aria-hidden="true" />
              {c.maskedNote}
            </p>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div
      data-bagui="tracking-flow"
      data-liquid-glass={presentation === "page" ? "surface" : undefined}
      className={flowClassName}
    >
      <form
        onSubmit={submit}
        data-analytics-form="tracking_request"
        data-analytics-submit-event="support_request_submitted"
        aria-labelledby="track-request-title"
        className={styles.form}
      >
        <div className={styles.flowIcon}>
          <Search aria-hidden="true" />
        </div>
        <div className={styles.formHeading}>
          <p className={styles.flowEyebrow}>{isThai ? "ตรวจสอบสถานะ" : "Status lookup"}</p>
          <h2 id="track-request-title">{c.title}</h2>
          <p>{c.description}</p>
        </div>

        <div className={cn(styles.field, styles.referenceField)}>
          <div className={styles.fieldLabelRow}>
            <span className={styles.fieldLabel}>{c.query}</span>
            {hasCompleteReference ? (
              <span className={styles.fieldState}>
                <Check aria-hidden="true" />
                {c.referenceReady}
              </span>
            ) : null}
          </div>
          <SegmentedTrackingInput
            id="tracking-reference"
            value={query}
            onChange={(value) => {
              setQuery(value);
              clearFeedback();
            }}
            disabled={busy || complete}
            placeholder={c.referencePlaceholder}
            pasteLabel={c.pasteReference}
            clearLabel={c.clearReference}
            ariaLabel={c.query}
            ariaDescribedBy="tracking-reference-hint"
            ariaInvalid={referenceHasError}
            className={styles.segmentedInput}
          />
          <p
            id="tracking-reference-hint"
            aria-live="polite"
            className={cn(
              styles.fieldHint,
              referenceHasError && styles.fieldHintError,
            )}
          >
            {referenceHasError
              ? c.correctReference
              : c.referenceHint}
          </p>
        </div>

        <button
          type="button"
          className={styles.privateAccessToggle}
          aria-expanded={privateAccessVisible}
          aria-controls="tracking-private-access"
          onClick={() => {
            if (!email.trim()) {
              setShowPrivateAccess((isVisible) => !isVisible);
            }
            clearFeedback();
          }}
        >
          <span className={styles.privateAccessToggleCopy}>
            <Mail aria-hidden="true" />
            <span>
              {privateAccessVisible ? c.privateAccessHide : c.privateAccessToggle}
            </span>
          </span>
          <ChevronDown aria-hidden="true" />
        </button>

        {privateAccessVisible ? (
          <div
            id="tracking-private-access"
            data-bagui="form-section"
            className={styles.privateAccessPanel}
          >
            <p className={styles.privateAccessDescription}>
              {c.privateAccessDescription}
            </p>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{c.email}</span>
              <input
                type="email"
                value={email}
                disabled={busy || complete}
                onChange={(event) => {
                  setEmail(event.target.value);
                  clearFeedback();
                }}
                autoComplete="email"
                placeholder={c.emailPlaceholder}
                aria-invalid={Boolean(email.trim()) && !hasValidEmail}
                aria-describedby="tracking-email-hint"
                className={cn(
                  styles.input,
                  email.trim() && !hasValidEmail && styles.inputError,
                  hasValidEmail && styles.inputValid,
                )}
              />
              <span id="tracking-email-hint" className={styles.fieldHint}>
                {c.emailHint}
              </span>
            </label>
          </div>
        ) : null}

        <FlowFeedback
          complete={complete}
          error={securityError}
          successMessage={c.generic}
        />
        {requiresSecurity ? (
          <InvisibleTurnstile
            ref={turnstileRef}
            action="track_request"
            onVerify={handleTurnstileVerify}
          />
        ) : null}

        <Button
          type="submit"
          size="lg"
          disabled={busy || !canSubmitPrimary}
          className={styles.submitButton}
        >
          {busy ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : complete && email.trim() ? (
            <Check aria-hidden="true" />
          ) : email.trim() ? (
            <Mail aria-hidden="true" />
          ) : (
            <Search aria-hidden="true" />
          )}
          {busy
            ? email.trim()
              ? isThai
                ? "กำลังส่ง…"
                : "Sending…"
              : c.sending
            : complete && email.trim()
              ? isThai
                ? "ส่งลิงก์แล้ว"
                : "Link sent"
              : email.trim()
                ? c.send
                : c.submit}
        </Button>

        <div className={styles.formFooter}>
          <button
            type="button"
            className={styles.textButton}
            onClick={() => {
              setIsRecovering(true);
              clearFeedback();
            }}
          >
            {c.requestRecovery}
          </button>
          <p className={styles.privacyNote}>
            <Lock aria-hidden="true" />
            {c.privacy}
          </p>
        </div>
      </form>
    </div>
  );
}

function FlowFeedback({
  complete,
  error,
  successMessage,
}: Readonly<{
  complete: boolean;
  error: string;
  successMessage: string;
}>) {
  return (
    <>
      {complete ? (
        <p role="status" aria-live="polite" className={styles.successMessage}>
          <CheckCircle2 aria-hidden="true" />
          {successMessage}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className={styles.errorMessage}>
          {error}
        </p>
      ) : null}
    </>
  );
}
