"use client";

import { useCallback, useMemo, useState } from "react";
import { useSolarHome } from "@/components/home/solar-home-context";
import {
  calculateJourneyRoofPotential,
  calculateJourneySimulation,
  type JourneyAppliances,
  type JourneyDirection,
  type JourneyShade,
  type JourneyTilt,
  type JourneySimulationResult,
} from "@/lib/solar/journey-simulation";

export type SolarJourneyState = Readonly<{
  solarSizeKwp: number;
  setSolarSizeKwp: (value: number) => void;
  sunProgress: number;
  setSunProgress: (value: number) => void;
  roofDirection: JourneyDirection;
  setRoofDirection: (value: JourneyDirection) => void;
  roofTilt: JourneyTilt;
  setRoofTilt: (value: JourneyTilt) => void;
  shade: JourneyShade;
  setShade: (value: JourneyShade) => void;
  appliances: JourneyAppliances;
  toggleAppliance: (key: keyof JourneyAppliances) => void;
  batteryEnabled: boolean;
  setBatteryEnabled: (value: boolean) => void;
  roofPotential: number;
  simulation: JourneySimulationResult;
  eveningSimulation: JourneySimulationResult;
}>;

const INITIAL_APPLIANCES: JourneyAppliances = {
  airConditioner: true,
  evCharger: false,
  waterHeater: false,
  poolPump: false,
};

export function useSolarJourney(): SolarJourneyState {
  const { solarSizeKwp, setSolarSizeKwp, weather } = useSolarHome();
  const [sunProgress, setSunProgress] = useState(0.5);
  const [roofDirection, setRoofDirection] = useState<JourneyDirection>("south");
  const [roofTilt, setRoofTilt] = useState<JourneyTilt>(30);
  const [shade, setShade] = useState<JourneyShade>("clear");
  const [appliances, setAppliances] =
    useState<JourneyAppliances>(INITIAL_APPLIANCES);
  const [batteryEnabled, setBatteryEnabled] = useState(false);

  const toggleAppliance = useCallback((key: keyof JourneyAppliances) => {
    setAppliances((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  const roofPotential = useMemo(
    () => calculateJourneyRoofPotential(roofDirection, roofTilt, shade),
    [roofDirection, roofTilt, shade],
  );

  const simulation = useMemo(
    () =>
      calculateJourneySimulation({
        systemSizeKwp: solarSizeKwp,
        sunlightIndexPercent: weather.sunlightIndexPercent,
        // The balance scenes use a representative midday snapshot. The sun
        // story has its own scroll-controlled readout, so leaving the story
        // at 18:00 should not make the later energy lesson look "broken".
        hour: 12,
        direction: roofDirection,
        tilt: roofTilt,
        shade,
        batteryEnabled,
        appliances,
      }),
    [
      appliances,
      batteryEnabled,
      roofDirection,
      roofTilt,
      shade,
      solarSizeKwp,
      weather.sunlightIndexPercent,
    ],
  );

  const eveningSimulation = useMemo(
    () =>
      calculateJourneySimulation({
        systemSizeKwp: solarSizeKwp,
        sunlightIndexPercent: weather.sunlightIndexPercent,
        hour: 18,
        direction: roofDirection,
        tilt: roofTilt,
        shade,
        batteryEnabled,
        appliances,
      }),
    [
      appliances,
      batteryEnabled,
      roofDirection,
      roofTilt,
      shade,
      solarSizeKwp,
      weather.sunlightIndexPercent,
    ],
  );

  return {
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
  };
}
