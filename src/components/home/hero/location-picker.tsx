"use client";

import { FormEvent, useState } from "react";
import {
  FiCheck,
  FiLoader,
  FiMapPin,
  FiSearch,
} from "react-icons/fi";
import { useSolarHome } from "../solar-home-context";
import styles from "../solar-home.module.css";

type LocationPickerProps = Readonly<{
  locale: string;
}>;

export default function LocationPicker({ locale }: LocationPickerProps) {
  const isThai = locale === "th";
  const {
    location,
    isLocating,
    isSearching,
    locationError,
    searchResults,
    requestCurrentLocation,
    searchLocation,
    selectLocation,
  } = useSolarHome();
  const [query, setQuery] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void searchLocation(query);
  };

  return (
    <div className={styles.locationPicker}>
      <div className={styles.locationHeading}>
        <div>
          <p className={styles.fieldLabel}>{isThai ? "พื้นที่ของบ้านคุณ" : "Your home area"}</p>
          <p className={styles.locationCurrent}>
            <FiMapPin aria-hidden="true" />
            <span>{location.label}</span>
          </p>
          <p className={styles.locationDetail}>{location.detail}</p>
        </div>
        <span className={styles.locationConfirmed} aria-label={isThai ? "เลือกพื้นที่แล้ว" : "Location selected"}>
          <FiCheck aria-hidden="true" />
        </span>
      </div>

      <div className={styles.locationControls}>
        <button
          type="button"
          className={styles.locationButton}
          onClick={requestCurrentLocation}
          disabled={isLocating}
          aria-busy={isLocating}
        >
          {isLocating ? <FiLoader className={styles.spin} aria-hidden="true" /> : <FiMapPin aria-hidden="true" />}
          <span>{isLocating ? (isThai ? "กำลังค้นหา..." : "Finding you...") : (isThai ? "ใช้ตำแหน่งปัจจุบัน" : "Use current location")}</span>
        </button>

        <form className={styles.locationSearch} onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor="solar-location-search">
            {isThai ? "ค้นหาจังหวัดหรือพื้นที่" : "Search for a province or area"}
          </label>
          <FiSearch aria-hidden="true" />
          <input
            id="solar-location-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={isThai ? "หรือค้นหาจังหวัด / พื้นที่" : "Or search a province / area"}
            autoComplete="street-address"
          />
          <button type="submit" aria-label={isThai ? "ค้นหาพื้นที่" : "Search locations"} disabled={isSearching}>
            {isSearching ? <FiLoader className={styles.spin} aria-hidden="true" /> : <FiSearch aria-hidden="true" />}
          </button>
        </form>
      </div>

      {searchResults.length > 0 ? (
        <ul className={styles.locationResults} aria-label={isThai ? "ผลการค้นหาพื้นที่" : "Location search results"}>
          {searchResults.map((result) => (
            <li key={`${result.latitude}:${result.longitude}`}>
              <button type="button" onClick={() => void selectLocation(result)}>
                <FiMapPin aria-hidden="true" />
                <span>{result.displayName}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {locationError ? (
        <p className={styles.locationError} role="status" aria-live="polite">
          {locationError}
        </p>
      ) : null}
    </div>
  );
}
