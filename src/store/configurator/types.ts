import type { StateCreator } from "zustand";

import type { Component } from "@/types";

export type ElectricalPhase = "1-Phase" | "3-Phase";
export type WizardAnswerValue = string | number | boolean;
export type WizardAnswerMap = Record<string, WizardAnswerValue>;

export type RoofPoint = {
  x: number;
  y: number;
};

export type RoofPanel = RoofPoint & {
  id: string;
  rotation: number;
};

export type RoofString = {
  id: string;
  color: string;
  panelIndices: string[];
};

export interface RoofSection {
  id: string;
  name: string;
  width: number;
  height: number;
  pitch: number;
  roofOrientation: number;
  polygonPoints?: RoofPoint[];
  setbackMargin?: number;
  latitude?: number;
  longitude?: number;
  setbackPolygonPoints?: RoofPoint[];
  obstacles?: RoofPoint[][];
  bounds?: [[number, number], [number, number]];
  panelRotation: number;
  strings?: RoofString[];
  selectedPanels?: string[];
  customPanelPositions?: Record<string, RoofPoint>;
  panels?: RoofPanel[];
  roofType?: "concrete" | "metal";
}

export type SelectedComponents = Record<string, Component | null>;
export type RoofStateUpdate =
  | RoofSection[]
  | ((previousRoofs: RoofSection[]) => RoofSection[]);

export interface WizardSlice {
  wizardAnswers: WizardAnswerMap;
  updateDynamicState: (key: string, value: WizardAnswerValue) => void;
  applyWizardToVisualizer: () => void;
}

export interface BuildSlice {
  selectedComponents: SelectedComponents;
  totalPrice: number;
  isMobileSummaryOpen: boolean;
  panelCount: number;
  selectComponent: (component: Component) => void;
  removeComponent: (category: string) => void;
  setMobileSummaryOpen: (open: boolean) => void;
  setConfiguration: (components: SelectedComponents) => void;
  setPanelCount: (count: number) => void;
}

export interface RoofSlice {
  roofs: RoofSection[];
  latitude: number;
  longitude: number;
  electricalPhase: ElectricalPhase;
  setRoofs: (roofs: RoofStateUpdate) => void;
  updateRoofName: (id: string, name: string) => void;
  setCoordinates: (latitude: number, longitude: number) => void;
  updateRoofSetback: (
    id: string,
    margin: number,
    setbackPolygonPoints: RoofPoint[],
  ) => void;
  updateRoofObstacles: (id: string, obstacles: RoofPoint[][]) => void;
  updateRoofStrings: (id: string, strings: RoofString[]) => void;
  setElectricalPhase: (phase: ElectricalPhase) => void;
  updateRoofPanels: (id: string, panels: RoofPanel[]) => void;
}

export interface ConfiguratorLifecycleSlice {
  reset: () => void;
}

export type ConfiguratorStoreState = WizardSlice &
  BuildSlice &
  RoofSlice &
  ConfiguratorLifecycleSlice;

export type ConfiguratorSliceCreator<TSlice> = StateCreator<
  ConfiguratorStoreState,
  [],
  [],
  TSlice
>;
