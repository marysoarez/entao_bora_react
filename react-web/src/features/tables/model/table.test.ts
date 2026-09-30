import { describe, expect, it } from "vitest";
import { sortTables, validateTable, type PlaceTable } from "./table";

const input = { number: 5, name: "", capacity: 4, active: true };
describe("physical tables", () => {
  it("normalizes the name and only keeps physical fields", () => {
    expect(
      validateTable({ ...input, history: ["customer"] } as typeof input),
    ).toEqual({ ...input, name: "Mesa 05" });
    expect(validateTable({ ...input, name: "  Varanda  " }).name).toBe(
      "Varanda",
    );
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid number and capacity %s",
    (value) => {
      expect(() => validateTable({ ...input, number: value })).toThrow();
      expect(() => validateTable({ ...input, capacity: value })).toThrow();
    },
  );
  it("validates name and active without coercion", () => {
    expect(() => validateTable({ ...input, name: "x".repeat(101) })).toThrow();
    expect(() =>
      validateTable({ ...input, active: "true" as unknown as boolean }),
    ).toThrow();
    expect(validateTable({ ...input, active: false }).active).toBe(false);
  });
  it("orders numerically without mutating the list", () => {
    const tables = [10, 2, 1].map(
      (number) =>
        ({
          ...input,
          number,
          id: String(number),
          name: `Mesa ${number}`,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        }) satisfies PlaceTable,
    );
    expect(sortTables(tables).map((t) => t.number)).toEqual([1, 2, 10]);
    expect(tables.map((t) => t.number)).toEqual([10, 2, 1]);
  });
});
