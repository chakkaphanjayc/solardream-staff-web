"use client";

import Link from "next/link";
import { FormEvent, useId, useState } from "react";
import { FiArrowUpRight, FiInfo, FiLoader, FiMapPin, FiSearch } from "react-icons/fi";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSolarHome } from "../solar-home-context";
import {
  SOLAR_SIZE_MAX_KWP,
  SOLAR_SIZE_MIN_KWP,
  SOLAR_SIZE_QUICK_PICKS,
  SOLAR_SIZE_STEP_KWP,
} from "../solar-estimates";
import styles from "./home-landing.module.css";

type HomeEstimatorProps = Readonly<{
  locale: string;
}>;

function formatNumber(value: number, locale: string, maximumFractionDigits = 0) {
  return new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US", {
    maximumFractionDigits,
  }).format(value);
}

export function HomeEstimator({ locale }: HomeEstimatorProps) {
  const t = useTranslations("HomeLanding");
  const locationInputId = useId();
  const {
    estimate,
    location,
    solarSizeKwp,
    setSolarSizeKwp,
    isLocating,
    isSearching,
    locationError,
    searchResults,
    requestCurrentLocation,
    searchLocation,
    selectLocation,
    clearSearchResults,
  } = useSolarHome();
  const [query, setQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void searchLocation(query);
  };

  const handleSelectLocation = async (result: (typeof searchResults)[number]) => {
    await selectLocation(result);
    setQuery("");
    setShowSearch(false);
  };

  return (
    <section id="simulator" className={styles.estimatorSection} aria-labelledby="estimator-title">
      <div className={styles.estimatorCard}>
        <div className={styles.estimatorHeader}>
          <div>
            <p className={styles.eyebrow}>{t("estimator.eyebrow")}</p>
            <h2 id="estimator-title">{t("estimator.title")}</h2>
          </div>
          <p>{t("estimator.description")}</p>
        </div>

        <div className={styles.estimatorGrid}>
          <div className={styles.controlColumn}>
            <div className={styles.locationBlock}>
              <span className={styles.fieldLabel}>{t("estimator.locationLabel")}</span>
              <div className={styles.locationValue}>
                <FiMapPin aria-hidden="true" />
                <div>
                  <strong>{location.label}</strong>
                  <small>
                    {t("estimator.selectedPrefix")} · {location.detail}
                  </small>
                </div>
              </div>

              <div className={styles.locationActions}>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={requestCurrentLocation}
                  disabled={isLocating}
                >
                  {isLocating ? <FiLoader className="animate-spin" aria-hidden="true" /> : <FiMapPin aria-hidden="true" />}
                  {isLocating ? t("estimator.findingLocation") : t("estimator.useLocation")}
                </Button>
                <button
                  type="button"
                  className={styles.textAction}
                  onClick={() => {
                    setShowSearch((current) => !current);
                    clearSearchResults();
                  }}
                  aria-expanded={showSearch}
                  aria-controls={`${locationInputId}-search`}
                >
                  <FiSearch aria-hidden="true" /> {t("estimator.searchButton")}
                </button>
              </div>

              {showSearch ? (
                <form
                  id={`${locationInputId}-search`}
                  className={styles.locationSearch}
                  onSubmit={submitSearch}
                >
                  <label htmlFor={locationInputId} className="sr-only">
                    {t("estimator.searchLabel")}
                  </label>
                  <Input
                    id={locationInputId}
                    type="search"
                    variant="pill"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      clearSearchResults();
                    }}
                    placeholder={t("estimator.searchPlaceholder")}
                    autoComplete="off"
                  />
                  <button
                    type="submit"
                    aria-label={t("estimator.searchButton")}
                    disabled={isSearching}
                  >
                    {isSearching ? <FiLoader className="animate-spin" aria-hidden="true" /> : <FiSearch aria-hidden="true" />}
                  </button>
                </form>
              ) : null}

              {searchResults.length > 0 ? (
                <div className={styles.locationResults} role="listbox" aria-label={t("estimator.searchLabel")}>
                  {searchResults.map((result) => (
                    <button
                      type="button"
                      key={`${result.latitude}:${result.longitude}:${result.displayName}`}
                      className={styles.locationResultButton}
                      onClick={() => void handleSelectLocation(result)}
                    >
                      {result.displayName}
                    </button>
                  ))}
                </div>
              ) : null}

              {locationError ? (
                <p className={styles.errorMessage} role="status">
                  <FiInfo aria-hidden="true" /> {locationError}
                </p>
              ) : null}
            </div>

            <div className={styles.sizeBlock}>
              <div className={styles.sizeLabelRow}>
                <span className={styles.fieldLabel}>{t("estimator.sizeLabel")}</span>
                <span className={styles.sizeValue}>{formatNumber(solarSizeKwp, locale, 1)} kWp</span>
              </div>
              <p className={styles.sizeDescription}>{t("estimator.sizeDescription")}</p>
              <label htmlFor="solar-size-range" className="sr-only">
                {t("estimator.sizeLabel")}
              </label>
              <input
                id="solar-size-range"
                className={styles.range}
                type="range"
                min={SOLAR_SIZE_MIN_KWP}
                max={SOLAR_SIZE_MAX_KWP}
                step={SOLAR_SIZE_STEP_KWP}
                value={solarSizeKwp}
                onChange={(event) => setSolarSizeKwp(Number(event.target.value))}
              />
              <p className={styles.quickLabel}>{t("estimator.quickLabel")}</p>
              <div className={styles.quickPicks} role="group" aria-label={t("estimator.quickLabel")}>
                {SOLAR_SIZE_QUICK_PICKS.map((size) => (
                  <button
                    type="button"
                    key={size}
                    className={`${styles.quickPick} ${solarSizeKwp === size ? styles.quickPickActive : ""}`}
                    onClick={() => setSolarSizeKwp(size)}
                    aria-pressed={solarSizeKwp === size}
                  >
                    {formatNumber(size, locale, 1)} kWp
                  </button>
                ))}
              </div>
              <div className={styles.panelCount}>
                <span>{t("estimator.panels")}</span>
                <strong>{formatNumber(estimate.panelCount, locale)}</strong>
              </div>
              <Link href={`/${locale}/build?kw=${solarSizeKwp}`} className={styles.advancedLink}>
                {t("estimator.advanced")}
                <FiArrowUpRight aria-hidden="true" />
              </Link>
            </div>
          </div>

          <div className={styles.resultColumn} aria-live="polite">
            <div className={styles.resultHeader}>
              <h3>{t("estimator.resultsLabel")}</h3>
              <span>{formatNumber(estimate.typicalSunHours, locale, 1)} {t("estimator.sunHours")}</span>
            </div>
            <div className={styles.resultGrid}>
              <div className={styles.resultCard}>
                <span className={styles.resultValue}>{formatNumber(estimate.dailyKwh, locale, 1)}</span>
                <span className={styles.resultLabel}>{t("estimator.generatedToday")} · kWh</span>
              </div>
              <div className={styles.resultCard}>
                <span className={styles.resultValue}>{formatNumber(estimate.monthlyKwh, locale)}</span>
                <span className={styles.resultLabel}>{t("estimator.generatedMonthly")} · kWh</span>
              </div>
              <div className={styles.resultCard}>
                <span className={styles.resultValue}>{formatNumber(estimate.annualKwh, locale)}</span>
                <span className={styles.resultLabel}>{t("estimator.generatedAnnual")} · kWh</span>
              </div>
              <div className={styles.resultCard}>
                <span className={styles.resultValue}>฿{formatNumber(estimate.monthlySavingsThb, locale)}</span>
                <span className={styles.resultLabel}>{t("estimator.monthlySaving")}</span>
              </div>
              <div className={styles.resultCard}>
                <span className={styles.resultValue}>{formatNumber(estimate.avoidedCo2Tons, locale, 1)} t</span>
                <span className={styles.resultLabel}>{t("estimator.co2")}</span>
              </div>
            </div>
            <p className={styles.estimateNote}>
              <FiInfo aria-hidden="true" />
              <span>
                <strong>{t("estimator.firstEstimate")}: </strong>
                {t("estimator.note")}
              </span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
