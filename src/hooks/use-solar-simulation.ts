"use client";

import { useMemo, useState } from "react";
import { useSolarHome } from "@/components/home/solar-home-context";
import {
  calculateHomeSolarSimulation,
  type SolarSimulationAppliances,
  type SolarSimulationBattery,
  type SolarSimulationCondition,
  type SolarSimulationResult,
  type SolarSimulationTilt,
} from "@/lib/solar/home-simulation";

export type SolarSimulationState = Readonly<{
  hour: number;
  setHour: (value: number) => void;
  roofTilt: SolarSimulationTilt;
  setRoofTilt: (value: SolarSimulationTilt) => void;
  panelCondition: SolarSimulationCondition;
  setPanelCondition: (value: SolarSimulationCondition) => void;
  batteryCapacityKwh: SolarSimulationBattery;
  setBatteryCapacityKwh: (value: SolarSimulationBattery) => void;
  appliances: SolarSimulationAppliances;
  toggleAppliance: (key: keyof SolarSimulationAppliances) => void;
  result: SolarSimulationResult;
}>;

const DEFAULT_APPLIANCES: SolarSimulationAppliances = {
  airConditioner: true,
  evCharger: false,
  waterHeater: false,
};

export function useSolarSimulation(): SolarSimulationState {
  const { solarSizeKwp, weather } = useSolarHome();
  const [hour, setHour] = useState(12);
  const [roofTilt, setRoofTilt] = useState<SolarSimulationTilt>(15);
  const [panelCondition, setPanelCondition] = useState<SolarSimulationCondition>("clean");
  const [batteryCapacityKwh, setBatteryCapacityKwh] = useState<SolarSimulationBattery>(5);
  const [appliances, setAppliances] = useState<SolarSimulationAppliances>(DEFAULT_APPLIANCES);

  const result = useMemo(
    () => calculateHomeSolarSimulation({
      systemSizeKwp: solarSizeKwp,
      sunlightIndexPercent: weather.sunlightIndexPercent,
      hour,
      roofTilt,
      panelCondition,
      batteryCapacityKwh,
      appliances,
    }),
    [appliances, batteryCapacityKwh, hour, panelCondition, roofTilt, solarSizeKwp, weather.sunlightIndexPercent],
  );

  const toggleAppliance = (key: keyof SolarSimulationAppliances) => {
    setAppliances((current) => ({ ...current, [key]: !current[key] }));
  };

  return {
    hour,
    setHour,
    roofTilt,
    setRoofTilt,
    panelCondition,
    setPanelCondition,
    batteryCapacityKwh,
    setBatteryCapacityKwh,
    appliances,
    toggleAppliance,
    result,
  };
}
