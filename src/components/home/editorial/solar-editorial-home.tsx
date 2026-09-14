import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FiArrowUpRight } from "react-icons/fi";

import { resolveHeaderNavigationUrl } from "@/lib/header-navigation";
import type { PortfolioProjectListItem } from "@/types/portfolio";

import EditorialHeader from "./editorial-header";
import EditorialBeforeAfter from "./editorial-before-after";
import EditorialHeroMotion from "./editorial-hero-motion";
import EditorialImpactCalculator from "./editorial-impact-calculator";
import EditorialProjects from "./editorial-projects";
import type { SolarEditorialHomeProps } from "./editorial-home.types";
import styles from "./solar-editorial-home.module.css";

const LIFESTYLE_IMAGE = "/asset/home-editorial/lifestyle-home.webp";

function isCredibleProject(project: PortfolioProjectListItem) {
  const source = project.heroImage.trim().toLowerCase();
  return Boolean(source) && !source.includes("unsplash.com") && !source.includes("images.unsplash");
}

function EditorialArrow() {
  return <FiArrowUpRight aria-hidden="true" className={styles.arrow} />;
}

function SignatureMotif() {
  return (
    <span className={styles.signatureMotif} aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}

export default async function SolarEditorialHome({
  locale,
  websiteSettings,
  initialShowcaseProjects,
  navigationItems,
  forumUrl,
}: SolarEditorialHomeProps) {
  const t = await getTranslations({ locale, namespace: "HomeEditorial" });
  const wizardHref = `/${locale}/wizard`;
  const buildHref = `/${locale}/build`;
  const projects = initialShowcaseProjects.filter(isCredibleProject).slice(0, 4);
  const activeSocials = websiteSettings.socialLinks.filter((item) => item.isActive);
  const currentYear = new Date().getFullYear();

  return (
    <div className={styles.page} data-solar-surface="editorial">
      <EditorialHeader
        locale={locale}
        companyName={websiteSettings.company.companyName}
        navigationItems={navigationItems}
        forumUrl={forumUrl}
        hasProjects={projects.length > 0}
        labels={{
          menu: t("navigation.menu"),
          openMenuAria: t("navigation.openMenuAria"),
          closeMenuAria: t("navigation.closeMenuAria"),
          primaryCta: t("navigation.primaryCta"),
          secondaryCta: t("navigation.secondaryCta"),
          navigation: t("footer.navigation"),
          concept: t("navigation.concept"),
          projects: t("navigation.projects"),
          solutions: t("navigation.solutions"),
          calculator: t("navigation.calculator"),
          about: t("navigation.about"),
          track: t("navigation.track"),
          language: t("navigation.languageSwitch"),
          ecoBadge: t("navigation.ecoBadge"),
        }}
      />

      <div>
        <EditorialHeroMotion
          locale={locale}
          labels={{
            eyebrow: t("hero.eyebrow"),
            titleLineOne: t("hero.titleLineOne"),
            titleLineTwo: t("hero.titleLineTwo"),
            description: t("hero.description"),
            primaryCta: t("hero.primaryCta"),
            primaryHint: t("hero.primaryHint"),
            secondaryCta: t("hero.secondaryCta"),
            secondaryHint: t("hero.secondaryHint"),
            imageAlt: t("hero.imageAlt"),
            mediaLabel: t("hero.mediaLabel"),
          }}
        />

        <section id="about" className={styles.statement} aria-labelledby="statement-title">
          <span id="concept" className={styles.anchorAlias} aria-hidden="true" />
          <div>
            <p className={styles.sectionMarker}>{t("statement.eyebrow")}</p>
            <SignatureMotif />
          </div>
          <div>
            <h2 id="statement-title">{t("statement.title")}</h2>
            <p>{t("statement.body")}</p>
          </div>
        </section>

        <section id="solutions" className={styles.lifestyle} aria-labelledby="lifestyle-title">
          <div className={styles.lifestyleMedia}>
            <Image
              src={LIFESTYLE_IMAGE}
              alt={t("lifestyle.imageAlt")}
              fill
              sizes="(max-width: 767px) 100vw, 62vw"
              className={styles.coverImage}
            />
            <p>{t("lifestyle.caption")}</p>
          </div>
          <div className={styles.lifestyleCopy}>
            <p className={styles.sectionMarker}>{t("lifestyle.eyebrow")}</p>
            <h2 id="lifestyle-title">{t("lifestyle.title")}</h2>
            <p>{t("lifestyle.body")}</p>
          </div>
        </section>

        <EditorialBeforeAfter
          labels={{
            eyebrow: t("beforeAfter.eyebrow"),
            title: t("beforeAfter.title"),
            description: t("beforeAfter.description"),
            before: t("beforeAfter.before"),
            after: t("beforeAfter.after"),
            beforeAlt: t("beforeAfter.beforeAlt"),
            afterAlt: t("beforeAfter.afterAlt"),
            sliderLabel: t("beforeAfter.sliderLabel"),
          }}
        />

        <EditorialImpactCalculator
          locale={locale}
          wizardHref={wizardHref}
          labels={{
            eyebrow: t("calculator.eyebrow"),
            title: t("calculator.title"),
            description: t("calculator.description"),
            billLabel: t("calculator.billLabel"),
            billHint: t("calculator.billHint"),
            billMin: t("calculator.billMin"),
            billMax: t("calculator.billMax"),
            savingsLabel: t("calculator.savingsLabel"),
            annualSavingsLabel: t("calculator.annualSavingsLabel"),
            co2Label: t("calculator.co2Label"),
            treesLabel: t("calculator.treesLabel"),
            systemSizeLabel: t("calculator.systemSizeLabel"),
            impactLabel: t("calculator.impactLabel"),
            estimateTag: t("calculator.estimateTag"),
            disclaimer: t("calculator.disclaimer"),
            action: t("calculator.action"),
            success: t("calculator.success"),
            unitMonth: t("calculator.unitMonth"),
            unitYear: t("calculator.unitYear"),
            currencySymbol: t("calculator.currencySymbol"),
          }}
        />

        <section className={styles.pathways} aria-labelledby="pathways-title">
          <div className={styles.sectionHeading}>
            <p className={styles.sectionMarker}>{t("pathways.eyebrow")}</p>
            <h2 id="pathways-title">{t("pathways.title")}</h2>
            <p>{t("pathways.description")}</p>
          </div>
          <div className={styles.pathwayList}>
            {(["wizard", "build"] as const).map((path) => (
              <Link
                key={path}
                href={path === "wizard" ? wizardHref : buildHref}
                className={styles.pathway}
              >
                <span className={styles.pathwayIndex}>{t(`pathways.${path}.index`)}</span>
                <div>
                  <p>{t(`pathways.${path}.label`)}</p>
                  <h3>{t(`pathways.${path}.title`)}</h3>
                  <span>{t(`pathways.${path}.description`)}</span>
                </div>
                <strong>{t(`pathways.${path}.cta`)} <EditorialArrow /></strong>
              </Link>
            ))}
          </div>
        </section>

        {projects.length > 0 ? (
          <section id="projects" className={styles.projects} aria-labelledby="projects-title">
            <div className={styles.sectionHeading}>
              <p className={styles.sectionMarker}>{t("projects.eyebrow")}</p>
              <h2 id="projects-title">{t("projects.title")}</h2>
              <p>{t("projects.description")}</p>
            </div>
            <EditorialProjects
              locale={locale}
              projects={projects}
              labels={{
                viewProject: t("projects.viewProject"),
                viewAll: t("projects.viewAll"),
                imageAlt: t("projects.imageAlt", { title: "{title}" }),
                systemSize: t("projects.systemSize"),
                location: t("projects.location"),
                completed: t("projects.completed"),
                dialog: {
                  close: t("projects.dialog.close"),
                  error: t("projects.dialog.error"),
                },
              }}
            />
          </section>
        ) : null}

        <section className={styles.closing} aria-labelledby="closing-title">
          <p className={styles.sectionMarker}>{t("closing.eyebrow")}</p>
          <h2 id="closing-title">{t("closing.title")}</h2>
          <p>{t("closing.description")}</p>
          <div className={styles.closingActions}>
            <Link className={styles.primaryButton} href={wizardHref}>{t("closing.primaryCta")}</Link>
            <Link className={styles.inverseButton} href={buildHref}>{t("closing.secondaryCta")}</Link>
          </div>
        </section>
      </div>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <Link href={`/${locale}`}>{websiteSettings.company.companyName}</Link>
          <p>{t("footer.tagline")}</p>
          <SignatureMotif />
        </div>
        <div className={styles.footerLinks}>
          {websiteSettings.footerNavigation.map((group) => (
            <nav aria-label={group.title} key={group.title}>
              <h2>{group.title}</h2>
              {group.links.map((link) => (
                <Link key={`${group.title}:${link.href}`} href={resolveHeaderNavigationUrl(link.href, locale)}>
                  {link.label}
                </Link>
              ))}
            </nav>
          ))}
          <address>
            <h2>{t("footer.contact")}</h2>
            {websiteSettings.company.email ? <a href={`mailto:${websiteSettings.company.email}`}>{websiteSettings.company.email}</a> : null}
            {websiteSettings.company.phone ? <a href={`tel:${websiteSettings.company.phone}`}>{websiteSettings.company.phone}</a> : null}
            {activeSocials.map((social) => (
              <a key={`${social.platform}:${social.url}`} href={social.url} target="_blank" rel="noreferrer">
                {social.label || social.platform}
              </a>
            ))}
          </address>
        </div>
        <div className={styles.footerLegal}>
          <p>{t("footer.copyright", { year: currentYear })}</p>
          <div>
            <Link href={`/${locale}/privacy`}>{t("footer.privacy")}</Link>
            <Link href={`/${locale}/terms`}>{t("footer.terms")}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
