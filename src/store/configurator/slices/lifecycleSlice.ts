import {
  createDefaultRoofSection,
  INITIAL_SELECTED_COMPONENTS,
} from "../defaults";
import type {
  ConfiguratorLifecycleSlice,
  ConfiguratorSliceCreator,
} from "../types";

export const createLifecycleSlice: ConfiguratorSliceCreator<
  ConfiguratorLifecycleSlice
> = (set) => ({
  reset: () =>
    set({
      selectedComponents: INITIAL_SELECTED_COMPONENTS,
      totalPrice: 0,
      isMobileSummaryOpen: false,
      panelCount: 1,
      roofs: [createDefaultRoofSection()],
    }),
});
