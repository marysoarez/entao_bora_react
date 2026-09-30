import { expect, it } from "vitest";
import { validateCategory, validateProduct, menuOrder } from "./menu";
const product = {
  name: "IPA",
  description: "",
  active: true,
  available: true,
  price: 18.5,
  imageUrl: "",
  categoryId: "cat",
  order: 0,
};
it.each([-1, NaN, Infinity, 1.234, 1000000])(
  "rejects invalid prices %s",
  (price) => {
    expect(() => validateProduct({ ...product, price })).toThrow();
  },
);
it("accepts currency cents, free products and compressed images", () => {
  expect(validateProduct({ ...product, price: 0 }).price).toBe(0);
  expect(validateProduct({ ...product, price: 0.29 }).price).toBe(0.29);
  expect(
    validateProduct({ ...product, imageUrl: "data:image/jpeg;base64,YQ==" })
      .imageUrl,
  ).toContain("data:image");
  expect(() =>
    validateProduct({ ...product, imageUrl: "javascript:alert(1)" }),
  ).toThrow();
});
it("validates names, category, order and activation independently of availability", () => {
  expect(() => validateCategory({ ...product, name: " " })).toThrow();
  expect(() => validateProduct({ ...product, categoryId: "" })).toThrow();
  expect(() => validateProduct({ ...product, order: 1.5 })).toThrow();
  expect(
    validateProduct({ ...product, active: true, available: false }),
  ).toMatchObject({ active: true, available: false });
});
it("orders deterministically without modifying the source", () => {
  const rows = [
    { id: "b", order: 2 },
    { id: "a", order: 1 },
  ];
  expect(menuOrder(rows).map((row) => row.id)).toEqual(["a", "b"]);
  expect(rows[0].id).toBe("b");
});
