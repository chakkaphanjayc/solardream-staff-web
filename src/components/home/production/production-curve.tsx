"use client";

import { useRef } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { FiClock, FiSun } from "react-icons/fi";
import { Reveal } from "../solar-motion";
import { useSolarHome } from "../solar-home-context";
import styles from "../solar-home.module.css";

type ProductionCurveProps = Readonly<{
  locale: string;
}>;

export default function ProductionCurve({ locale }: ProductionCurveProps) {
  const isThai = locale === "th";
  const sectionRef = useRef<HTMLElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const { estimate } = useSolarHome();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  const smoothedProgress = useSpring(scrollYProgress, {
    stiffness: 110,
    damping: 26,
    mass: 0.6,
  });
  const markerProgress = prefersReducedMotion ? scrollYProgress : smoothedProgress;
  const markerLeft = useTransform(
    markerProgress,
    [0, 0.25, 0.5, 0.75, 1],
    ["4%", "25%", "50%", "75%", "96%"],
  );
  const markerTop = useTransform(
    markerProgress,
    [0, 0.25, 0.5, 0.75, 1],
    ["87%", "48%", "15%", "40%", "87%"],
  );

  return (
    <section ref={sectionRef} id="learn" className={`${styles.sectionShell} ${styles.curveSection}`} aria-labelledby="production-curve-title">
      <div className={styles.contentWidth}>
        <div className={styles.curveGrid}>
          <Reveal className={styles.curveCopy}>
            <p className={styles.sectionKicker}>{isThai ? "แสงแดดตลอดวัน" : "The shape of a day"}</p>
            <h2 id="production-curve-title" className={styles.sectionTitle}>
              {isThai ? "พลังงานค่อย ๆ เติบโตไปพร้อมกับวันของคุณ" : "Energy follows the gentle rhythm of the day."}
            </h2>
            <p className={styles.sectionDescription}>
              {isThai
                ? `ระบบ ${estimate.solarSizeKwp} kWp จะเริ่มรับแสงตั้งแต่เช้า ผลิตได้สูงสุดช่วงเที่ยง และค่อย ๆ ส่งต่อพลังงานกลับบ้านจนถึงเย็น`
                : `A ${estimate.solarSizeKwp} kWp system wakes with the morning, reaches its natural peak at noon, then softens into the evening.`}
            </p>
          </Reveal>

          <Reveal className={styles.curveAside} transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}>
            <div className={styles.curveCard}>
              <div className={styles.curvePlot}>
                <svg className={styles.curveSvg} viewBox="0 0 640 210" role="img" aria-label={isThai ? "เส้นโค้งการผลิตไฟฟ้าจากหกโมงเช้าถึงหกโมงเย็น" : "Solar production curve from 06:00 to 18:00"}>
                  <defs>
                    <linearGradient id="solar-curve-fill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0" stopColor="#B7D1EA" stopOpacity="0.32" />
                      <stop offset="1" stopColor="#DCE8F5" stopOpacity="0.04" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M24 180 C92 177 116 116 175 93 S270 25 334 26 S435 59 492 100 S580 171 640 180 L640 200 L24 200 Z"
                    fill="url(#solar-curve-fill)"
                  />
                  <motion.path
                    suppressHydrationWarning
                    d="M24 180 C92 177 116 116 175 93 S270 25 334 26 S435 59 492 100 S580 171 640 180"
                    fill="none"
                    stroke="#B7D1EA"
                    strokeLinecap="round"
                    strokeWidth="4"
                    initial={prefersReducedMotion ? { pathLength: 1 } : { pathLength: 0 }}
                    whileInView={{ pathLength: 1 }}
                    viewport={{ once: true, amount: 0.5 }}
                    transition={prefersReducedMotion ? { duration: 0 } : { duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
                  />
                </svg>

                <motion.div className={styles.curveMarker} style={{ left: markerLeft, top: markerTop }}>
                  <span className={styles.curveMarkerDot} />
                  <span className={styles.curveMarkerLabel}>
                    <FiSun aria-hidden="true" />
                    {isThai ? "พลังงานกำลังไหล" : "Energy flowing"}
                  </span>
                </motion.div>

                <div className={styles.curveAxis} aria-hidden="true">
                  <span>06:00</span>
                  <span>09:00</span>
                  <span>12:00</span>
                  <span>15:00</span>
                  <span>18:00</span>
                </div>
              </div>
            </div>
            <p className={styles.curveNote}>
              <FiClock aria-hidden="true" />
              {isThai
                ? "จุดบนเส้นจะเคลื่อนตามการเลื่อนหน้าจอ เพื่อให้เห็นช่วงเวลาที่พลังงานกำลังเกิดขึ้น"
                : "Follow the marker as you scroll to see where your home meets the sun."}
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
