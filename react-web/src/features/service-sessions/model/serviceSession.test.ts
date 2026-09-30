import { expect, it } from "vitest";
import {
  validateServiceSessionInput,
  validateSessionTransition,
  type ServiceType,
} from "./serviceSession";
it.each(["counter", "lounge", "takeaway"] as const)(
  "supports anonymous groups without tables: %s",
  (serviceType) => {
    expect(
      validateServiceSessionInput({
        serviceType,
        tableId: null,
        customerCount: 6,
      }),
    ).toEqual({ serviceType, tableId: null, customerCount: 6 });
    expect(() =>
      validateServiceSessionInput({
        serviceType,
        tableId: "t1",
        customerCount: 1,
      }),
    ).toThrow();
  },
);
it("requires a valid table only for table service", () => {
  expect(
    validateServiceSessionInput({
      serviceType: "table",
      tableId: "t1",
      customerCount: 2,
    }).tableId,
  ).toBe("t1");
  for (const tableId of [null, "", " ", "a/b"])
    expect(() =>
      validateServiceSessionInput({
        serviceType: "table",
        tableId,
        customerCount: 1,
      }),
    ).toThrow();
  expect(() =>
    validateServiceSessionInput({
      serviceType: "other" as ServiceType,
      tableId: null,
      customerCount: 1,
    }),
  ).toThrow();
});
it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
  "rejects invalid customer counts: %s",
  (customerCount) => {
    expect(() =>
      validateServiceSessionInput({
        serviceType: "lounge",
        tableId: null,
        customerCount,
      }),
    ).toThrow();
  },
);
it("allows closure and cancellation only once", () => {
  expect(() => validateSessionTransition("open", "closed")).not.toThrow();
  expect(() => validateSessionTransition("open", "cancelled")).not.toThrow();
  for (const current of ["closed", "cancelled"] as const)
    for (const next of ["closed", "cancelled"] as const)
      expect(() => validateSessionTransition(current, next)).toThrow();
});
