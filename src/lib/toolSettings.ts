/**
 * Shared type definitions and default values for ToolSettings.
 * This file is NOT a server action — it can be imported by both client and server modules.
 */
export interface ToolSettings {
  // Wizard algorithm constants
  wizardBaseCapacityRatio: number;
  wizardValueMultiplier: number;
  wizardBalancedMultiplier: number;
  wizardPremiumMultiplier: number;
  wizardSunHoursPerDay: number;
  wizardElectricityCostPerUnit: number;

  // Rooftop planner defaults & bounds
  plannerDefaultWidth: number;
  plannerDefaultHeight: number;
  plannerDefaultPitch: number;
  plannerMinWidth: number;
  plannerMaxWidth: number;
  plannerMinHeight: number;
  plannerMaxHeight: number;
  plannerMaxPitch: number;
}

export const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  wizardBaseCapacityRatio: 0.0001,
  wizardValueMultiplier: 0.9,
  wizardBalancedMultiplier: 1.0,
  wizardPremiumMultiplier: 1.25,
  wizardSunHoursPerDay: 5,
  wizardElectricityCostPerUnit: 4.5,

  plannerDefaultWidth: 10,
  plannerDefaultHeight: 6,
  plannerDefaultPitch: 15,
  plannerMinWidth: 4,
  plannerMaxWidth: 20,
  plannerMinHeight: 3,
  plannerMaxHeight: 15,
  plannerMaxPitch: 45,
};
