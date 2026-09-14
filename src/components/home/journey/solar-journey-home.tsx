"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import {
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControlLabel,
  IconButton,
  Slider,
  Stack,
  Switch,
  ThemeProvider,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  createTheme,
} from "@mui/material";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  FiArrowDown,
  FiArrowRight,
  FiArrowUpRight,
  FiBatteryCharging,
  FiCheck,
  FiChevronRight,
  FiCloud,
  FiCompass,
  FiGrid,
  FiHome,
  FiInfo,
  FiLayers,
  FiLoader,
  FiMapPin,
  FiMoon,
  FiPlus,
  FiSettings,
  FiSun,
  FiTool,
  FiZap,
} from "react-icons/fi";
import { isPortfolioProject, type PortfolioProjectListItem, type ProjectCaseStudy } from "@/types/portfolio";
import { useSolarJourney } from "@/hooks/use-solar-journey";
import {
  getJourneyDaySnapshot,
  type JourneyDirection,
  type JourneyTilt,
} from "@/lib/solar/journey-simulation";
import { getSolarJourneyCopy } from "./solar-journey-copy";
import { EnergyFlowDiagram, SolarHouseIllustration, SystemAssembly } from "./solar-journey-visuals";
import styles from "./solar-journey.module.css";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const ProjectDetailModal = dynamic(
  () => import("@/components/agency/sections/ProjectDetailModal"),
  { ssr: false },
);

const journeyTheme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#b7d1ea", contrastText: "#142533" },
    secondary: { main: "#d8a87b", contrastText: "#142533" },
    text: { primary: "#142533", secondary: "#506171" },
    divider: "rgba(20, 37, 51, 0.14)",
  },
  typography: {
    fontFamily: "var(--font-roboto), var(--font-noto-sans-thai), sans-serif",
    button: { fontWeight: 700, textTransform: "none", letterSpacing: "0.01em" },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { minHeight: 44, borderRadius: 999, paddingInline: 18 },
      },
    },
    MuiChip: { styleOverrides: { root: { borderRadius: 999, fontWeight: 700 } } },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          minHeight: 44,
          borderColor: "rgba(20, 37, 51, 0.14)",
          color: "#506171",
          textTransform: "none",
          fontWeight: 700,
          "&.Mui-selected": {
            backgroundColor: "#b7d1ea",
            color: "#142533",
          },
          "&.Mui-selected:hover": { backgroundColor: "#a5c2de" },
        },
      },
    },
    MuiSlider: {
      styleOverrides: {
        root: { color: "#4f7fa8", height: 4 },
        thumb: { width: 22, height: 22, boxShadow: "0 2px 7px rgba(20,37,51,0.16)" },
        rail: { opacity: 0.32 },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: {
          "&.Mui-checked": { color: "#4f7fa8" },
          "&.Mui-checked + .MuiSwitch-track": { backgroundColor: "#7ca8d0", opacity: 1 },
        },
        track: { backgroundColor: "#aeb9c0", opacity: 0.78 },
      },
    },
  },
});

type JourneyStage = "hero" | "sun" | "roof" | "energy" | "battery" | "system" | "projects";

const STAGES: ReadonlyArray<Exclude<JourneyStage, "hero">> = [
  "sun",
  "roof",
  "energy",
  "battery",
  "system",
  "projects",
];

const HOTSPOTS = [
  { id: "roof", x: "45%", y: "25%", icon: FiHome },
  { id: "space", x: "68%", y: "31%", icon: FiLayers },
  { id: "shade", x: "78%", y: "53%", icon: FiCloud },
  { id: "electrical", x: "61%", y: "67%", icon: FiZap },
  { id: "meter", x: "24%", y: "68%", icon: FiGrid },
  { id: "inverter", x: "34%", y: "61%", icon: FiSettings },
  { id: "monitoring", x: "52%", y: "76%", icon: FiCompass },
  { id: "warranty", x: "77%", y: "77%", icon: FiCheck },
] as const;

const formatNumber = (value: number, locale: string, maximumFractionDigits = 1) =>
  new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US", {
    maximumFractionDigits,
  }).format(value);

const PROVINCE_LABELS: Readonly<Record<string, Readonly<{ en: string; th: string }>>> = {
  bangkok: { en: "Bangkok", th: "กรุงเทพฯ" },
  chiangmai: { en: "Chiang Mai", th: "เชียงใหม่" },
  phuket: { en: "Phuket", th: "ภูเก็ต" },
  other: { en: "Thailand", th: "ประเทศไทย" },
};

function formatProjectLocation(project: PortfolioProjectListItem, locale: string) {
  const location = project.location.trim();
  const readableLocation = location && location.toLowerCase() !== "other" ? location : "";
  const province = PROVINCE_LABELS[project.province]?.[locale === "th" ? "th" : "en"] ?? project.province;
  return [readableLocation, province].filter(Boolean).join(" · ");
}

function titleLines(title: string) {
  return title.split("\n").map((line) => (
    <span key={line} className={styles.titleLine}>
      {line}
    </span>
  ));
}

export type SolarJourneyHomeProps = Readonly<{
  locale: string;
  initialShowcaseProjects: readonly PortfolioProjectListItem[];
}>;

export default function SolarJourneyHome({
  locale,
  initialShowcaseProjects,
}: SolarJourneyHomeProps) {
  const copy = getSolarJourneyCopy(locale);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [activeStage, setActiveStage] = useState<JourneyStage>("hero");
  const [activeHotspot, setActiveHotspot] = useState<string>("roof");
  const [selectedProject, setSelectedProject] = useState<ProjectCaseStudy | null>(null);
  const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const sunReadoutNodesRef = useRef<Readonly<{ time: HTMLElement | null; kw: HTMLElement | null }> | null>(null);
  const {
    solarSizeKwp,
    setSolarSizeKwp,
    sunProgress,
    setSunProgress,
    roofDirection,
    setRoofDirection,
    roofTilt,
    setRoofTilt,
    shade,
    setShade,
    appliances,
    toggleAppliance,
    batteryEnabled,
    setBatteryEnabled,
    roofPotential,
    simulation,
    eveningSimulation,
  } = useSolarJourney();
  const day = getJourneyDaySnapshot(sunProgress);
  const { solarKw: solarProduction, homeLoadKw: homeLoad, directUseKw: directUse, netKw: netFlow, batteryFlowKw: batteryFlow, gridFlowKw: gridFlow } = simulation;

  const scrollToScene = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }, [reducedMotion]);

  // The sun timeline can update 60+ times per second. Update only the
  // two readout text nodes here instead of setting React state on every tick
  // and re-rendering all eleven scenes.
  const updateSunReadout = useCallback((progress: number) => {
    const root = rootRef.current;
    if (!root) return;
    const snapshot = getJourneyDaySnapshot(progress);
    const nodes = sunReadoutNodesRef.current ?? {
      time: root.querySelector<HTMLElement>("[data-journey-day-time]"),
      kw: root.querySelector<HTMLElement>("[data-journey-day-kw]"),
    };
    sunReadoutNodesRef.current = nodes;
    if (nodes.time) nodes.time.textContent = snapshot.time;
    if (nodes.kw) nodes.kw.textContent = snapshot.kw.toFixed(1);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const scenes = Array.from(root.querySelectorAll<HTMLElement>("[data-journey-scene]"));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const stage = visible?.target.getAttribute("data-journey-stage") as JourneyStage | null;
        if (stage) setActiveStage(stage);
      },
      { rootMargin: "-38% 0px -42%", threshold: [0.05, 0.25, 0.5, 0.8] },
    );
    scenes.forEach((scene) => observer.observe(scene));
    return () => observer.disconnect();
  }, []);

  useGSAP(() => {
    if (reducedMotion) return;
    const matchMedia = gsap.matchMedia();

    matchMedia.add("(min-width: 1024px)", () => {
      const hero = rootRef.current?.querySelector<HTMLElement>('[data-journey-scene="hero"]');
      if (hero) {
        const heroSun = hero.querySelector<SVGGElement>("[data-journey-hero-sun]");
        const heroPanels = hero.querySelector<SVGGElement>("[data-journey-hero-panels]");
        const heroSunlight = hero.querySelector<HTMLElement>("[data-hero-sunlight]");
        const heroCopy = hero.querySelector<HTMLElement>("[data-hero-copy]");
        const heroTimeline = gsap.timeline({
          scrollTrigger: {
            trigger: hero,
            start: "top top",
            end: "+=900",
            scrub: 1,
            invalidateOnRefresh: true,
          },
        });
        if (heroSun) heroTimeline.to(heroSun, { x: 150, y: -55, scale: 1.15, duration: 1 }, 0);
        if (heroPanels) heroTimeline.to(heroPanels, { opacity: 1, duration: 0.42 }, 0.22);
        if (heroSunlight) heroTimeline.to(heroSunlight, { opacity: 0.9, scale: 1.1, duration: 0.55 }, 0.34);
        if (heroCopy) heroTimeline.to(heroCopy, { yPercent: -12, opacity: 0.45, duration: 0.8 }, 0.45);
      }

      const sunScene = rootRef.current?.querySelector<HTMLElement>('[data-journey-scene="sun"]');
      if (sunScene) {
        const path = sunScene.querySelector<SVGPathElement>("[data-journey-production-path]");
        if (path) gsap.set(path, { strokeDashoffset: 1 });
        const daySky = sunScene.querySelector<HTMLElement>("[data-journey-day-sky]");
        const daySun = sunScene.querySelector<HTMLElement>("[data-journey-day-sun]");
        const daySkyImage = sunScene.querySelector<HTMLElement>(".daySkyImage");
        const startSunPoint = () => ({
          x: (daySky?.clientWidth ?? 0) * 0.11,
          y: (daySky?.clientHeight ?? 0) * 0.43,
        });
        const endSunPoint = () => ({
          x: (daySky?.clientWidth ?? 0) * 0.89,
          y: (daySky?.clientHeight ?? 0) * 0.18,
        });
        if (daySky && daySun) {
          const point = startSunPoint();
          // Keep the sun on the compositor during the pinned sequence. The
          // no-JS/reduced-motion fallback still uses the percentage position
          // from the rendered markup.
          gsap.set(daySun, { left: 0, top: 0, x: point.x, y: point.y, xPercent: -50, yPercent: -50 });
        }
        let sunTimeline: gsap.core.Timeline | null = null;
        sunTimeline = gsap.timeline({
          scrollTrigger: {
            trigger: sunScene,
            // Keep the story tied to the section's natural scroll range. A
            // stack of pinned scenes can fight the browser's scroll position
            // when a layout refresh occurs, which is the source of the
            // shuttle-back feeling on fast wheel and trackpad gestures.
            start: "top bottom",
            end: "bottom top",
            scrub: 0.6,
            invalidateOnRefresh: true,
          },
        });
        sunTimeline.eventCallback("onUpdate", () => updateSunReadout(sunTimeline?.progress() ?? 0));
        sunTimeline
          .to(daySun, { x: () => endSunPoint().x, y: () => endSunPoint().y, scale: 1.1, duration: 1 }, 0)
          .to("[data-journey-day-sky]", { backgroundColor: "#f9fbfb", duration: 1 }, 0)
          .to("[data-journey-production-path]", { strokeDashoffset: 0, duration: 0.92 }, 0.08)
          .to("[data-journey-day-sky]", { boxShadow: "0 0 0 2px rgba(216,168,123,0.74), 0 18px 50px rgba(79,127,168,0.22)", duration: 0.7 }, 0.22);
        if (daySkyImage) {
          sunTimeline.to(daySkyImage, { opacity: 0.84, filter: "saturate(0.98) contrast(1.02) brightness(1.04)", duration: 0.8 }, 0.12);
        }
      }

      const roofScene = rootRef.current?.querySelector<HTMLElement>('[data-journey-scene="roof"]');
      if (roofScene) {
        const roofTimeline = gsap.timeline({
          scrollTrigger: {
            trigger: roofScene,
            start: "top bottom",
            end: "bottom top",
            scrub: 0.6,
            invalidateOnRefresh: true,
          },
        });
        roofTimeline
          .fromTo(
            "[data-journey-roof-plane]",
            { boxShadow: "0 0 0 0 rgba(216,168,123,0)" },
            { boxShadow: "0 0 0 2px rgba(216,168,123,0.72), 0 18px 40px rgba(79,127,168,0.18)", duration: 0.55 },
            0.18,
          )
          .fromTo(
            "[data-journey-roof-readout]",
            { y: 18, opacity: 0.72 },
            { y: 0, opacity: 1, duration: 0.5 },
            0.28,
          );
      }

      const batteryScene = rootRef.current?.querySelector<HTMLElement>('[data-journey-scene="battery"]');
      if (batteryScene) {
        const batteryTimeline = gsap.timeline({
          scrollTrigger: {
            trigger: batteryScene,
            start: "top 76%",
            end: "bottom 35%",
            scrub: 1,
            invalidateOnRefresh: true,
          },
        });
        batteryTimeline
          .to("[data-journey-battery-sun]", { x: "-18%", y: "95%", opacity: 0.24, duration: 1 }, 0)
          .fromTo("[data-journey-battery-night]", { opacity: 0.78 }, { opacity: 1, duration: 0.75 }, 0.25);
      }

      const systemScene = rootRef.current?.querySelector<HTMLElement>('[data-journey-scene="system"]');
      if (systemScene) {
        const assemblyParts = gsap.utils.toArray<HTMLElement>("[data-assembly-part]");
        gsap.fromTo(
          assemblyParts,
          { autoAlpha: 0, y: 34, scale: 0.9, rotate: -2 },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            rotate: 0,
            stagger: 0.1,
            ease: "power3.out",
            scrollTrigger: {
              trigger: systemScene,
              start: "top 68%",
              end: "bottom 40%",
              scrub: 0.8,
              invalidateOnRefresh: true,
            },
          },
        );
        gsap.fromTo(
          "[data-assembly-part='cables']",
          { autoAlpha: 0, scaleX: 0.4 },
          { autoAlpha: 1, scaleX: 1, ease: "power2.out", scrollTrigger: { trigger: systemScene, start: "top 52%", end: "center center", scrub: true, invalidateOnRefresh: true } },
        );
      }

      const projectSection = rootRef.current?.querySelector<HTMLElement>('[data-journey-scene="projects"]');
      const projectTrack = rootRef.current?.querySelector<HTMLElement>("[data-project-track]");
      if (projectSection && projectTrack && projectTrack.scrollWidth > window.innerWidth) {
        const distance = () => Math.max(0, projectTrack.scrollWidth - window.innerWidth + 48);
        gsap.to(projectTrack, {
          x: () => -distance(),
          ease: "none",
          scrollTrigger: {
            trigger: projectSection,
            start: "top bottom",
            end: "bottom top",
            scrub: 0.6,
            invalidateOnRefresh: true,
          },
        });
      }
    });

    return () => matchMedia.revert();
  }, { scope: rootRef, dependencies: [reducedMotion, updateSunReadout] });

  const handleSliderChange = (_event: Event, value: number | number[]) => {
    const next = Array.isArray(value) ? value[0] : value;
    setSolarSizeKwp(next);
  };

  const handleSunProgress = (_event: Event, value: number | number[]) => {
    const next = Array.isArray(value) ? value[0] : value;
    const progress = next / 100;
    setSunProgress(progress);
    updateSunReadout(progress);
  };

  const handleDirection = (
    _event: ReactMouseEvent<HTMLElement>,
    value: JourneyDirection | null,
  ) => {
    if (value) setRoofDirection(value);
  };

  const handleTilt = (_event: Event, value: number | number[]) => {
    const next = Array.isArray(value) ? value[0] : value;
    if (next === 0 || next === 15 || next === 30 || next === 45) {
      setRoofTilt(next as JourneyTilt);
    }
  };

  const openProject = async (project: PortfolioProjectListItem) => {
    if (loadingProjectId) return;
    setLoadingProjectId(project.id);
    setProjectError(null);
    try {
      const response = await fetch(`/api/portfolio?projectId=${encodeURIComponent(project.id)}`, { cache: "no-store" });
      const payload: unknown = await response.json();
      const projectData = typeof payload === "object" && payload !== null && "project" in payload
        ? payload.project
        : null;
      if (!response.ok || !isPortfolioProject(projectData)) {
        setProjectError("Project details are unavailable right now.");
        return;
      }
      setSelectedProject(projectData);
    } catch {
      setProjectError("Project details are unavailable right now.");
    } finally {
      setLoadingProjectId(null);
    }
  };

  const activeHotspotCopy = copy.inspect.items[activeHotspot] ?? copy.inspect.items.roof;
  const projectCards = initialShowcaseProjects.slice(0, 6);
  const assemblyLabels = [
    copy.system.panel,
    copy.system.mounting,
    copy.system.inverter,
    copy.system.protection,
    copy.system.monitoring,
    copy.system.battery,
    copy.system.engineering,
    copy.system.installation,
    copy.system.complete,
  ];

  return (
    <AppRouterCacheProvider options={{ enableCssLayer: true }}>
      <ThemeProvider theme={journeyTheme}>
        <div ref={rootRef} className={styles.journeyPage} data-bagui="solar-journey" data-active-stage={activeStage}>
          <aside className={styles.progressRail} aria-label={copy.progress.ariaLabel}>
            <span className={styles.progressRailLine} aria-hidden="true" />
            {STAGES.map((stage) => {
              const label = copy.progress[stage];
              return (
                <button
                  type="button"
                  key={stage}
                  className={`${styles.progressDot} ${activeStage === stage ? styles.progressDotActive : ""}`}
                  onClick={() => scrollToScene(`journey-${stage}`)}
                  aria-label={`${copy.progress.goTo} ${label}`}
                  aria-current={activeStage === stage ? "step" : undefined}
                >
                  <span>{label}</span>
                </button>
              );
            })}
          </aside>

          <section id="journey-hero" data-journey-scene="hero" data-journey-stage="hero" className={`${styles.scene} ${styles.heroScene}`} aria-labelledby="journey-hero-title">
            <div className={styles.heroAtmosphere} aria-hidden="true" />
            <div className={styles.sceneInner}>
              <div className={styles.heroCopy} data-hero-copy>
                <span className={styles.kicker}>{copy.hero.kicker}</span>
                <h1 id="journey-hero-title" className={styles.heroTitle}>{titleLines(copy.hero.title)}</h1>
                <p className={styles.heroDescription}>{copy.hero.description}</p>
                <div className={styles.heroActions}>
                  <Button variant="contained" color="primary" endIcon={<FiArrowDown aria-hidden="true" />} onClick={() => scrollToScene("journey-sun")}>
                    {copy.hero.explore}
                  </Button>
                  <Button variant="text" color="inherit" endIcon={<FiArrowUpRight aria-hidden="true" />} onClick={() => scrollToScene("journey-decision")}>
                    {copy.hero.design}
                  </Button>
                </div>
                <div className={styles.heroMeta}>
                  <span><FiSun aria-hidden="true" /> {copy.hero.simulation}</span>
                  <span>{copy.hero.scroll}</span>
                </div>
              </div>
              <div className={styles.heroVisual}>
                <div className={styles.heroImageFrame}>
                  <Image
                    src="/asset/home-manga/hero-solar-journey-realistic.webp"
                    alt={copy.hero.imageAlt}
                    fill
                    preload
                    quality={84}
                    sizes="(max-width: 1023px) 100vw, 54vw"
                    className={styles.heroImage}
                  />
                  <span className={styles.heroImageShade} aria-hidden="true" />
                </div>
                <span className={styles.heroSunlight} data-hero-sunlight aria-hidden="true" />
                <div className={styles.heroCaption}>
                  <span className={styles.heroCaptionRule} />
                  <span>06:00 · {copy.hero.firstLight}</span>
                </div>
              </div>
            </div>
          </section>

          <section id="journey-sun" data-journey-scene="sun" data-journey-stage="sun" className={`${styles.scene} ${styles.sunScene}`} aria-labelledby="journey-sun-title">
            <div className={styles.sceneInnerWide}>
              <div className={styles.chapterCopy}>
                <span className={styles.chapterIndex}>01 / 06</span>
                <h2 id="journey-sun-title" className={styles.chapterTitle}>{titleLines(copy.sun.title)}</h2>
                <p>{copy.sun.description}</p>
                <Chip icon={<FiInfo aria-hidden="true" />} label={copy.sun.simulation} variant="outlined" className={styles.simulationChip} />
              </div>
              <div className={styles.sunStory}>
                <div className={styles.daySky} data-journey-day-sky>
                  <Image
                    src="/asset/home-manga/solar-journey-home-midday-realistic.webp"
                    alt=""
                    fill
                    quality={82}
                    sizes="(max-width: 1023px) 100vw, 42vw"
                    className={styles.daySkyImage}
                  />
                  <div className={styles.daySun} data-journey-day-sun style={{ left: `${day.sunX}%` }} aria-hidden="true"><span /></div>
                  <div className={styles.dayCloud} aria-hidden="true" />
                  <div className={styles.dayHorizon} aria-hidden="true" />
                  <div className={styles.dayReadout} aria-live="off" aria-atomic="true">
                    <span data-journey-day-time>{day.time}</span>
                    <strong><span data-journey-day-kw>{day.kw.toFixed(1)}</span> <small>{copy.labels.kW}</small></strong>
                    <em>{copy.sun.example}</em>
                  </div>
                </div>
                <div className={styles.productionChart}>
                  <div className={styles.chartHeader}>
                    <span>{copy.sun.production}</span>
                    <strong>{copy.sun.peak}</strong>
                  </div>
                  <svg viewBox="0 0 600 190" role="img" aria-label={`${copy.sun.production} · ${copy.sun.example}`}>
                    <path d="M0 169H600M0 112H600M0 55H600" className={styles.chartGridLine} />
                    <path d="M0 163 C60 157 84 126 150 92 C210 58 253 28 310 28 C364 28 418 70 463 98 C518 134 554 159 600 163" className={styles.chartBase} />
                    <path d="M0 163 C60 157 84 126 150 92 C210 58 253 28 310 28 C364 28 418 70 463 98 C518 134 554 159 600 163" pathLength="1" data-journey-production-path className={styles.chartProgress} />
                    <circle cx="310" cy="28" r="6" className={styles.chartPeak} />
                    <text x="0" y="185">06:00</text><text x="150" y="185">09:00</text><text x="294" y="185">12:00</text><text x="450" y="185">15:00</text><text x="566" y="185">18:00</text>
                  </svg>
                  <div className={styles.mobileSunControl}>
                    <Slider value={sunProgress * 100} min={0} max={100} step={1} onChange={handleSunProgress} aria-label={copy.sun.production} />
                    <span>{copy.sun.production} · {formatNumber(day.kw, locale, 1)} {copy.labels.kW}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section id="journey-roof" data-journey-scene="roof" data-journey-stage="roof" className={`${styles.scene} ${styles.roofScene}`} aria-labelledby="journey-roof-title">
            <div className={styles.sceneInnerWide}>
              <div className={styles.chapterCopy}>
                <span className={styles.chapterIndex}>02 / 06</span>
                <h2 id="journey-roof-title" className={styles.chapterTitle}>{titleLines(copy.roof.title)}</h2>
                <p>{copy.roof.description}</p>
              </div>
              <div className={styles.roofExplorer}>
                <div className={styles.roofDiagram} data-journey-roof-diagram>
                  <Image
                    src="/asset/home-manga/solar-journey-roof-detail-realistic.webp"
                    alt=""
                    fill
                    quality={82}
                    sizes="(max-width: 1023px) 100vw, 42vw"
                    className={styles.roofReferenceImage}
                  />
                  <div className={styles.roofSunBeam} style={{ transform: `rotate(${roofDirection === "east" ? -18 : roofDirection === "west" ? 18 : roofDirection === "north" ? 34 : 0}deg)` }} aria-hidden="true" />
                  <div className={`${styles.roofPlane} ${shade === "partial" ? styles.roofPlaneShaded : ""}`} data-journey-roof-plane style={{ transform: `rotateX(${roofTilt / 2}deg) rotateZ(${roofDirection === "west" ? 3 : roofDirection === "east" ? -3 : 0}deg)` }}>
                    <span className={styles.roofPanelGrid} />
                    <span className={styles.roofShade} aria-hidden="true" />
                  </div>
                  <span className={styles.roofGround} aria-hidden="true" />
                  <div className={styles.roofReadout} data-journey-roof-readout>
                    <span>{copy.roof.potential}</span>
                    <strong>{roofPotential}%</strong>
                    <small>{copy.roof.note}</small>
                  </div>
                </div>
                <Card variant="outlined" className={styles.controlPanel}>
                  <CardContent>
                    <span className={styles.controlPanelTitle}>{copy.roof.direction}</span>
                    <ToggleButtonGroup exclusive value={roofDirection} onChange={handleDirection} fullWidth size="small" aria-label={copy.roof.direction}>
                      <ToggleButton value="north" aria-label={copy.roof.north}>N</ToggleButton>
                      <ToggleButton value="east" aria-label={copy.roof.east}>E</ToggleButton>
                      <ToggleButton value="south" aria-label={copy.roof.south}>S</ToggleButton>
                      <ToggleButton value="west" aria-label={copy.roof.west}>W</ToggleButton>
                    </ToggleButtonGroup>
                    <div className={styles.controlRow}>
                      <span>{copy.roof.tilt}</span>
                      <strong>{roofTilt}°</strong>
                    </div>
                    <Slider value={roofTilt} min={0} max={45} step={15} marks aria-label={copy.roof.tilt} onChange={handleTilt} />
                    <div className={styles.controlRow}>
                      <span>{copy.roof.shade}</span>
                      <Stack direction="row" spacing={0.5}>
                        <Button size="small" variant={shade === "clear" ? "contained" : "text"} onClick={() => setShade("clear")}>{copy.roof.clear}</Button>
                        <Button size="small" variant={shade === "partial" ? "contained" : "text"} onClick={() => setShade("partial")}>{copy.roof.partial}</Button>
                      </Stack>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          <section id="journey-size" data-journey-scene="size" data-journey-stage="energy" className={`${styles.scene} ${styles.sizeScene}`} aria-labelledby="journey-size-title">
            <div className={styles.sceneInnerWide}>
              <div className={styles.chapterCopy}>
                <span className={styles.chapterIndex}>03 / 06</span>
                <h2 id="journey-size-title" className={styles.chapterTitle}>{titleLines(copy.size.title)}</h2>
                <p>{copy.size.description}</p>
                <p className={styles.chapterNote}><FiInfo aria-hidden="true" /> {copy.size.note}</p>
              </div>
              <div className={styles.sizeExplorer}>
                <div className={styles.sizeVisual}>
                  <div className={styles.sizeSky} aria-hidden="true"><span /></div>
                  <SolarHouseIllustration panelIntensity={Math.min(1, solarSizeKwp / 12)} />
                  <div className={styles.sizeFlowLegend}>
                    <span><i className={styles.legendSun} />{copy.size.solar}</span>
                    <span><i className={styles.legendHome} />{copy.size.home}</span>
                    <span><i className={styles.legendGrid} />{copy.size.excess}</span>
                  </div>
                </div>
                <Card variant="outlined" className={styles.sizePanel}>
                  <CardContent>
                    <div className={styles.controlRow}><span>{copy.size.systemSize}</span><strong>{formatNumber(solarSizeKwp, locale, 1)} {copy.labels.kWp}</strong></div>
                    <Slider value={solarSizeKwp} min={3} max={20} step={0.5} marks={[{ value: 3, label: "3" }, { value: 10, label: "10" }, { value: 20, label: "20" }]} onChange={handleSliderChange} aria-label={copy.size.systemSize} />
                    <div className={styles.sizeFlowRows}>
                      <div><span>{copy.size.direct}</span><strong>{formatNumber(directUse, locale, 1)} {copy.labels.kW}</strong></div>
                      <div><span>{copy.size.grid}</span><strong>{formatNumber(Math.max(0, simulation.gridFlowKw), locale, 1)} {copy.labels.kW}</strong></div>
                      <div><span>{copy.size.stored}</span><strong>{formatNumber(Math.max(0, simulation.batteryFlowKw), locale, 1)} {copy.labels.kW}</strong></div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          <section id="journey-energy" data-journey-scene="energy" data-journey-stage="energy" className={`${styles.scene} ${styles.energyScene}`} aria-labelledby="journey-energy-title">
            <div className={styles.sceneInnerWide}>
              <div className={styles.chapterCopy}>
                <span className={styles.chapterIndex}>04 / 06</span>
                <h2 id="journey-energy-title" className={styles.chapterTitle}>{titleLines(copy.flow.title)}</h2>
                <p>{copy.flow.description}</p>
                <Chip icon={<FiZap aria-hidden="true" />} label={copy.flow.simulation} variant="outlined" className={styles.simulationChip} />
              </div>
              <div className={styles.flowExplorer}>
                <EnergyFlowDiagram
                  solarKw={solarProduction}
                  homeLoadKw={homeLoad}
                  batteryActive={batteryEnabled}
                  batteryFlowKw={batteryFlow}
                  gridFlowKw={gridFlow}
                  labels={{
                    ariaLabel: copy.flow.description,
                    sun: copy.labels.sun,
                    panel: copy.flow.solar,
                    home: copy.labels.home,
                    battery: copy.flow.battery,
                    grid: copy.labels.grid,
                    off: copy.battery.off,
                    kW: copy.labels.kW,
                  }}
                />
                <Card variant="outlined" className={styles.appliancePanel}>
                  <CardContent>
                    <div className={styles.controlPanelHeading}><span>{copy.flow.appliances}</span><FiPlus aria-hidden="true" /></div>
                    <ApplianceToggle label={copy.flow.airConditioner} checked={appliances.airConditioner} onChange={() => toggleAppliance("airConditioner")} />
                    <ApplianceToggle label={copy.flow.evCharger} checked={appliances.evCharger} onChange={() => toggleAppliance("evCharger")} />
                    <ApplianceToggle label={copy.flow.waterHeater} checked={appliances.waterHeater} onChange={() => toggleAppliance("waterHeater")} />
                    <ApplianceToggle label={copy.flow.poolPump} checked={appliances.poolPump} onChange={() => toggleAppliance("poolPump")} />
                    <Divider sx={{ my: 1.5 }} />
                    <div className={styles.flowSummary} aria-live="polite">
                      <span>{copy.flow.home}<strong>{formatNumber(homeLoad, locale, 1)} {copy.labels.kW}</strong></span>
                      <span>{netFlow >= 0 ? copy.flow.exporting : copy.flow.importing}<strong>{formatNumber(Math.abs(gridFlow), locale, 1)} {copy.labels.kW}</strong></span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          <section id="journey-battery" data-journey-scene="battery" data-journey-stage="battery" className={`${styles.scene} ${styles.batteryScene}`} aria-labelledby="journey-battery-title">
            <div className={styles.sceneInnerWide}>
              <div className={styles.chapterCopy}>
                <span className={styles.chapterIndex}>05 / 06</span>
                <h2 id="journey-battery-title" className={styles.chapterTitle}>{titleLines(copy.battery.title)}</h2>
                <p>{copy.battery.description}</p>
                <p className={styles.chapterNote}><FiBatteryCharging aria-hidden="true" /> {copy.battery.note}</p>
              </div>
              <div className={styles.batteryExplorer}>
                <div className={`${styles.batteryDayScene} ${batteryEnabled ? styles.batteryDaySceneOn : ""}`} data-journey-battery-day>
                  <span className={styles.batterySun} data-journey-battery-sun aria-hidden="true" />
                  <SolarHouseIllustration night={false} batteryEnabled={batteryEnabled} panelIntensity={0.92} />
                  <div className={styles.batteryEnergyPath} aria-hidden="true"><span /></div>
                  <span className={styles.batteryTimeLabel}>{copy.battery.daytime}</span>
                </div>
                <div className={styles.batteryNightScene} data-journey-battery-night>
                  <span className={styles.batteryMoon} aria-hidden="true"><FiMoon /></span>
                  <SolarHouseIllustration night batteryEnabled={batteryEnabled} panelIntensity={0.12} />
                  <div className={`${styles.batteryStoredPath} ${batteryEnabled ? styles.batteryStoredPathOn : ""}`} aria-hidden="true"><span /></div>
                  <span className={styles.batteryTimeLabel}>{copy.battery.evening}</span>
                </div>
                <div className={styles.batteryTogglePanel}>
                  <FormControlLabel
                    control={<Switch checked={batteryEnabled} onChange={(event) => setBatteryEnabled(event.target.checked)} slotProps={{ input: { "aria-label": copy.battery.battery } }} />}
                    label={<span>{copy.battery.battery}<strong>{batteryEnabled ? copy.battery.on : copy.battery.off}</strong></span>}
                  />
                  <div className={styles.batteryMetrics}>
                    <span>{copy.battery.stored}<strong>{formatNumber(Math.max(0, simulation.batteryFlowKw), locale, 1)} {copy.labels.kW}</strong></span>
                    <span>{copy.battery.grid}<strong>{formatNumber(Math.max(0, -eveningSimulation.gridFlowKw), locale, 1)} {copy.labels.kW}</strong></span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section id="journey-inspect" data-journey-scene="inspect" data-journey-stage="battery" className={`${styles.scene} ${styles.inspectScene}`} aria-labelledby="journey-inspect-title">
            <div className={styles.sceneInnerWide}>
              <div className={styles.chapterCopy}>
                <span className={styles.chapterIndex}>{copy.inspect.label}</span>
                <h2 id="journey-inspect-title" className={styles.chapterTitle}>{titleLines(copy.inspect.title)}</h2>
                <p>{copy.inspect.description}</p>
              </div>
              <div className={styles.inspectionExplorer}>
                <div className={styles.inspectionHouse}>
                  <SolarHouseIllustration night={false} panelIntensity={0.75} />
                  {HOTSPOTS.map((hotspot) => {
                    const Icon = hotspot.icon;
                    const isActive = activeHotspot === hotspot.id;
                    return (
                      <Tooltip key={hotspot.id} title={copy.inspect.items[hotspot.id]?.title ?? hotspot.id}>
                        <IconButton
                          className={`${styles.hotspot} ${isActive ? styles.hotspotActive : ""}`}
                          style={{ left: hotspot.x, top: hotspot.y }}
                          onClick={() => setActiveHotspot(hotspot.id)}
                          aria-label={copy.inspect.items[hotspot.id]?.title ?? hotspot.id}
                          aria-pressed={isActive}
                        >
                          <Icon aria-hidden="true" />
                        </IconButton>
                      </Tooltip>
                    );
                  })}
                </div>
                <Card variant="outlined" className={styles.inspectionDetail}>
                  <CardContent>
                    <span className={styles.detailPrompt}>{copy.inspect.tap}</span>
                    <h3>{activeHotspotCopy.title}</h3>
                    <p>{activeHotspotCopy.description}</p>
                    <span className={styles.detailStep}><FiChevronRight aria-hidden="true" /> {activeHotspotCopy.title}</span>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          <section id="journey-system" data-journey-scene="system" data-journey-stage="system" className={`${styles.scene} ${styles.systemScene}`} aria-labelledby="journey-system-title">
            <div className={styles.sceneInnerWide}>
              <div className={styles.chapterCopy}>
                <span className={styles.chapterIndex}>06 / 06</span>
                <h2 id="journey-system-title" className={styles.chapterTitle}>{titleLines(copy.system.title)}</h2>
                <p>{copy.system.description}</p>
              </div>
              <div className={styles.systemExplorer}>
                <SystemAssembly labels={assemblyLabels} ariaLabel={copy.system.description} />
                <div className={styles.systemFootnote}><FiTool aria-hidden="true" /> {copy.system.engineering} · {copy.system.installation} · {copy.system.warranty}</div>
              </div>
            </div>
          </section>

          <section id="journey-decision" data-journey-scene="decision" data-journey-stage="system" className={`${styles.scene} ${styles.decisionScene}`} aria-labelledby="journey-decision-title">
            <div className={styles.decisionInner}>
              <div className={styles.decisionIntro}>
                <span className={styles.kicker}>{copy.hero.simulation}</span>
                <h2 id="journey-decision-title" className={styles.decisionTitle}>{titleLines(copy.decision.title)}</h2>
                <p>{copy.decision.description}</p>
              </div>
              <div className={styles.decisionGrid}>
                <Card variant="outlined" className={`${styles.decisionCard} ${styles.decisionCardBuild}`}>
                  <CardContent>
                    <span className={styles.decisionTag}>BUILD</span>
                    <h3>{copy.decision.buildTitle}</h3>
                    <p>{copy.decision.buildDescription}</p>
                    <div className={styles.cardLink}>
                      <Button component={Link} href={`/${locale}/build?kw=${solarSizeKwp}`} variant="contained" color="primary" endIcon={<FiArrowRight aria-hidden="true" />}>{copy.decision.buildCta}</Button>
                    </div>
                  </CardContent>
                </Card>
                <Card variant="outlined" className={`${styles.decisionCard} ${styles.decisionCardWizard}`}>
                  <CardContent>
                    <span className={styles.decisionTag}>WIZARD</span>
                    <h3>{copy.decision.wizardTitle}</h3>
                    <p>{copy.decision.wizardDescription}</p>
                    <div className={styles.cardLink}>
                      <Button component={Link} href={`/${locale}/wizard`} variant="outlined" color="inherit" endIcon={<FiArrowRight aria-hidden="true" />}>{copy.decision.wizardCta}</Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          <section id="journey-projects" data-journey-scene="projects" data-journey-stage="projects" className={`${styles.scene} ${styles.projectsScene}`} aria-labelledby="journey-projects-title">
            <div className={styles.projectsIntro}>
              <span className={styles.kicker}>{copy.projects.intro}</span>
              <h2 id="journey-projects-title" className={styles.projectsTitle}>{titleLines(copy.projects.title)}</h2>
              <p>{copy.projects.description}</p>
            </div>
            <div className={styles.projectsViewport}>
              {projectCards.length > 0 ? (
                <div className={styles.projectTrack} data-project-track>
                  {projectCards.map((project, index) => (
                    <article className={styles.projectSlide} key={project.id}>
                      <div className={styles.projectImageFrame}>
                        <Image src={project.heroImage} alt={project.title} fill preload={index === 0} quality={82} sizes="(max-width: 900px) 88vw, 68vw" className={styles.projectImage} />
                        <span className={styles.projectIndex}>{String(index + 1).padStart(2, "0")} / {String(projectCards.length).padStart(2, "0")}</span>
                        <span className={styles.projectImageTone} aria-hidden="true" />
                      </div>
                      <div className={styles.projectSlideInfo}>
                        <div>
                          <span className={styles.projectCategory}>{project.category === "villa" ? copy.projects.villa : project.category === "commercial" ? copy.projects.commercial : copy.projects.residential}</span>
                          <h3>{project.title}</h3>
                          <p><FiMapPin aria-hidden="true" /> {formatProjectLocation(project, locale)}</p>
                        </div>
                        <div className={styles.projectStats}>
                          <span><strong>{project.solarSizeKw}</strong> {copy.labels.kWp}</span>
                          <span><strong>{project.completionYear}</strong></span>
                          <Button variant="text" color="inherit" endIcon={loadingProjectId === project.id ? <FiLoader className={styles.spin} aria-hidden="true" /> : <FiArrowUpRight aria-hidden="true" />} onClick={() => void openProject(project)} disabled={loadingProjectId !== null}>
                            {copy.projects.viewProject}
                          </Button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.projectEmpty}>{copy.projects.empty}</div>
              )}
            </div>
            {projectError ? <p className={styles.projectError} role="status">{projectError}</p> : null}
            <div className={styles.projectsFooter}>
              <span><FiCheck aria-hidden="true" /> {copy.projects.simulation}</span>
              <Button component={Link} href={`/${locale}/works`} variant="text" color="inherit" endIcon={<FiArrowUpRight aria-hidden="true" />}>{copy.projects.viewAll}</Button>
            </div>
          </section>

          <section id="journey-finale" data-journey-scene="finale" data-journey-stage="projects" className={`${styles.scene} ${styles.finaleScene}`} aria-labelledby="journey-finale-title">
            <div className={styles.finaleSky} aria-hidden="true"><span className={styles.finaleStars} /></div>
            <div className={styles.finaleInner}>
              <div className={styles.finaleVisual}>
                <SolarHouseIllustration night batteryEnabled={batteryEnabled} panelIntensity={0.08} />
                <span className={styles.finaleWindowGlow} aria-hidden="true" />
              </div>
              <div className={styles.finaleCopy}>
                <span className={styles.kicker}>{copy.finale.night}</span>
                <h2 id="journey-finale-title" className={styles.finaleTitle}>{titleLines(copy.finale.title)}</h2>
                <p>{copy.finale.description}</p>
                <div className={styles.finaleActions}>
                  <Button component={Link} href={`/${locale}/wizard`} variant="contained" color="primary" endIcon={<FiArrowRight aria-hidden="true" />}>{copy.finale.cta}</Button>
                  <Button component={Link} href={`/${locale}/build?kw=${solarSizeKwp}`} variant="text" color="inherit">{copy.finale.build}</Button>
                  <Button component={Link} href={`/${locale}/wizard`} variant="text" color="inherit">{copy.finale.wizard}</Button>
                </div>
              </div>
            </div>
          </section>

          {selectedProject ? <ProjectDetailModal project={selectedProject} locale={locale} onClose={() => setSelectedProject(null)} /> : null}
        </div>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}

function ApplianceToggle({ label, checked, onChange }: Readonly<{ label: string; checked: boolean; onChange: () => void }>) {
  return (
    <div className={styles.applianceToggle}>
      <span>{label}</span>
      <Switch checked={checked} onChange={onChange} slotProps={{ input: { "aria-label": label } }} size="small" />
    </div>
  );
}
