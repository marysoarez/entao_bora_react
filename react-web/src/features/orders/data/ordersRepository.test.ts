import { beforeEach, expect, it, vi } from "vitest";
import type { Transaction } from "firebase/firestore";
import { parseUser } from "../../../shared/domain";
import { fullEntitlements } from "../../../shared/testEntitlements";
const mocks = vi.hoisted(() => ({
  records: new Map<string, Record<string, unknown>>(),
  set: vi.fn(),
  update: vi.fn(),
  onSnapshot: vi.fn(),
  stop: vi.fn(),
  sequence: 0,
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
  return {
    ...(await original<typeof import("firebase/firestore")>()),
    doc: (parent: { path?: string }, ...parts: string[]) => {
      const path = parts.length
        ? parts.join("/")
        : `${parent.path}/generated${++mocks.sequence}`;
      return { path, id: path.split("/").at(-1) };
    },
    collection: (_db: unknown, ...parts: string[]) => ({
      path: parts.join("/"),
    }),
    getDoc: get,
    onSnapshot: mocks.onSnapshot,
    runTransaction: (
      _db: unknown,
      callback: (tx: Transaction) => Promise<unknown>,
    ) =>
      callback({
        get,
        set: mocks.set,
        update: mocks.update,
      } as unknown as Transaction),
  };
});
import { OrdersRepository } from "./ordersRepository";
const owner = parseUser("owner", {});
const input = {
  serviceSessionId: "s",
  items: [{ menuItemId: "ipa", quantity: 2 }],
  notes: "",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.records.clear();
  mocks.records.set("places/one/settings/entitlements", fullEntitlements());
  mocks.sequence = 0;
  mocks.onSnapshot.mockReturnValue(mocks.stop);
  mocks.records.set("places/one", { ownerId: "owner", menuSchemaVersion: 2 });
  mocks.records.set("places/one/settings/modules", {
    schemaVersion: 1,
    enabled: { orders: true, serviceSessions: true, menu: true, tables: false },
  });
  mocks.records.set("places/one/serviceSessions/s", {
    placeId: "one",
    tableId: null,
    serviceType: "counter",
    status: "open",
  });
  mocks.records.set("places/one/menuItems/ipa", {
    name: "IPA 500ml",
    price: 18,
    categoryId: "beer",
    active: true,
    available: true,
  });
  mocks.records.set("places/one/menuCategories/beer", { active: true });
});
it.each(["counter", "lounge", "takeaway", "table"])(
  "creates several %s orders in one session, deriving table from session",
  async (serviceType) => {
    const tableId = serviceType === "table" ? "table05" : null;
    mocks.records.set("places/one/serviceSessions/s", {
      placeId: "one",
      tableId,
      serviceType,
      status: "open",
    });
    const ids = [];
    for (let i = 0; i < 3; i++)
      ids.push(await OrdersRepository.create("one", input, owner));
    expect(new Set(ids).size).toBe(3);
    for (const [ref, data] of mocks.set.mock.calls) {
      expect(ref.path).toMatch(/^places\/one\/orders\//);
      expect(data).toMatchObject({
        serviceSessionId: "s",
        tableId,
        customerUid: null,
        serviceType,
        status: "pending",
        subtotal: 36,
        total: 36,
        items: [
          {
            menuItemId: "ipa",
            name: "IPA 500ml",
            quantity: 2,
            unitPrice: 18,
            total: 36,
          },
        ],
      });
    }
    expect(mocks.update).not.toHaveBeenCalled();
  },
);
it.each(["closed", "cancelled", "missing", "other-place"])(
  "rejects %s sessions",
  async (status) => {
    if (status === "missing")
      mocks.records.delete("places/one/serviceSessions/s");
    else
      mocks.records.set("places/one/serviceSessions/s", {
        placeId: status === "other-place" ? "two" : "one",
        status,
        tableId: null,
        serviceType: "counter",
      });
    await expect(
      OrdersRepository.create("one", input, owner),
    ).rejects.toThrow();
    expect(mocks.set).not.toHaveBeenCalled();
  },
);
it("uses current authoritative menu prices and preserves the previous snapshot", async () => {
  await OrdersRepository.create("one", input, owner);
  const first = mocks.set.mock.calls[0][1];
  mocks.records.get("places/one/menuItems/ipa")!.price = 20;
  await OrdersRepository.create("one", input, owner);
  expect(first.total).toBe(36);
  expect(mocks.set.mock.calls[1][1].total).toBe(40);
});
it.each(["employee", "outsider", "inactive", "revoked"])(
  "blocks %s writes",
  async (role) => {
    if (role === "employee" || role === "revoked")
      mocks.records.set(`places/one/members/${role}`, {
        role: "employee",
        active: role !== "revoked",
      });
    await expect(
      OrdersRepository.create(
        "one",
        input,
        parseUser(role, { active: role !== "inactive" }),
      ),
    ).rejects.toThrow();
    expect(mocks.set).not.toHaveBeenCalled();
  },
);
it.each(["orders", "serviceSessions", "menu"])(
  "requires %s module for creation",
  async (module) => {
    mocks.records.set("places/one/settings/modules", {
      schemaVersion: 1,
      enabled: {
        orders: true,
        serviceSessions: true,
        menu: true,
        [module]: false,
      },
    });
    await expect(
      OrdersRepository.create("one", input, owner),
    ).rejects.toThrow();
    expect(mocks.set).not.toHaveBeenCalled();
  },
);
it("rejects unavailable products, inactive categories and legacy menu", async () => {
  mocks.records.get("places/one/menuItems/ipa")!.available = false;
  await expect(OrdersRepository.create("one", input, owner)).rejects.toThrow(
    "indisponível",
  );
  mocks.records.get("places/one/menuItems/ipa")!.available = true;
  mocks.records.get("places/one/menuCategories/beer")!.active = false;
  await expect(OrdersRepository.create("one", input, owner)).rejects.toThrow(
    "Categoria",
  );
  mocks.records.get("places/one")!.menuSchemaVersion = 1;
  await expect(OrdersRepository.create("one", input, owner)).rejects.toThrow(
    "cardápio",
  );
  expect(mocks.set).not.toHaveBeenCalled();
});
it("status changes only touch status and timestamp even after menu or session closure", async () => {
  mocks.records.set("places/one/orders/o", { status: "pending" });
  mocks.records.delete("places/one/menuItems/ipa");
  mocks.records.get("places/one/serviceSessions/s")!.status = "closed";
  await OrdersRepository.updateStatus("one", "o", "accepted", owner);
  expect(Object.keys(mocks.update.mock.calls[0][1]).sort()).toEqual([
    "status",
    "updatedAt",
  ]);
  await expect(
    OrdersRepository.updateStatus("one", "o", "delivered", owner),
  ).rejects.toThrow();
});
it("releases realtime subscriptions and ignores callbacks after unsubscribe", async () => {
  const change = vi.fn(),
    error = vi.fn();
  const stop = OrdersRepository.watch("one", owner, change, error);
  await vi.waitFor(() => expect(mocks.onSnapshot).toHaveBeenCalledOnce());
  const callback = mocks.onSnapshot.mock.calls[0][2];
  callback({
    metadata: { hasPendingWrites: false, fromCache: false },
    docs: [],
  });
  expect(change).toHaveBeenCalledExactlyOnceWith([], { fromCache: false });
  stop();
  callback({
    metadata: { hasPendingWrites: false, fromCache: false },
    docs: [],
  });
  expect(change).toHaveBeenCalledOnce();
  expect(mocks.stop).toHaveBeenCalledOnce();
});
it("unmount during authorization never starts a listener", async () => {
  const stop = OrdersRepository.watch("one", owner, vi.fn(), vi.fn());
  stop();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(mocks.onSnapshot).not.toHaveBeenCalled();
});

it.each(["closed", "cancelled"])(
  "cannot cancel an order in a %s session",
  async (status) => {
    mocks.records.set("places/one/orders/o", {
      status: "pending",
      serviceSessionId: "s",
    });
    mocks.records.get("places/one/serviceSessions/s")!.status = status;
    await expect(
      OrdersRepository.updateStatus("one", "o", "cancelled", owner),
    ).rejects.toThrow("encerrado");
    expect(mocks.update).not.toHaveBeenCalled();
  },
);
it("can cancel before closing without rewriting prices", async () => {
  mocks.records.set("places/one/orders/o", {
    status: "accepted",
    serviceSessionId: "s",
  });
  await OrdersRepository.updateStatus("one", "o", "cancelled", owner);
  expect(mocks.update.mock.calls[0][1].status).toBe("cancelled");
  expect(Object.keys(mocks.update.mock.calls[0][1]).sort()).toEqual([
    "status",
    "updatedAt",
  ]);
});
it("marks cached and pending snapshots as unconfirmed until the server acknowledges them", async () => {
  const change = vi.fn();
  const stop = OrdersRepository.watch("one", owner, change, vi.fn());
  await vi.waitFor(() => expect(mocks.onSnapshot).toHaveBeenCalledOnce());
  expect(mocks.onSnapshot.mock.calls[0][1]).toEqual({
    includeMetadataChanges: true,
  });
  const publish = mocks.onSnapshot.mock.calls[0][2];
  publish({ metadata: { hasPendingWrites: false, fromCache: true }, docs: [] });
  expect(change).toHaveBeenLastCalledWith([], { fromCache: true });
  publish({ metadata: { hasPendingWrites: true, fromCache: false }, docs: [] });
  expect(change).toHaveBeenLastCalledWith([], { fromCache: true });
  publish({
    metadata: { hasPendingWrites: false, fromCache: false },
    docs: [],
  });
  expect(change).toHaveBeenLastCalledWith([], { fromCache: false });
  stop();
});
