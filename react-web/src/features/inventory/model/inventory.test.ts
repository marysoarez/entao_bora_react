import { expect, it } from "vitest";
import {
  quantityMilli,
  movementDelta,
  stockAfter,
  validateItem,
  validateRecipe,
  recipeRequirements,
  type InventoryItem,
  type Recipe,
} from "./inventory";
const item = (id: string, unit: InventoryItem["unit"]): InventoryItem => ({
  id,
  name: id,
  unit,
  active: true,
  stockMilli: 0,
  minimumMilli: 0,
  lastMovementId: null,
});
it("represents quantities exactly in thousandths and rejects imprecise or invalid values", () => {
  expect(quantityMilli("50")).toBe(50000);
  expect(quantityMilli("0,125")).toBe(125);
  expect(quantityMilli("-2.500")).toBe(-2500);
  for (const value of ["", "NaN", "Infinity", "1.0001", "1e3", "1000000001"])
    expect(() => quantityMilli(value)).toThrow();
});
it("separates entries, exits, losses and signed adjustments, refusing negative stock", () => {
  expect(movementDelta("entry", 1000)).toBe(1000);
  expect(movementDelta("exit", 1000)).toBe(-1000);
  expect(movementDelta("loss", 1000)).toBe(-1000);
  expect(movementDelta("adjustment", -1000)).toBe(-1000);
  expect(stockAfter(50000, -125)).toBe(49875);
  expect(() => stockAfter(0, -1)).toThrow();
  expect(() => movementDelta("entry", -1)).toThrow();
  expect(() => movementDelta("loss", 0)).toThrow();
});
it("validates minimum stock and supported units independently from menu products", () => {
  expect(
    validateItem({
      name: " Limão ",
      unit: "un",
      minimumMilli: 1000,
      active: true,
    }).name,
  ).toBe("Limão");
  expect(() =>
    validateItem({ name: "", unit: "un", minimumMilli: 0, active: true }),
  ).toThrow();
  expect(() =>
    validateItem({ name: "X", unit: "ml", minimumMilli: -1, active: true }),
  ).toThrow();
});
it("plans two caipirinhas from four ingredients without mutating stock", () => {
  const items = [
    item("lime", "un"),
    item("spirit", "ml"),
    item("sugar", "g"),
    item("ice", "g"),
  ];
  const components = {
    lime: { unit: "un" as const, quantityMilli: 1000 },
    spirit: { unit: "ml" as const, quantityMilli: 50000 },
    sugar: { unit: "g" as const, quantityMilli: 20000 },
    ice: { unit: "g" as const, quantityMilli: 100000 },
  };
  validateRecipe(components, items);
  expect(
    recipeRequirements(
      { menuItemId: "caipirinha", revision: 1, active: true, components },
      2,
    ),
  ).toEqual([
    { itemId: "lime", unit: "un", requiredMilli: 2000 },
    { itemId: "spirit", unit: "ml", requiredMilli: 100000 },
    { itemId: "sugar", unit: "g", requiredMilli: 40000 },
    { itemId: "ice", unit: "g", requiredMilli: 200000 },
  ]);
  expect(items.every((row) => row.stockMilli === 0)).toBe(true);
});
it("rejects missing ingredients, incompatible units, empty and oversized recipes", () => {
  const items = [item("lime", "un")];
  for (const components of [
    {},
    { lime: { unit: "g" as const, quantityMilli: 1000 } },
    { missing: { unit: "un" as const, quantityMilli: 1000 } },
    { lime: { unit: "un" as const, quantityMilli: 0 } },
    Object.fromEntries(
      Array.from({ length: 6 }, (_, i) => [
        String(i),
        { unit: "g", quantityMilli: 1000 },
      ]),
    ) as Recipe["components"],
  ])
    expect(() => validateRecipe(components, items)).toThrow();
});
