"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { MapPin } from "@/components/ui/icons";
import { GsapSpinner } from "@/components/ui/GsapMotion";

type ThaiAddressMatch = {
  postalCode: string;
  province: string;
  district: string;
  subdistrict: string;
  provinceCode: string;
  districtCode: string;
  subdistrictCode: string;
};

interface ThaiPostalAddressFieldsProps {
  postalCode: string;
  province: string;
  district: string;
  subdistrict: string;
  addressDetails: string;
  onPostalCodeChange: (value: string) => void;
  onProvinceChange: (value: string) => void;
  onDistrictChange: (value: string) => void;
  onSubdistrictChange: (value: string) => void;
  onAddressDetailsChange: (value: string) => void;
  inputClassName: string;
  labelClassName: string;
}

export default function ThaiPostalAddressFields({
  postalCode,
  province,
  district,
  subdistrict,
  addressDetails,
  onPostalCodeChange,
  onProvinceChange,
  onDistrictChange,
  onSubdistrictChange,
  onAddressDetailsChange,
  inputClassName,
  labelClassName,
}: ThaiPostalAddressFieldsProps) {
  const t = useTranslations("ThaiPostalAddressFields");
  const addressDetailsRef = useRef<HTMLTextAreaElement | null>(null);
  const [matches, setMatches] = useState<ThaiAddressMatch[]>([]);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState("");

  const sanitizedPostalCode = useMemo(
    () => postalCode.replace(/\D/g, "").slice(0, 5),
    [postalCode],
  );
  const hasValidPostalCode = sanitizedPostalCode.length === 5;
  const visibleMatches = hasValidPostalCode ? matches : [];
  const hasMultipleSubdistricts = visibleMatches.length > 1;
  const showLookupLoading = hasValidPostalCode && isLookingUp;

  useEffect(() => {
    if (postalCode !== sanitizedPostalCode) {
      onPostalCodeChange(sanitizedPostalCode);
      return;
    }

    if (sanitizedPostalCode.length !== 5) {
      onProvinceChange("");
      onDistrictChange("");
      onSubdistrictChange("");
      return;
    }

    const controller = new AbortController();

    const lookup = async () => {
      setIsLookingUp(true);
      setLookupError("");
      try {
        const response = await fetch(
          `/api/thai-address/lookup?postalCode=${encodeURIComponent(sanitizedPostalCode)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(`Lookup failed with status ${response.status}`);
        }

        const payload = (await response.json()) as {
          matches?: ThaiAddressMatch[];
        };
        const nextMatches = Array.isArray(payload.matches)
          ? payload.matches
          : [];
        setMatches(nextMatches);

        if (nextMatches.length === 0) {
          onProvinceChange("");
          onDistrictChange("");
          onSubdistrictChange("");
          setLookupError(t("errors.notFound"));
          return;
        }

        const selected =
          nextMatches.find((entry) => entry.subdistrict === subdistrict) ??
          nextMatches[0];

        onProvinceChange(selected.province);
        onDistrictChange(selected.district);
        onSubdistrictChange(selected.subdistrict);

        if (nextMatches.length === 1) {
          requestAnimationFrame(() => addressDetailsRef.current?.focus());
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("[ThaiPostalAddressFields] lookup failed:", error);
          setLookupError(t("errors.lookupFailed"));
          setMatches([]);
          onProvinceChange("");
          onDistrictChange("");
          onSubdistrictChange("");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLookingUp(false);
        }
      }
    };

    void lookup();

    return () => controller.abort();
    // Parent setters may be inline because this component is used by several forms.
    // The lookup itself should run only when the postal code or selected subdistrict changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postalCode, sanitizedPostalCode, subdistrict]);

  const handleSubdistrictSelect = (value: string) => {
    const selected = visibleMatches.find((entry) => entry.subdistrict === value);
    if (!selected) return;
    onProvinceChange(selected.province);
    onDistrictChange(selected.district);
    onSubdistrictChange(selected.subdistrict);
    requestAnimationFrame(() => addressDetailsRef.current?.focus());
  };

  return (
    <div className="space-y-3 rounded-2xl bg-slate-50/50 p-3 ring-1 ring-white/70">
      <div className="space-y-1.5">
        <label className={labelClassName}>
          <MapPin className="h-3.5 w-3.5 text-slate-400" />
          {t("postalCode.label")}
          <span className="text-rose-500 ml-0.5">*</span>
        </label>
        <input
          type="text"
          inputMode="numeric"
          required
          placeholder={t("postalCode.placeholder")}
          value={postalCode}
          onChange={(event) => onPostalCodeChange(event.target.value)}
          maxLength={5}
          className={inputClassName}
          autoComplete="postal-code"
        />
        {showLookupLoading && (
          <p className="flex items-center gap-2 text-[10px] font-semibold text-slate-500">
            <GsapSpinner className="h-3 w-3" />
            {t("postalCode.lookupLoading")}
          </p>
        )}
        {hasValidPostalCode && visibleMatches.length === 0 && !showLookupLoading && (
          <p className="text-[10px] font-semibold text-amber-600">
            {lookupError ||
              t("errors.notFoundHint")}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <ReadonlyField
          label={t("province.label")}
          value={province}
          inputClassName={inputClassName}
          placeholder={t("readonlyPlaceholder")}
        />
        <ReadonlyField
          label={t("district.label")}
          value={district}
          inputClassName={inputClassName}
          placeholder={t("readonlyPlaceholder")}
        />
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">
            {t("subdistrict.label")}
          </label>
          {hasMultipleSubdistricts ? (
            <select
              required
              value={subdistrict}
              onChange={(event) => handleSubdistrictSelect(event.target.value)}
              className={inputClassName}
            >
              {visibleMatches.map((entry) => (
                <option
                  key={`${entry.postalCode}-${entry.districtCode}-${entry.subdistrictCode}`}
                  value={entry.subdistrict}
                >
                  {entry.subdistrict}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              required
              readOnly
              value={subdistrict}
              placeholder={t("readonlyPlaceholder")}
              className={`${inputClassName} cursor-not-allowed text-slate-500`}
            />
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className={labelClassName}>
          {t("addressDetails.label")}
          <span className="text-rose-500 ml-0.5">*</span>
        </label>
        <textarea
          ref={addressDetailsRef}
          required
          rows={3}
          placeholder={t("addressDetails.placeholder")}
          value={addressDetails}
          onChange={(event) => onAddressDetailsChange(event.target.value)}
          className={`${inputClassName} min-h-[84px] resize-y leading-6`}
          autoComplete="street-address"
        />
      </div>
    </div>
  );
}

function ReadonlyField({
  label,
  value,
  inputClassName,
  placeholder,
}: {
  label: string;
  value: string;
  inputClassName: string;
  placeholder: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">
        {label}
      </label>
      <input
        type="text"
        required
        readOnly
        value={value}
        placeholder={placeholder}
        className={`${inputClassName} cursor-not-allowed text-slate-500`}
      />
    </div>
  );
}
