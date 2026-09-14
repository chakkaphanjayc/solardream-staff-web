"use client";

import Link from "next/link";
import { FiArrowUpRight, FiCheckCircle } from "react-icons/fi";
import { useTranslations } from "next-intl";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import styles from "./home-landing.module.css";

type HomeFaqProps = Readonly<{
  locale: string;
}>;

const FAQ_KEYS = ["estimate", "quote", "bill", "size", "next", "accuracy"] as const;

export function HomeFaq({ locale }: HomeFaqProps) {
  const t = useTranslations("HomeLanding");

  return (
    <section id="faq" className={`${styles.section} ${styles.faqSection}`} aria-labelledby="faq-title">
      <div className={`${styles.container} ${styles.faqGrid}`}>
        <div className={styles.faqIntro}>
          <p className={styles.eyebrow}>{t("faq.eyebrow")}</p>
          <h2 id="faq-title" className={styles.sectionTitle}>{t("faq.title")}</h2>
          <p className={styles.sectionDescription}>{t("faq.description")}</p>
          <ul className={styles.faqTrustList}>
            <li className={styles.faqTrust}><FiCheckCircle aria-hidden="true" /> {t("faq.trustOne")}</li>
            <li className={styles.faqTrust}><FiCheckCircle aria-hidden="true" /> {t("faq.trustTwo")}</li>
            <li className={styles.faqTrust}><FiCheckCircle aria-hidden="true" /> {t("faq.trustThree")}</li>
          </ul>
          <Link href={`/${locale}/contact`} className={styles.faqAction}>
            {t("faq.action")} <FiArrowUpRight aria-hidden="true" />
          </Link>
        </div>

        <div className={styles.faqList}>
          <Accordion type="single" collapsible>
            {FAQ_KEYS.map((key, index) => (
              <AccordionItem value={key} key={key}>
                <AccordionTrigger>
                  <span className="mr-2 text-xs font-extrabold tracking-[0.1em] text-[#3E6685]">{String(index + 1).padStart(2, "0")}</span>
                  {t(`faq.items.${key}.question`)}
                </AccordionTrigger>
                <AccordionContent>{t(`faq.items.${key}.answer`)}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
