import { create } from "zustand";

import { createBuildSlice } from "./configurator/slices/buildSlice";
import { createLifecycleSlice } from "./configurator/slices/lifecycleSlice";
import { createRoofSlice } from "./configurator/slices/roofSlice";
import { createWizardSlice } from "./configurator/slices/wizardSlice";
import type { ConfiguratorStoreState } from "./configurator/types";

export {
  getAggregateAnalytics,
  type AggregateAnalytics,
  type RoofAnalytics,
} from "./configurator/analytics";
export type {
  BuildSlice,
  ConfiguratorLifecycleSlice,
  ConfiguratorStoreState,
  ElectricalPhase,
  RoofPanel,
  RoofPoint,
  RoofSection,
  RoofSlice,
  RoofStateUpdate,
  RoofString,
  SelectedComponents,
  WizardAnswerMap,
  WizardAnswerValue,
  WizardSlice,
} from "./configurator/types";

export type ConfiguratorState = ConfiguratorStoreState;

/**
 * Compatibility facade for the existing configurator, wizard, and visualizer
 * consumers. The public hook and its static Zustand helpers remain unchanged
 * while state ownership is split into typed domain slices internally.
 */
export const useConfiguratorStore = create<ConfiguratorStoreState>()(
  (...storeArguments) => ({
    ...createBuildSlice(...storeArguments),
    ...createRoofSlice(...storeArguments),
    ...createWizardSlice(...storeArguments),
    ...createLifecycleSlice(...storeArguments),
  }),
);
