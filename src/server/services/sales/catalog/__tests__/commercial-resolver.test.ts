import assert from "node:assert/strict";
import test from "node:test";
import {
  CommercialResolutionError,
  decimalToMinorUnits,
  resolveCommercials,
} from "../commercial-resolver";
const version = {
  id: "version",
  publishedAt: new Date("2026-01-01T00:00:00Z"),
};
const priceList = {
  id: "list",
  code: "STANDARD",
  name: "Standard",
  currency: "THB",
  taxInclusive: false,
};
test("converts decimal amounts without floating point drift", () => {
  assert.equal(decimalToMinorUnits("1250.05"), 125005);
  assert.throws(() => decimalToMinorUnits("1.001"), CommercialResolutionError);
});
test("resolves exclusive tax and stable totals", () => {
  const result = resolveCommercials({
    catalogVersion: version,
    priceList,
    taxPolicy: { id: "vat", code: "VAT7", rate: "0.07", mode: "EXCLUSIVE" },
    lines: [
      { itemId: "panel", quantity: 2, amount: "100.00", currency: "THB" },
    ],
  });
  assert.equal(result.subtotal.minorUnits, 20000);
  assert.equal(result.tax.minorUnits, 1400);
  assert.equal(result.total.minorUnits, 21400);
});
test("extracts inclusive tax without adding it twice", () => {
  const result = resolveCommercials({
    catalogVersion: version,
    priceList,
    taxPolicy: { id: "vat", code: "VAT7", rate: "0.07", mode: "INCLUSIVE" },
    lines: [
      { itemId: "panel", quantity: 1, amount: "107.00", currency: "THB" },
    ],
  });
  assert.equal(result.tax.minorUnits, 700);
  assert.equal(result.total.minorUnits, 10700);
});
test("rejects invalid quantity and currency", () => {
  assert.throws(
    () =>
      resolveCommercials({
        catalogVersion: version,
        priceList,
        taxPolicy: null,
        lines: [
          { itemId: "panel", quantity: 0, amount: "1.00", currency: "THB" },
        ],
      }),
    /Quantity/,
  );
  assert.throws(
    () =>
      resolveCommercials({
        catalogVersion: version,
        priceList,
        taxPolicy: null,
        lines: [
          { itemId: "panel", quantity: 1, amount: "1.00", currency: "USD" },
        ],
      }),
    /currency/,
  );
});
