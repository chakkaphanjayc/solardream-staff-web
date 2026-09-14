"use client";

import WeatherSunlightSimulatorHome from "@/components/home/WeatherSunlightSimulatorHome";

type HeroSectionProps = Readonly<{
  showAdminSimulator: boolean;
  solarSizeKw?: number;
  onSolarSizeChange?: (value: number) => void;
  hideInlineSelector?: boolean;
}>;

export default function HeroSection({
  showAdminSimulator,
  solarSizeKw,
  onSolarSizeChange,
  hideInlineSelector,
}: HeroSectionProps) {
  return (
    <WeatherSunlightSimulatorHome
      showAdminSimulator={showAdminSimulator}
      solarSizeKw={solarSizeKw}
      onSolarSizeChange={onSolarSizeChange}
      hideInlineSelector={hideInlineSelector}
    />
  );
}
