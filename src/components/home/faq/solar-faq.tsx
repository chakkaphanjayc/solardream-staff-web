"use client";

import Link from "next/link";
import { FiArrowUpRight, FiCheckCircle } from "react-icons/fi";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Reveal } from "../solar-motion";
import styles from "../solar-home.module.css";

type SolarFAQProps = Readonly<{
  locale: string;
}>;

type FAQItem = Readonly<{
  question: string;
  answer: string;
}>;

export default function SolarFAQ({ locale }: SolarFAQProps) {
  const isThai = locale === "th";
  const faqItems: readonly FAQItem[] = isThai
    ? [
        {
          question: "ต้องเตรียมข้อมูลอะไรเพื่อเริ่มประเมิน?",
          answer:
            "เริ่มจากตำแหน่งบ้านและขนาดระบบเบื้องต้นได้เลย ระบบจะคำนวณศักยภาพจากแสงแดดเฉลี่ยของพื้นที่ให้ดูก่อน แล้วค่อยเติมข้อมูลการใช้ไฟเมื่อคุณพร้อม",
        },
        {
          question: "ตัวเลขที่เห็นเป็นราคาจริงหรือไม่?",
          answer:
            "ตัวเลขในหน้านี้เป็นประมาณการเบื้องต้นจากขนาดระบบและแสงแดดเฉลี่ย ทีมวิศวกรจะตรวจสอบหลังคา อุปกรณ์ และรูปแบบการใช้ไฟก่อนจัดทำข้อเสนอจริง",
        },
        {
          question: "ต้องมีใบค่าไฟก่อนเริ่มหรือไม่?",
          answer:
            "ไม่จำเป็นสำหรับการดูศักยภาพเบื้องต้น หากมีใบค่าไฟอยู่แล้ว การแชร์ข้อมูลในขั้นตอนถัดไปจะช่วยให้เราออกแบบระบบได้ตรงกับบ้านของคุณมากขึ้น",
        },
        {
          question: "เลือกขนาดระบบด้วยตัวเองได้ไหม?",
          answer:
            "ได้ คุณสามารถเลื่อนตัวเลือกขนาดระบบหรือเลือกค่าที่ใช้บ่อยเพื่อดูผลลัพธ์ที่เปลี่ยนไปทันที จากนั้นคุยกับทีมงานเพื่อปรับให้เหมาะกับหลังคาและการใช้ไฟจริง",
        },
        {
          question: "หลังจากประเมินแล้วต้องทำอะไรต่อ?",
          answer:
            "คุณเลือกเริ่มจากแบบประเมินหรือคุยกับผู้เชี่ยวชาญได้ ทีมงานจะช่วยทบทวนข้อมูล นัดหมายสำรวจหน้างาน และอธิบายขั้นตอนก่อนตัดสินใจติดตั้ง",
        },
      ]
    : [
        {
          question: "What do I need to start an estimate?",
          answer:
            "Start with your home's location and an initial system size. SolarDream uses the area's average sunlight to show a first estimate, then you can add usage details when you are ready.",
        },
        {
          question: "Are these numbers a final quote?",
          answer:
            "They are an early estimate based on system size and average sunlight. An engineer reviews the roof, equipment, and household usage before preparing an official proposal.",
        },
        {
          question: "Do I need an electricity bill first?",
          answer:
            "No. You can explore your home's potential first. If you have a bill, sharing it in the next step helps us shape the system around your real usage.",
        },
        {
          question: "Can I choose the system size myself?",
          answer:
            "Yes. Move the system slider or choose a common size to see the estimate update immediately, then review the choice with our team against your roof and usage.",
        },
        {
          question: "What happens after the estimate?",
          answer:
            "You can continue with the design flow or speak with a specialist. We review the information, arrange a site assessment, and explain the next step before you commit.",
        },
      ];

  return (
    <section
      id="faq"
      className={`${styles.sectionShell} ${styles.faqSection}`}
      aria-labelledby="faq-title"
    >
      <div className={styles.contentWidth}>
        <div className={styles.faqGrid}>
          <Reveal className={styles.faqIntro}>
            <p className={styles.sectionKicker}>
              {isThai ? "คำถามที่พบบ่อย" : "Good questions"}
            </p>
            <h2 id="faq-title" className={styles.sectionTitle}>
              {isThai ? "เริ่มต้นอย่างมั่นใจ" : "Start with a clear picture."}
            </h2>
            <p className={styles.sectionDescription}>
              {isThai
                ? "คำตอบสั้น ๆ สำหรับขั้นตอนที่คนมักอยากรู้ก่อนเริ่มออกแบบโซลาร์"
                : "A few clear answers before you begin shaping solar for your home."}
            </p>

            <ul className={styles.faqTrustList}>
              <li className={styles.faqTrustItem}>
                <FiCheckCircle aria-hidden="true" />
                <span>
                  {isThai
                    ? "เริ่มจากข้อมูลพื้นฐานของบ้านได้"
                    : "Start with the basics of your home"}
                </span>
              </li>
              <li className={styles.faqTrustItem}>
                <FiCheckCircle aria-hidden="true" />
                <span>
                  {isThai
                    ? "มีทีมวิศวกรช่วยตรวจสอบก่อนเสนอราคา"
                    : "An engineer reviews before a proposal"}
                </span>
              </li>
              <li className={styles.faqTrustItem}>
                <FiCheckCircle aria-hidden="true" />
                <span>
                  {isThai
                    ? "ยังไม่ต้องตัดสินใจในขั้นตอนแรก"
                    : "No commitment at the first step"}
                </span>
              </li>
            </ul>

            <Link href={`/${locale}/wizard`} className={styles.faqAction}>
              <span>
                {isThai ? "คุยกับผู้เชี่ยวชาญ" : "Talk to a specialist"}
              </span>
              <FiArrowUpRight aria-hidden="true" />
            </Link>
          </Reveal>

          <Reveal
            className={styles.faqList}
            transition={{ duration: 0.8, delay: 0.08 }}
          >
            <Accordion
              type="single"
              collapsible
              defaultValue="faq-0"
              className={styles.faqAccordion}
            >
              {faqItems.map((item, index) => (
                <AccordionItem
                  value={`faq-${index}`}
                  key={item.question}
                  className={styles.faqItem}
                >
                  <AccordionTrigger className={styles.faqTrigger}>
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className={styles.faqContent}>
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
