import type {
  ConfiguratorSliceCreator,
  WizardAnswerValue,
  WizardSlice,
} from "../types";

export const createWizardSlice: ConfiguratorSliceCreator<WizardSlice> = (
  set,
) => ({
  wizardAnswers: {},

  updateDynamicState: (key: string, value: WizardAnswerValue) =>
    set((state) => ({
      wizardAnswers: {
        ...state.wizardAnswers,
        [key]: value,
      },
    })),

  applyWizardToVisualizer: () =>
    set((state) => ({
      electricalPhase:
        state.wizardAnswers.electricalPhase === "3-Phase"
          ? "3-Phase"
          : "1-Phase",
    })),
});
