/**
 * Shared UI contract for add-ons returned by ERPNext Items.
 *
 * Pricing, identity, visibility, and option metadata are deliberately not
 * defined in this application. Keep this file type-only so a future feature
 * cannot accidentally reintroduce a second catalog source.
 */
export type SolarAddonOption = {
  id: string;
  label: string;
  price: number;
  description?: string;
  isDefault?: boolean;
  type?: "TOGGLE" | "SELECT";
};

export type SolarAddonConfig = {
  id: string;
  name: string;
  shortLabel: string;
  description: string;
  category: "SAFETY" | "GRID_COMPLIANCE" | "PROTECTION" | "EV_READY" | "CABLING" | "BATTERY";
  inputType: "TOGGLE" | "SELECT";
  price?: number;
  optionsList?: SolarAddonOption[];
  isRecommended: boolean;
  isVisible?: boolean;
};
