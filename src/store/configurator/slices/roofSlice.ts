import { createDefaultRoofSection } from "../defaults";
import type {
  ConfiguratorSliceCreator,
  ElectricalPhase,
  RoofPanel,
  RoofPoint,
  RoofSlice,
  RoofStateUpdate,
  RoofString,
} from "../types";

export const createRoofSlice: ConfiguratorSliceCreator<RoofSlice> = (set) => ({
  roofs: [createDefaultRoofSection()],
  latitude: 13.7563,
  longitude: 100.5018,
  electricalPhase: "1-Phase",

  setRoofs: (roofs: RoofStateUpdate) =>
    set((state) => ({
      roofs: typeof roofs === "function" ? roofs(state.roofs) : roofs,
    })),

  updateRoofName: (id: string, name: string) =>
    set((state) => ({
      roofs: state.roofs.map((roof) =>
        roof.id === id ? { ...roof, name } : roof,
      ),
    })),

  setCoordinates: (latitude: number, longitude: number) =>
    set({ latitude, longitude }),

  updateRoofSetback: (
    id: string,
    setbackMargin: number,
    setbackPolygonPoints: RoofPoint[],
  ) =>
    set((state) => ({
      roofs: state.roofs.map((roof) =>
        roof.id === id
          ? { ...roof, setbackMargin, setbackPolygonPoints }
          : roof,
      ),
    })),

  updateRoofObstacles: (id: string, obstacles: RoofPoint[][]) =>
    set((state) => ({
      roofs: state.roofs.map((roof) =>
        roof.id === id ? { ...roof, obstacles } : roof,
      ),
    })),

  updateRoofStrings: (id: string, strings: RoofString[]) =>
    set((state) => ({
      roofs: state.roofs.map((roof) =>
        roof.id === id ? { ...roof, strings } : roof,
      ),
    })),

  setElectricalPhase: (electricalPhase: ElectricalPhase) =>
    set({ electricalPhase }),

  updateRoofPanels: (id: string, panels: RoofPanel[]) =>
    set((state) => ({
      roofs: state.roofs.map((roof) =>
        roof.id === id ? { ...roof, panels } : roof,
      ),
    })),
});
