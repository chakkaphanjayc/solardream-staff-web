"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { calculateSolarMetrics } from "@/lib/solarCalculations";
import type {
  HomeSolarCalculationResult,
  HomeSolarSizeKw,
  HomeSolarState,
} from "@/types/home";

const HomeSolarContext = createContext<HomeSolarState | null>(null);

type HomeSolarStateProviderProps = Readonly<{
  children: ReactNode;
  initialSizeKw?: HomeSolarSizeKw;
}>;

export function HomeSolarStateProvider({
  children,
  initialSizeKw = 5,
}: HomeSolarStateProviderProps) {
  const [solarSizeKw, setSolarSizeKwState] = useState<HomeSolarSizeKw>(initialSizeKw);
  const [activeChapter, setActiveChapter] = useState<number>(0);
  const [storyProgress, setStoryProgress] = useState<number>(0);

  const setSolarSizeKw = useCallback((size: HomeSolarSizeKw) => {
    setSolarSizeKwState(size);
  }, []);

  const calculations: HomeSolarCalculationResult = useMemo(
    () => calculateSolarMetrics(solarSizeKw),
    [solarSizeKw]
  );

  const value = useMemo<HomeSolarState>(
    () => ({
      solarSizeKw,
      setSolarSizeKw,
      activeChapter,
      setActiveChapter,
      storyProgress,
      setStoryProgress,
      calculations,
    }),
    [solarSizeKw, setSolarSizeKw, activeChapter, storyProgress, calculations]
  );

  return (
    <HomeSolarContext.Provider value={value}>
      {children}
    </HomeSolarContext.Provider>
  );
}

export function useHomeSolar(): HomeSolarState {
  const context = useContext(HomeSolarContext);
  if (!context) {
    throw new Error("useHomeSolar must be used within a HomeSolarStateProvider");
  }
  return context;
}
