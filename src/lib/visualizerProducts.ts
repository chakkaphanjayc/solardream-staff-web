export interface VisualizerPanelProduct {
  id: string;
  name: string;
  brand: string;
  model: string;
  type: "mono" | "poly" | "thin-film";
  width: number;
  height: number;
  power: number;
  price: number;
  desc: string;
  source: "ERPNext";
}

interface ProductLike {
  id: string;
  brand: string;
  model: string;
  price: number;
  description?: string | null;
  physicalWidth?: number | null;
  physicalLength?: number | null;
  wattageCapacity?: number | null;
  metadata?: unknown;
  category?: {
    name?: string | null;
    slug?: string | null;
  } | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberFromMetadata(metadata: Record<string, unknown>, keys: string[], fallback: number) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[^\d.]/g, ""));
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }

  return fallback;
}

function inferPanelType(product: ProductLike): VisualizerPanelProduct["type"] {
  const text = `${product.brand} ${product.model} ${product.description ?? ""}`.toLowerCase();
  if (text.includes("thin") || text.includes("film") || text.includes("flex")) return "thin-film";
  if (text.includes("poly")) return "poly";
  return "mono";
}

export function isPanelProduct(product: ProductLike) {
  const category = `${product.category?.name ?? ""} ${product.category?.slug ?? ""}`.toLowerCase();
  const label = `${product.brand} ${product.model} ${product.description ?? ""}`.toLowerCase();
  return /panel|module|solar|pv|แผง/.test(`${category} ${label}`);
}

export function mapProductToVisualizerPanel(product: ProductLike): VisualizerPanelProduct {
  const metadata = asRecord(product.metadata);
  const power = product.wattageCapacity ?? numberFromMetadata(metadata, ["wattage", "watts", "power", "wp"], 550);
  const width = product.physicalWidth ?? numberFromMetadata(metadata, ["widthM", "width", "moduleWidth"], 1.13);
  const height = product.physicalLength ?? numberFromMetadata(metadata, ["heightM", "length", "moduleLength"], 2.28);

  return {
    id: product.id,
    name: `${product.brand} ${product.model}`.trim(),
    brand: product.brand,
    model: product.model,
    type: inferPanelType(product),
    width,
    height,
    power,
    price: product.price,
    desc: product.description || `${power}W solar module from active inventory`,
    source: "ERPNext",
  };
}

// Kept as a compatibility export for older visualizer callers. It is empty by
// design: the visualizer must never present an application-owned product.
export const fallbackVisualizerPanels: VisualizerPanelProduct[] = [];
