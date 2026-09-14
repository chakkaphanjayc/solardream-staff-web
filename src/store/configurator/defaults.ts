import type { RoofSection, SelectedComponents } from "./types";

export const INITIAL_SELECTED_COMPONENTS: SelectedComponents = {};

export function createDefaultRoofSection(): RoofSection {
  return {
    id: "roof-1",
    name: "หลังคาที่ 1 (Roof 1)",
    width: 10,
    height: 6,
    pitch: 15,
    roofOrientation: 180,
    panelRotation: 0,
    panels: [],
    roofType: "concrete",
  };
}
