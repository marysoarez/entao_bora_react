import { beforeEach, expect, it, vi } from "vitest";
import { parseUser } from "../../../shared/domain";
import { fullEntitlements } from "../../../shared/testEntitlements";
const mocks = vi.hoisted(() => ({
  records: new Map<string, Record<string, unknown>>(),
  set: vi.fn(),
  update: vi.fn(),
  onSnapshot: vi.fn(),
}));
vi.mock("../../../core/firebase", () => ({
  database: () => ({}),
  assertProductWritesEnabled: vi.fn(),
}));
vi.mock("firebase/firestore", async (original) => {
  const get = async (ref: { path: string }) => ({
    id: ref.path.split("/").at(-1),
    exists: () => mocks.records.has(ref.path),
    data: () => mocks.records.get(ref.path),
  });
  const path = (parent: { path?: string }, parts: string[]) =>
    [parent.path, ...parts].filter(Boolean).join("/");
  return {
    ...(await original<typeof import("firebase/firestore")>()),
    doc: (parent: { path?: string }, ...parts: string[]) => {
      const value = path(parent, parts.length ? parts : ["generated"]);
      return { path: value, id: value.split("/").at(-1) };
    },
    collection: (parent: { path?: string }, ...parts: string[]) => ({
      path: path(parent, parts),
    }),
    getDoc: get,
    onSnapshot: mocks.onSnapshot,
    runTransaction: (_db: unknown, callback: (tx: unknown) => unknown) =>
      callback({ get, set: mocks.set, update: mocks.update }),
  };
});
import { InventoryRepository } from "./inventoryRepository";
const owner = parseUser("owner", {});
const path = "places/one/inventoryItems/lime";
const fields = {
  name: "Limão",
  unit: "un" as const,
  minimumMilli: 1000,
  active: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.records.clear();
  mocks.records.set("places/one/settings/entitlements", fullEntitlements());
  mocks.records.set("places/one", { ownerId: "owner" });
  mocks.records.set("places/one/settings/modules", {
    schemaVersion: 1,
    enabled: { inventory: true },
  });
  mocks.records.set(path, {
    ...fields,
    stockMilli: 5000,
    lastMovementId: null,
  });
});
it("starts new stock at zero and protects immutable units", async () => {
  await InventoryRepository.saveItem("one", null, fields, owner);
  expect(mocks.set.mock.calls[0][1]).toMatchObject({
    stockMilli: 0,
    lastMovementId: null,
  });
  await expect(
    InventoryRepository.saveItem(
      "one",
      "lime",
      { ...fields, unit: "ml" },
      owner,
    ),
  ).rejects.toThrow("unidade");
});
it("writes balance and permanent movement atomically", async () => {
  await InventoryRepository.move(
    "one",
    "lime",
    "op",
    { type: "loss", amountMilli: 1000, reason: "Deteriorado" },
    owner,
  );
  expect(mocks.set.mock.calls[0][0].path).toBe(`${path}/movements/op`);
  expect(mocks.set.mock.calls[0][1]).toMatchObject({
    type: "loss",
    beforeMilli: 5000,
    afterMilli: 4000,
    deltaMilli: -1000,
    createdBy: "owner",
  });
  expect(mocks.update.mock.calls[0][1]).toMatchObject({
    stockMilli: 4000,
    lastMovementId: "op",
  });
});
it("retries the same operation without a second movement and rejects ID reuse with changed input", async () => {
  mocks.records.set(`${path}/movements/op`, {
    type: "entry",
    deltaMilli: 1000,
    reason: "Compra",
    createdBy: "owner",
  });
  await InventoryRepository.move(
    "one",
    "lime",
    "op",
    { type: "entry", amountMilli: 1000, reason: "Compra" },
    owner,
  );
  expect(mocks.set).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
  await expect(
    InventoryRepository.move(
      "one",
      "lime",
      "op",
      { type: "entry", amountMilli: 2000, reason: "Compra" },
      owner,
    ),
  ).rejects.toThrow("utilizado");
});
it("rejects insufficient stock, inactive items, foreign users and disabled inventory", async () => {
  const move = (user = owner) =>
    InventoryRepository.move(
      "one",
      "lime",
      "op",
      { type: "exit", amountMilli: 6000, reason: "Uso" },
      user,
    );
  await expect(move()).rejects.toThrow("Saldo");
  await expect(move(parseUser("outsider", {}))).rejects.toThrow("permissão");
  mocks.records.set("places/one/settings/modules", {
    schemaVersion: 1,
    enabled: { inventory: false },
  });
  await expect(move()).rejects.toThrow("módulo");
  expect(mocks.set).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});
it("saves recipe separately without touching menu, orders or balances", async () => {
  mocks.records.set("places/one/menuItems/drink", { name: "Caipirinha" });
  await InventoryRepository.saveRecipe(
    "one",
    "drink",
    { lime: { unit: "un", quantityMilli: 1000 } },
    true,
    owner,
  );
  expect(mocks.set.mock.calls[0][0].path).toBe(
    "places/one/inventoryRecipes/drink",
  );
  expect(mocks.set.mock.calls[0][1]).toMatchObject({
    menuItemId: "drink",
    revision: 1,
  });
  expect(mocks.update).not.toHaveBeenCalled();
  await expect(
    InventoryRepository.saveRecipe(
      "one",
      "foreign",
      { lime: { unit: "un", quantityMilli: 1000 } },
      true,
      owner,
    ),
  ).rejects.toThrow("Cardápio".toLowerCase());
});
