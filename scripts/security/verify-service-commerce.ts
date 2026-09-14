import { calculateFormulaPrice, createServiceOrderSchema, selectServicePrice, serviceBookingSchema, serviceQuoteSchema } from "../../src/lib/serviceCommerceContracts";

const contact = { name: "Solar Customer", phone: "0800000000", email: "customer@example.com" };
const bookingContact = { fullName: "Solar Customer", phone: "0800000000", email: "customer@example.com", serviceAddress: "123 Example Road, Bangkok" };
const idempotencyKey = "00000000-0000-4000-8000-000000000002";
createServiceOrderSchema.parse({ idempotencyKey, offeringSlug: "deep-clean", appointmentDate: "2030-01-01", contact, systemSource: "SOLARDREAM", assetId: "00000000-0000-4000-8000-000000000001" });
createServiceOrderSchema.parse({ idempotencyKey, offeringSlug: "deep-clean", appointmentDate: "2030-01-01", contact, systemSource: "EXTERNAL", systemDetails: { systemSizeKw: 5, inverterBrand: "Example", roofType: "Tile" } });
if (selectServicePrice("SOLARDREAM", { solarDreamCustomerPrice: "1200.00", externalPrice: "1500.00" }) !== "1200.00") throw new Error("SolarDream pricing contract failed.");
if (selectServicePrice("EXTERNAL", { solarDreamCustomerPrice: "1200.00", externalPrice: "1500.00" }) !== "1500.00") throw new Error("External pricing contract failed.");
const invalidExternal = createServiceOrderSchema.safeParse({ idempotencyKey, offeringSlug: "deep-clean", appointmentDate: "2030-01-01", contact, systemSource: "EXTERNAL", assetId: "00000000-0000-4000-8000-000000000001" });
if (invalidExternal.success) throw new Error("External asset ID was accepted.");
serviceQuoteSchema.parse({ offeringSlug: "deep-clean", systemSource: "EXTERNAL", systemDetails: { systemSizeKw: 5, inverterBrand: "Example", roofType: "Tile" } });
serviceBookingSchema.parse({ offeringSlug: "deep-clean", systemSource: "EXTERNAL", systemDetails: { systemSizeKw: 5, inverterBrand: "Example", roofType: "Tile" }, locale: "th", appointmentDate: "2030-01-01", contact: bookingContact, necessaryConsent: true });
const deepClean = { basePrice: "500.00", ratePerKwp: "200.00", minimumPrice: "1200.00", loyaltyDiscount: "300.00" };
if (calculateFormulaPrice(deepClean, 5, false) !== "1500.00" || calculateFormulaPrice(deepClean, 5, true) !== "1200.00") throw new Error("5kW formula/loyalty pricing contract failed.");
if (serviceBookingSchema.safeParse({ offeringSlug: "deep-clean", systemSource: "EXTERNAL", systemDetails: { systemSizeKw: 5, inverterBrand: "Example", roofType: "Tile" }, locale: "th", appointmentDate: "2030-01-01", contact: bookingContact, necessaryConsent: true, website: "spam" }).success) throw new Error("Honeypot accepted bot input.");
process.stdout.write("Service commerce DTO and server-pricing contracts passed.\n");
