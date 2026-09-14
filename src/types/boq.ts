export type BoqLineSource = "BUNDLE" | "ADDON";

export interface BoqLine {
  id: string;
  source: BoqLineSource;
  itemCode: string;
  itemName: string;
  description: string | null;
  qty: number;
  uom: string;
  rate: number;
  cost?: number | null;
  stockQty?: number;
  warehouse: string | null;
}

export interface BoqTotals {
  basePackagePrice: number;
  addonPrice: number;
  grandTotal: number;
}

export interface ErpnextQuotationItemPayload {
  item_code: string;
  qty: number;
  uom: string;
  rate: number;
  warehouse?: string;
}

export interface ErpnextQuotationPayload {
  quotation_to: "Customer";
  party_name: string;
  company: string;
  transaction_date: string;
  valid_till: string;
  order_type: "Sales";
  currency: string;
  selling_price_list: string;
  remarks: string;
  items: ErpnextQuotationItemPayload[];
}

export interface BoqTemplate {
  bundleItemCode: string;
  bundleName: string;
  currency: string;
  sellingPriceList: string;
  lines: BoqLine[];
}
