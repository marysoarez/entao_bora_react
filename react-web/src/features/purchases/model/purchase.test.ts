import { expect, it } from "vitest";
import {
  lowStockNeeds,
  purchaseLine,
  validatePurchaseItems,
  validateSupplier,
} from "./purchase";

it("calculates costs from thousandths and millionths without floating inventory quantities", () => {
  expect(purchaseLine(50_000, 25_000_000)).toBe(125_000);
  expect(purchaseLine(125, 1_000_000)).toBe(13);
  expect(() => purchaseLine(0, 1)).toThrow();
  expect(() => purchaseLine(1, -1)).toThrow();
});
it("validates a bounded order with distinct inventory ingredients", () => {
  expect(
    validatePurchaseItems([
      {
        inventoryItemId: "lime",
        quantityMilli: 10_000,
        unitCostMicros: 2_000_000,
      },
    ]),
  ).toHaveLength(1);
  expect(() => validatePurchaseItems([])).toThrow();
  expect(() =>
    validatePurchaseItems([
      { inventoryItemId: "lime", quantityMilli: 1, unitCostMicros: 1 },
      { inventoryItemId: "lime", quantityMilli: 1, unitCostMicros: 1 },
    ]),
  ).toThrow();
  expect(() =>
    validatePurchaseItems(
      Array.from({ length: 6 }, (_, i) => ({
        inventoryItemId: String(i),
        quantityMilli: 1,
        unitCostMicros: 1,
      })),
    ),
  ).toThrow();
});
it("derives purchase needs from current and minimum stock without creating orders", () => {
  expect(
    lowStockNeeds([
      { id: "low", active: true, stockMilli: 1_000, minimumMilli: 5_000 },
      { id: "equal", active: true, stockMilli: 5_000, minimumMilli: 5_000 },
      { id: "ok", active: true, stockMilli: 6_000, minimumMilli: 5_000 },
      { id: "inactive", active: false, stockMilli: 0, minimumMilli: 5_000 },
    ]),
  ).toEqual([
    { inventoryItemId: "low", missingToMinimumMilli: 4_000 },
    { inventoryItemId: "equal", missingToMinimumMilli: 0 },
  ]);
});
it("keeps supplier identity independent from purchase and inventory records", () => {
  expect(
    validateSupplier({
      name: " Distribuidora ",
      contact: "compras@example.com",
      active: true,
    }),
  ).toEqual({
    name: "Distribuidora",
    contact: "compras@example.com",
    active: true,
  });
  expect(() =>
    validateSupplier({ name: "", contact: "", active: true }),
  ).toThrow();
});
