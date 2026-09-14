export type Money = Readonly<{ currency: string; minorUnits: number }>;
export type CatalogVersion = Readonly<{ id: string; publishedAt: Date }>;
export type Availability = "AVAILABLE" | "LOW_STOCK" | "UNAVAILABLE";
export type CatalogItem = Readonly<{
  id: string;
  name: string;
  brand: string;
  model: string;
  availability: Availability;
}>;
export type TaxPolicy = Readonly<{
  id: string;
  code: string;
  rate: string;
  mode: "INCLUSIVE" | "EXCLUSIVE" | "EXEMPT";
}>;
export type PriceList = Readonly<{
  id: string;
  code: string;
  name: string;
  currency: string;
  taxInclusive: boolean;
}>;
export type CompatibilityRule = Readonly<{
  sourceItemId: string;
  targetItemId: string;
  relationship: "REQUIRES" | "COMPATIBLE_WITH" | "EXCLUDES" | "REPLACES";
  minimumQuantity: number | null;
  maximumQuantity: number | null;
}>;
export type CommercialLine = Readonly<{
  itemId: string;
  quantity: number;
  unitPrice: Money;
  subtotal: Money;
  tax: Money;
  total: Money;
}>;
export type ResolvedCommercials = Readonly<{
  catalogVersion: CatalogVersion;
  priceList: PriceList;
  taxPolicy: TaxPolicy | null;
  lines: readonly CommercialLine[];
  subtotal: Money;
  discount: Money;
  tax: Money;
  total: Money;
}>;
