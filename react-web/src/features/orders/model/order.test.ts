import { expect, it } from "vitest";
import {
  nextOrderStatus,
  orderLocation,
  orderStatuses,
  orderSubtotal,
  snapshotOrderItem,
  validateOrderInput,
  validateOrderTransition,
} from "./order";

it("preserves product snapshots and computes money in cents", () => {
  const product = { name: "IPA 500ml", price: 18 };
  const item = snapshotOrderItem("ipa", product, 2);
  product.price = 25;
  product.name = "Novo nome";
  expect(item).toEqual({
    menuItemId: "ipa",
    name: "IPA 500ml",
    quantity: 2,
    unitPrice: 18,
    total: 36,
  });
  expect(
    orderSubtotal([
      snapshotOrderItem("a", { name: "A", price: 0.1 }, 3),
      snapshotOrderItem("b", { name: "B", price: 0.2 }, 1),
    ]),
  ).toBe(0.5);
});
it("accepts anonymous orders without any table input", () => {
  expect(
    validateOrderInput({
      serviceSessionId: "s",
      items: [{ menuItemId: "ipa", quantity: 2 }],
      notes: "  gelo  ",
    }),
  ).toEqual({
    serviceSessionId: "s",
    customerUid: null,
    items: [{ menuItemId: "ipa", quantity: 2 }],
    notes: "gelo",
  });
  expect(orderLocation({ serviceType: "counter", tableId: null })).toBe(
    "Balcão",
  );
  expect(orderLocation({ serviceType: "lounge", tableId: null })).toBe("Salão");
  expect(
    orderLocation({ serviceType: "table", tableId: "t" }, [
      { id: "t", number: 5 },
    ]),
  ).toBe("Mesa 05");
});
it("rejects empty orders, duplicates, invalid identifiers, money and quantities", () => {
  const input = {
    serviceSessionId: "s",
    items: [{ menuItemId: "ipa", quantity: 2 }],
    notes: "",
  };
  for (const change of [
    { items: [] },
    { serviceSessionId: "a/b" },
    { notes: "x".repeat(2001) },
    { items: [input.items[0], input.items[0]] },
    {
      items: Array.from({ length: 6 }, (_, i) => ({
        menuItemId: `${i}`,
        quantity: 1,
      })),
    },
  ])
    expect(() => validateOrderInput({ ...input, ...change })).toThrow();
  for (const quantity of [0, -1, 1.5, Infinity, NaN, 1000])
    expect(() =>
      snapshotOrderItem("ipa", { name: "IPA", price: 18 }, quantity),
    ).toThrow();
  for (const price of [-1, NaN, Infinity, 0.001, 1000000])
    expect(() => snapshotOrderItem("ipa", { name: "IPA", price }, 1)).toThrow();
});
it("permits only sequential status changes or cancellation before delivery", () => {
  for (const current of orderStatuses)
    for (const next of orderStatuses) {
      const allowed =
        nextOrderStatus(current) === next ||
        (next === "cancelled" &&
          current !== "cancelled" &&
          current !== "delivered");
      if (allowed)
        expect(() => validateOrderTransition(current, next)).not.toThrow();
      else expect(() => validateOrderTransition(current, next)).toThrow();
    }
});
