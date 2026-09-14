import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeSalesEmail, normalizeSalesPhone, salesCustomerLegacyKey } from "../customer-identity";
describe("sales customer identity normalization",()=>{
 it("normalizes email without implying uniqueness",()=>assert.equal(normalizeSalesEmail(" Shared@Example.COM "),"shared@example.com"));
 const cases: ReadonlyArray<readonly [string,string|null]> = [["081-234-5678","+66812345678"],["+66 81 234 5678","+66812345678"],["66 81 234 5678","+66812345678"],["",null],["123",null]];
 for (const [input, expected] of cases) it(`normalizes phone ${input}`,()=>assert.equal(normalizeSalesPhone(input),expected));
 it("groups only by ERP id when present",()=>{assert.equal(salesCustomerLegacyKey("b"," ERP-1 "),"ERP:ERP-1");assert.equal(salesCustomerLegacyKey("a",null),"USER:a");});
});
