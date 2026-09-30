import { expect, it } from "vitest";
import type { Order } from "../../orders/model/order";
import { sessionAccount } from "./sessionAccount";

export const accountOrder = (
  id: string,
  total: number,
  extra: Partial<Order> = {},
): Order => ({
  id,
  placeId: "one",
  serviceSessionId: "ABC",
  tableId: "table05",
  customerUid: null,
  serviceType: "table",
  status: "pending",
  items: [
    {
      menuItemId: "item",
      name: "Produto",
      quantity: 1,
      unitPrice: total,
      total,
    },
  ],
  subtotal: total,
  total,
  notes: "",
  createdAt: new Date(Number(id) || 0),
  updatedAt: new Date(0),
  ...extra,
});
it("totals the table example and isolates sessions and places", () => {
  const orders = [
    accountOrder("100", 36),
    accountOrder("112", 42),
    accountOrder("130", 18),
    accountOrder("150", 20, {
      serviceSessionId: "DEF",
      tableId: null,
      serviceType: "counter",
    }),
    accountOrder("161", 32, {
      serviceSessionId: "DEF",
      tableId: null,
      serviceType: "counter",
    }),
    accountOrder("200", 99, { placeId: "two" }),
  ];
  const account = sessionAccount({ id: "ABC", placeId: "one" }, orders);
  expect(account.totalCents).toBe(9600);
  expect(account.orders.map((order) => order.id)).toEqual([
    "100",
    "112",
    "130",
  ]);
  expect(sessionAccount({ id: "DEF", placeId: "one" }, orders).totalCents).toBe(
    5200,
  );
});
it("excludes cancelled orders but retains them in history, including zero-valued orders", () => {
  const orders = [
    accountOrder("1", 0.1),
    accountOrder("2", 0.2, { status: "delivered" }),
    accountOrder("3", 50, { status: "cancelled" }),
    accountOrder("4", 0),
  ];
  const account = sessionAccount({ id: "ABC", placeId: "one" }, orders);
  expect(account.totalCents).toBe(30);
  expect(account.orders).toHaveLength(4);
  expect(orders[2].total).toBe(50);
});
it("empty session totals zero only for a complete supplied collection", () => {
  expect(sessionAccount({ id: "empty", placeId: "one" }, []).totalCents).toBe(
    0,
  );
});
it("rejects corrupt totals and duplicate records instead of overstating a bill", () => {
  for (const total of [NaN, Infinity, -1, 0.001, Number.MAX_SAFE_INTEGER])
    expect(() =>
      sessionAccount({ id: "ABC", placeId: "one" }, [accountOrder("1", total)]),
    ).toThrow();
  expect(() =>
    sessionAccount({ id: "ABC", placeId: "one" }, [
      accountOrder("1", 18),
      accountOrder("1", 18),
    ]),
  ).toThrow("duplicado");
});
