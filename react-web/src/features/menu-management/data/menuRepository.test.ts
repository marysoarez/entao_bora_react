import { beforeEach, expect, it, vi } from "vitest";
import type { Transaction } from "firebase/firestore";
import { parseUser } from "../../../shared/domain";
const mocks = vi.hoisted(() => ({
  records: new Map<string, Record<string, unknown>>(),
  set: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("../../../core/firebase", () => ({
  database: () => ({}),
  assertProductWritesEnabled: () => {},
}));
vi.mock("firebase/firestore", async (original) => {
  const get = async (ref: { path: string }) => ({
    ref,
    id: ref.path.split("/").at(-1),
    exists: () => mocks.records.has(ref.path),
    data: () => mocks.records.get(ref.path),
  });
  return {
    ...(await original<typeof import("firebase/firestore")>()),
    doc: (parent: { path?: string }, ...parts: string[]) => {
      const path = parts.length ? parts.join("/") : `${parent.path}/generated`;
      return { path, id: path.split("/").at(-1) };
    },
    collection: (_db: unknown, ...parts: string[]) => ({
      path: parts.join("/"),
    }),
    getDoc: get,
    runTransaction: async (
      _db: unknown,
      callback: (tx: Transaction) => Promise<void>,
    ) =>
      callback({
        get,
        set: mocks.set,
        update: mocks.update,
        delete: mocks.remove,
      } as unknown as Transaction),
  };
});
import { MenuRepository } from "./menuRepository";
const owner = parseUser("owner", {});
const category = { name: "Bebidas", description: "", active: true, order: 0 };
const product = {
  ...category,
  categoryId: "cat",
  price: 18.5,
  imageUrl: "",
  available: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.records.clear();
  mocks.records.set("places/one", { ownerId: "owner", menuSchemaVersion: 2 });
  mocks.records.set("places/one/menuCategories/cat", {
    id: "cat",
    ...category,
  });
  mocks.records.set("places/one/menuCategoryUsage/cat", { count: 0 });
});
it("creates a product and updates category usage atomically", async () => {
  await MenuRepository.saveProduct("one", product, owner);
  expect(mocks.set.mock.calls[0][0].path).toBe(
    "places/one/menuItems/generated",
  );
  expect(mocks.set.mock.calls[0][1]).toMatchObject({
    ...product,
    id: "generated",
  });
  expect(mocks.update.mock.calls[0][1]).toMatchObject({
    count: 1,
    itemId: "generated",
  });
});
it("preserves product ID and createdAt during editing", async () => {
  mocks.records.set("places/one/menuItems/stable", {
    ...product,
    createdAt: new Date(1),
  });
  await MenuRepository.saveProduct(
    "one",
    { ...product, price: 20, active: false, available: false },
    owner,
    "stable",
  );
  expect(mocks.update.mock.calls[0][0].path).toBe(
    "places/one/menuItems/stable",
  );
  expect(mocks.update.mock.calls[0][1]).not.toHaveProperty("createdAt");
  expect(mocks.set).not.toHaveBeenCalled();
});
it("blocks deletion of a category containing products", async () => {
  mocks.records.set("places/one/menuCategoryUsage/cat", { count: 1 });
  await expect(
    MenuRepository.deleteCategory("one", "cat", owner),
  ).rejects.toThrow();
  expect(mocks.remove).not.toHaveBeenCalled();
  mocks.records.set("places/one/menuCategoryUsage/cat", { count: 0 });
  await MenuRepository.deleteCategory("one", "cat", owner);
  expect(mocks.remove).toHaveBeenCalledTimes(2);
});
it("imports legacy products once without overwriting legacy fields", async () => {
  mocks.records.set("places/one", {
    ownerId: "owner",
    menuCategories: [" Bebidas "],
    menuItems: [
      {
        id: "old",
        title: "IPA",
        description: "",
        price: 18.5,
        category: " Bebidas ",
        photo: "",
      },
    ],
  });
  await MenuRepository.initialize("one", owner);
  expect(
    mocks.set.mock.calls.find(
      ([ref]) => ref.path === "places/one/menuItems/old",
    )?.[1],
  ).toMatchObject({
    name: "IPA",
    price: 18.5,
    categoryId: "legacy-category-0",
  });
  expect(mocks.update.mock.calls[0][1]).toEqual({ menuSchemaVersion: 2 });
  vi.clearAllMocks();
  mocks.records.set("places/one", { ownerId: "owner", menuSchemaVersion: 2 });
  await MenuRepository.initialize("one", owner);
  expect(mocks.set).not.toHaveBeenCalled();
});
it.each(["employee", "outsider", "revoked"])(
  "denies edits for %s",
  async (role) => {
    if (role !== "outsider")
      mocks.records.set(`places/one/members/${role}`, {
        role: role === "employee" ? "employee" : "manager",
        active: role !== "revoked",
      });
    await expect(
      MenuRepository.saveProduct("one", product, parseUser(role, {})),
    ).rejects.toThrow();
    expect(mocks.set).not.toHaveBeenCalled();
  },
);
it("requires the menu module and category in the same place", async () => {
  await expect(
    MenuRepository.saveProduct(
      "one",
      { ...product, categoryId: "foreign" },
      owner,
    ),
  ).rejects.toThrow();
  mocks.records.set("places/one/settings/modules", {
    schemaVersion: 1,
    enabled: { menu: false },
  });
  await expect(
    MenuRepository.saveCategory("one", category, owner),
  ).rejects.toThrow();
});
