"use client";

import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useSpring } from "motion/react";
import { Reveal } from "../solar-motion";
import styles from "../solar-home.module.css";

type SolarJourneyProps = Readonly<{
  locale: string;
}>;

export default function SolarJourney({ locale }: SolarJourneyProps) {
  const isThai = locale === "th";
  const sectionRef = useRef<HTMLElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start 78%", "end 35%"],
  });
  const progress = useSpring(scrollYProgress, {
    stiffness: 95,
    damping: 25,
    mass: 0.6,
  });
  const steps = [
    {
      number: "01",
      title: isThai ? "วิเคราะห์ศักยภาพ" : "Map your potential",
      description: isThai ? "ดูแสงแดดและจังหวะการใช้ไฟของบ้าน" : "Read the sun and the way your home uses power.",
    },
    {
      number: "02",
      title: isThai ? "ออกแบบระบบ" : "Shape the system",
      description: isThai ? "เลือกขนาดและอุปกรณ์ให้เข้ากับหลังคา" : "Choose a size and equipment for your roof.",
    },
    {
      number: "03",
      title: isThai ? "รับข้อเสนอจากวิศวกร" : "Review the proposal",
      description: isThai ? "พูดคุยกับวิศวกรก่อนตัดสินใจ" : "Talk through the details with an engineer.",
    },
    {
      number: "04",
      title: isThai ? "ติดตั้ง" : "Install with care",
      description: isThai ? "ทีมช่างดูแลการติดตั้งให้เรียบร้อย" : "Our installation team brings it to life.",
    },
    {
      number: "05",
      title: isThai ? "เริ่มสร้างพลังงาน" : "Make your own energy",
      description: isThai ? "ติดตามผลลัพธ์ของบ้านคุณได้ทุกวัน" : "See the difference from the first sunny day.",
    },
  ] as const;

  return (
    <section ref={sectionRef} id="journey" className={`${styles.sectionShell} ${styles.journeySection}`} aria-labelledby="journey-title">
      <div className={styles.contentWidth}>
        <Reveal className={styles.journeyHeader}>
          <div>
            <p className={styles.sectionKicker}>{isThai ? "จากแสงแดดสู่บ้านของคุณ" : "From sunlight to home"}</p>
            <h2 id="journey-title" className={styles.sectionTitle}>
              {isThai ? "เส้นทางที่ชัดเจน ตั้งแต่วันแรก" : "A clear path from first light."}
            </h2>
          </div>
          <p className={styles.sectionDescription}>
            {isThai
              ? "ทุกขั้นตอนออกแบบให้เข้าใจง่าย และมีคนดูแลเมื่อคุณต้องการคำตอบ"
              : "Each step stays understandable, with a real person ready when you need an answer."}
          </p>
        </Reveal>

        <div className={styles.journeyTrack}>
          <div className={styles.journeyLine} aria-hidden="true">
            <motion.span
              suppressHydrationWarning
              className={`${styles.journeyLineFill} ${styles.journeyLineFillDesktop}`}
              style={{ scaleX: prefersReducedMotion ? 1 : progress }}
            />
            <motion.span
              suppressHydrationWarning
              className={`${styles.journeyLineFill} ${styles.journeyLineFillMobile}`}
              style={{ scaleY: prefersReducedMotion ? 1 : progress }}
            />
          </div>
          <ol className={styles.journeyGrid}>
            {steps.map((step, index) => (
              <motion.li
                suppressHydrationWarning
                className={styles.journeyItem}
                key={step.number}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.55, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
              >
                <span className={styles.journeyNumber}>{step.number}</span>
                <h3 className={styles.journeyItemTitle}>{step.title}</h3>
                <p className={styles.journeyItemText}>{step.description}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
