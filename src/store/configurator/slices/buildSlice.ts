import type { Component } from "@/types";

import { INITIAL_SELECTED_COMPONENTS } from "../defaults";
import type {
  BuildSlice,
  ConfiguratorSliceCreator,
  SelectedComponents,
} from "../types";

const SOLAR_PANEL_CATEGORY = "Solar Panels Selection";

function calculateTotalPrice(
  components: SelectedComponents,
  panelCount: number,
) {
  const panel = components[SOLAR_PANEL_CATEGORY];
  const otherTotal = Object.entries(components)
    .filter(([category]) => category !== SOLAR_PANEL_CATEGORY)
    .reduce((sum, [, item]) => sum + (item?.price || 0), 0);
  const panelPrice =
    panel && panel.id !== "none" ? panel.price * panelCount : 0;

  return otherTotal + panelPrice;
}

export const createBuildSlice: ConfiguratorSliceCreator<BuildSlice> = (set) => ({
  selectedComponents: INITIAL_SELECTED_COMPONENTS,
  totalPrice: 0,
  isMobileSummaryOpen: false,
  panelCount: 1,

  selectComponent: (component: Component) =>
    set((state) => {
      const selectedComponents = {
        ...state.selectedComponents,
        [component.category]: component,
      };

      return {
        selectedComponents,
        totalPrice: calculateTotalPrice(selectedComponents, state.panelCount),
      };
    }),

  removeComponent: (category: string) =>
    set((state) => {
      const selectedComponents = {
        ...state.selectedComponents,
        [category]: null,
      };

      return {
        selectedComponents,
        totalPrice: calculateTotalPrice(selectedComponents, state.panelCount),
      };
    }),

  setMobileSummaryOpen: (isMobileSummaryOpen: boolean) =>
    set({ isMobileSummaryOpen }),

  setConfiguration: (selectedComponents: SelectedComponents) =>
    set((state) => ({
      selectedComponents,
      totalPrice: calculateTotalPrice(selectedComponents, state.panelCount),
    })),

  setPanelCount: (panelCount: number) =>
    set((state) => ({
      panelCount,
      totalPrice: calculateTotalPrice(state.selectedComponents, panelCount),
    })),
});
