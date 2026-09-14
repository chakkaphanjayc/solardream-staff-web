"use client";

import Image from "next/image";
import { useId, useState } from "react";

import styles from "./solar-editorial-home.module.css";

const BEFORE_IMAGE = "/asset/home-editorial/roof-before.webp";
const AFTER_IMAGE = "/asset/home-editorial/roof-detail.webp";

export type EditorialBeforeAfterLabels = Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  before: string;
  after: string;
  beforeAlt: string;
  afterAlt: string;
  sliderLabel: string;
}>;

type EditorialBeforeAfterProps = Readonly<{
  labels: EditorialBeforeAfterLabels;
}>;

export default function EditorialBeforeAfter({ labels }: EditorialBeforeAfterProps) {
  const sliderId = useId();
  const [position, setPosition] = useState(52);

  return (
    <section className={styles.beforeAfter} aria-labelledby="before-after-title">
      <div className={styles.beforeAfterIntro}>
        <p className={styles.sectionMarker}>{labels.eyebrow}</p>
        <h2 id="before-after-title">{labels.title}</h2>
        <p>{labels.description}</p>
      </div>
      <div className={styles.beforeAfterStage}>
        <Image
          src={BEFORE_IMAGE}
          alt={labels.beforeAlt}
          fill
          sizes="(max-width: 900px) 100vw, 68vw"
          className={styles.beforeAfterImage}
        />
        <div className={styles.beforeAfterAfter} style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
          <Image
            src={AFTER_IMAGE}
            alt={labels.afterAlt}
            fill
            sizes="(max-width: 900px) 100vw, 68vw"
            className={styles.beforeAfterImage}
          />
        </div>
        <div className={styles.beforeAfterDivider} style={{ left: `${position}%` }} aria-hidden="true">
          <span />
        </div>
        <div className={styles.beforeAfterLabels} aria-hidden="true">
          <span>{labels.before}</span>
          <span>{labels.after}</span>
        </div>
        <label className="sr-only" htmlFor={sliderId}>{labels.sliderLabel}</label>
        <input
          id={sliderId}
          className={styles.beforeAfterRange}
          type="range"
          min="0"
          max="100"
          step="1"
          value={position}
          onChange={(event) => setPosition(Number(event.target.value))}
          aria-valuetext={`${position}%`}
        />
      </div>
    </section>
  );
}
