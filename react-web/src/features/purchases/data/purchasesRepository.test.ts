import { beforeEach, expect, it, vi } from "vitest";
import { parseUser } from "../../../shared/domain";
import { fullEntitlements } from "../../../shared/testEntitlements";
const mocks = vi.hoisted(() => ({
  records: new Map<string, Record<string, unknown>>(),
  set: vi.fn(),
  update: vi.fn(),
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
  const make = (parent: { path?: string }, parts: string[]) =>
    [parent.path, ...parts].filter(Boolean).join("/");
  return {
    ...(await original<typeof import("firebase/firestore")>()),
    collection: (parent: { path?: string }, ...parts: string[]) => ({
      path: make(parent, parts),
    }),
    doc: (parent: { path?: string }, ...parts: string[]) => {
      const path = make(parent, parts.length ? parts : ["generated"]);
      return { path, id: path.split("/").at(-1) };
    },
    getDoc: get,
    runTransaction: (_db: unknown, callback: (tx: unknown) => unknown) =>
      callback({ get, set: mocks.set, update: mocks.update }),
    serverTimestamp: () => "server-time",
    onSnapshot: vi.fn(),
  };
});
import { PurchasesRepository } from "./purchasesRepository";
const owner = parseUser("owner", {});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.records.clear();
  mocks.records.set("places/one/settings/entitlements", fullEntitlements());
  mocks.records.set("places/one", { ownerId: "owner" });
  mocks.records.set("places/one/settings/modules", {
    schemaVersion: 1,
    enabled: { purchases: true, inventory: true },
  });
  mocks.records.set("places/one/suppliers/s", { active: true });
  mocks.records.set("places/one/inventoryItems/lime", {
    name: "Limão",
    unit: "un",
    active: true,
    stockMilli: 2_000,
    lastMovementId: null,
  });
});
it("creates supplier independently with immutable audit fields", async () => {
  await PurchasesRepository.saveSupplier(
    "one",
    null,
    { name: "Fornecedor", contact: "Contato", active: true },
    owner,
  );
  expect(mocks.set.mock.calls[0][0].path).toBe(
    "places/one/suppliers/generated",
  );
  expect(mocks.set.mock.calls[0][1]).toMatchObject({
    createdBy: "owner",
    createdAt: "server-time",
  });
});
it("creates order and purchase item snapshots without changing stock", async () => {
  await PurchasesRepository.createOrder(
    "one",
    "s",
    {
      notes: "Reposição",
      items: [
        {
          inventoryItemId: "lime",
          quantityMilli: 10_000,
          unitCostMicros: 2_000_000,
        },
      ],
    },
    owner,
  );
  expect(mocks.set).toHaveBeenCalledTimes(2);
  expect(mocks.set.mock.calls[0][0].path).toBe(
    "places/one/purchaseOrders/generated",
  );
  expect(mocks.set.mock.calls[0][1]).toMatchObject({
    supplierId: "s",
    status: "ordered",
    itemCount: 1,
    totalCostCents: 2000,
    receivedAt: null,
  });
  expect(mocks.set.mock.calls[1][0].path).toBe(
    "places/one/purchaseItems/generated_1",
  );
  expect(mocks.set.mock.calls[1][1]).toMatchObject({
    name: "Limão",
    unit: "un",
    quantityMilli: 10_000,
    receivedMilli: 0,
  });
  expect(mocks.update).not.toHaveBeenCalled();
});
it("receives all remaining quantities and records linked immutable inventory entry atomically", async () => {
  mocks.records.set("places/one/purchaseOrders/po", {
    status: "ordered",
    itemCount: 1,
  });
  mocks.records.set("places/one/purchaseItems/po_1", {
    purchaseOrderId: "po",
    inventoryItemId: "lime",
    unit: "un",
    quantityMilli: 10_000,
    receivedMilli: 0,
  });
  await PurchasesRepository.receive("one", "po", "receipt", owner);
  expect(mocks.set.mock.calls[0][0].path).toBe(
    "places/one/inventoryItems/lime/movements/purchase_receipt_1",
  );
  expect(mocks.set.mock.calls[0][1]).toMatchObject({
    type: "entry",
    deltaMilli: 10_000,
    beforeMilli: 2_000,
    afterMilli: 12_000,
    purchaseOrderId: "po",
  });
  expect(mocks.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: "places/one/inventoryItems/lime" }),
    expect.objectContaining({ stockMilli: 12_000 }),
  );
  expect(mocks.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: "places/one/purchaseItems/po_1" }),
    expect.objectContaining({ receivedMilli: 10_000 }),
  );
  expect(mocks.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: "places/one/purchaseOrders/po" }),
    expect.objectContaining({
      status: "received",
      receiptOperationId: "receipt",
    }),
  );
});
it("makes the same receipt operation idempotent and rejects another receipt", async () => {
  mocks.records.set("places/one/purchaseOrders/po", {
    status: "received",
    receiptOperationId: "same",
  });
  await PurchasesRepository.receive("one", "po", "same", owner);
  expect(mocks.set).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
  await expect(
    PurchasesRepository.receive("one", "po", "other", owner),
  ).rejects.toThrow("recebido");
});
it("rejects missing suppliers, missing inventory and disabled modules without side effects", async () => {
  mocks.records.delete("places/one/suppliers/s");
  const create = () =>
    PurchasesRepository.createOrder(
      "one",
      "s",
      {
        notes: "",
        items: [
          {
            inventoryItemId: "lime",
            quantityMilli: 1_000,
            unitCostMicros: 1_000_000,
          },
        ],
      },
      owner,
    );
  await expect(create()).rejects.toThrow("Fornecedor");
  mocks.records.set("places/one/settings/modules", {
    schemaVersion: 1,
    enabled: { purchases: false, inventory: true },
  });
  await expect(create()).rejects.toThrow("módulo");
  expect(mocks.set).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});
