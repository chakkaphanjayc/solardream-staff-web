import type {
  SolarAddonConfig,
  SolarAddonOption,
} from "@/lib/solarAddonConfig";

export type SelectedSolarAddon = {
  addon: SolarAddonConfig;
  option: SolarAddonOption | null;
};

const FALLBACK_BATTERY_OPTIONS: SolarAddonOption[] = [
  {
    id: "battery5k",
    label: "5 kWh",
    price: 65000,
    description: "Compact backup storage for essential loads.",
  },
  {
    id: "battery10k",
    label: "10 kWh",
    price: 115000,
    description: "More evening coverage for a larger home.",
  },
  {
    id: "battery16k",
    label: "16 kWh",
    price: 175000,
    description: "Extended backup capacity for higher loads.",
  },
];

const FALLBACK_BATTERY_ADDON: SolarAddonConfig = {
  id: "battery-storage",
  name: "Battery storage",
  shortLabel: "Battery storage",
  description: "เก็บพลังงานไว้ใช้ช่วงกลางคืนหรือเมื่อไฟฟ้าดับ",
  category: "BATTERY",
  inputType: "SELECT",
  optionsList: FALLBACK_BATTERY_OPTIONS,
  isRecommended: false,
  isVisible: true,
};

export function isSolarBatteryAddon(addon: SolarAddonConfig) {
  return addon.category === "BATTERY" || addon.id.toLowerCase().includes("battery");
}

function hasOptions(addon: SolarAddonConfig): addon is SolarAddonConfig & {
  optionsList: SolarAddonOption[];
} {
  return Boolean(addon.optionsList && addon.optionsList.length > 0);
}

/**
 * Returns the public catalog used by every customer-facing configurator.
 * Battery products from ERPNext may not have option metadata yet, so keep the
 * same safe sizing choices that the existing Build flow already supports.
 */
export function getSolarAddonsForDisplay(
  addons: readonly SolarAddonConfig[] | null | undefined,
): SolarAddonConfig[] {
  const visible = (addons ?? []).filter((addon) => addon.isVisible !== false);
  const batteryIndex = visible.findIndex(isSolarBatteryAddon);

  if (batteryIndex === -1) {
    return [...visible, FALLBACK_BATTERY_ADDON];
  }

  return visible.map((addon, index) => {
    if (index !== batteryIndex || hasOptions(addon)) return addon;

    return {
      ...addon,
      inputType: "SELECT",
      optionsList: FALLBACK_BATTERY_OPTIONS,
    };
  });
}

export function getSolarAddonRelatedIds(addon: SolarAddonConfig): Set<string> {
  const relatedIds = new Set<string>([addon.id]);
  addon.optionsList?.forEach((option) => {
    relatedIds.add(option.id);
    relatedIds.add(`${addon.id}_${option.id}`);
  });
  return relatedIds;
}

export function getSolarAddonDefaultSelectionId(addon: SolarAddonConfig): string {
  if (!hasOptions(addon)) return addon.id;
  return (addon.optionsList.find((option) => option.isDefault) ?? addon.optionsList[0]).id;
}

export function getSelectedSolarAddon(
  addon: SolarAddonConfig,
  selectedIds: readonly string[],
): SelectedSolarAddon | null {
  const relatedIds = getSolarAddonRelatedIds(addon);
  const selectedId = selectedIds.find((id) => relatedIds.has(id));
  if (!selectedId) return null;

  const option = addon.optionsList?.find(
    (candidate) =>
      candidate.id === selectedId ||
      selectedId === `${addon.id}_${candidate.id}`,
  ) ?? (addon.inputType === "SELECT" ? addon.optionsList?.[0] ?? null : null);

  return { addon, option };
}

export function getSelectedSolarAddons(
  addons: readonly SolarAddonConfig[],
  selectedIds: readonly string[],
): SelectedSolarAddon[] {
  return addons.flatMap((addon) => {
    const selected = getSelectedSolarAddon(addon, selectedIds);
    return selected ? [selected] : [];
  });
}

export function toggleSolarAddonSelection(
  currentIds: readonly string[],
  addon: SolarAddonConfig,
): string[] {
  const relatedIds = getSolarAddonRelatedIds(addon);
  const filteredIds = currentIds.filter((id) => !relatedIds.has(id));
  const wasSelected = currentIds.some((id) => relatedIds.has(id));

  return wasSelected
    ? filteredIds
    : [...filteredIds, getSolarAddonDefaultSelectionId(addon)];
}

export function selectSolarAddonOption(
  currentIds: readonly string[],
  addon: SolarAddonConfig,
  optionId: string,
): string[] {
  const relatedIds = getSolarAddonRelatedIds(addon);
  if (!relatedIds.has(optionId)) return [...currentIds];

  return [
    ...currentIds.filter((id) => !relatedIds.has(id)),
    optionId,
  ];
}

export function getSolarAddonPrice(selected: SelectedSolarAddon): number {
  if (selected.option) return selected.option.price;
  return typeof selected.addon.price === "number" ? selected.addon.price : 0;
}

export function parseSolarAddonSelection(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

export function serializeSolarAddonSelection(ids: readonly string[]): string {
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean))).join(",");
}

export function getRecommendedSolarAddonSelection(
  addons: readonly SolarAddonConfig[],
): string[] {
  return addons
    .filter((addon) => addon.isVisible !== false && addon.isRecommended && !isSolarBatteryAddon(addon))
    .map(getSolarAddonDefaultSelectionId);
}
