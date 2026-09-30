import { beforeEach, expect, it, vi } from "vitest";
import type { Transaction } from "firebase/firestore";
import { parseUser } from "../../../shared/domain";
import { fullEntitlements } from "../../../shared/testEntitlements";
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
import { ServiceSessionsRepository } from "./serviceSessionsRepository";
const owner = parseUser("owner", {});
const input = {
  serviceType: "lounge" as const,
  tableId: null,
  customerCount: 4,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.records.clear();
  mocks.records.set("places/one/settings/entitlements", fullEntitlements());
  mocks.records.set("places/one", { ownerId: "owner" });
  mocks.records.set("places/one/settings/modules", {
    schemaVersion: 1,
    enabled: { serviceSessions: true, tables: true },
  });
});
it("opens an anonymous group with no table or customer and only session fields", async () => {
  expect(await ServiceSessionsRepository.open("one", input, owner)).toBe(
    "generated",
  );
  const [ref, data] = mocks.set.mock.calls[0];
  expect(ref.path).toBe("places/one/serviceSessions/generated");
  expect(data).toMatchObject({
    ...input,
    id: "generated",
    placeId: "one",
    status: "open",
    openedBy: "owner",
    closedBy: null,
    closedAt: null,
    source: "partner_web",
  });
  expect(Object.keys(data).sort()).toEqual(
    [
      "id",
      "placeId",
      "tableId",
      "serviceType",
      "status",
      "customerCount",
      "openedAt",
      "closedAt",
      "openedBy",
      "closedBy",
      "source",
      "createdAt",
      "updatedAt",
    ].sort(),
  );
  expect(mocks.update).not.toHaveBeenCalled();
});
it("checks active tables in the same place without writing to tables", async () => {
  const tableInput = { ...input, serviceType: "table" as const, tableId: "t1" };
  await expect(
    ServiceSessionsRepository.open("one", tableInput, owner),
  ).rejects.toThrow();
  mocks.records.set("places/two/tables/t1", { active: true });
  await expect(
    ServiceSessionsRepository.open("one", tableInput, owner),
  ).rejects.toThrow();
  mocks.records.set("places/one/tables/t1", { active: false });
  await expect(
    ServiceSessionsRepository.open("one", tableInput, owner),
  ).rejects.toThrow();
  mocks.records.set("places/one/tables/t1", { active: true });
  await ServiceSessionsRepository.open("one", tableInput, owner);
  expect(mocks.set).toHaveBeenCalledTimes(2);
  expect(mocks.update).not.toHaveBeenCalled();
});
it("finishes only open sessions, preserving origin, group and table", async () => {
  mocks.records.set("places/one/serviceSessions/s1", {
    ...input,
    status: "open",
  });
  await ServiceSessionsRepository.finish("one", "s1", "closed", owner);
  expect(Object.keys(mocks.update.mock.calls[0][1]).sort()).toEqual(
    ["status", "closedAt", "closedBy", "updatedAt"].sort(),
  );
  expect(mocks.update.mock.calls[0][1]).toMatchObject({
    status: "closed",
    closedBy: "owner",
  });
  mocks.records.set("places/one/serviceSessions/s1", { status: "closed" });
  await expect(
    ServiceSessionsRepository.finish("one", "s1", "cancelled", owner),
  ).rejects.toThrow();
  await expect(
    ServiceSessionsRepository.finish("one", "missing", "closed", owner),
  ).rejects.toThrow();
  expect(mocks.update).toHaveBeenCalledTimes(1);
});
it("normal closing only releases occupancy and preserves the session and its order history", async () => {
  const sessionPath = "places/one/serviceSessions/history";
  const orderPath = "places/one/orders/historical-order";
  const original = {
    status: "open",
    tableId: "t1",
    source: "partner_web",
    customerCount: 4,
    openedAt: new Date(1),
  };
  mocks.records.set(sessionPath, original);
  mocks.records.set(orderPath, {
    serviceSessionId: "history",
    total: 126,
    items: [{ name: "Produto antigo", unitPrice: 126 }],
  });
  mocks.records.set("places/one/tableOccupancies/t1", { sessionId: "history" });
  await ServiceSessionsRepository.finish("one", "history", "closed", owner);
  expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ path: "places/one/tableOccupancies/t1" }),
  );
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ path: sessionPath }),
    {
      status: "closed",
      closedBy: "owner",
      closedAt: expect.anything(),
      updatedAt: expect.anything(),
    },
  );
  expect(mocks.set).not.toHaveBeenCalled();
  expect(mocks.records.get(orderPath)).toMatchObject({
    serviceSessionId: "history",
    total: 126,
  });
  expect(mocks.records.get(sessionPath)).toEqual(original);
});
it.each(["employee", "outsider", "inactive", "revoked"])(
  "rejects writes by %s",
  async (role) => {
    const user = parseUser(role, { active: role !== "inactive" });
    if (role !== "outsider")
      mocks.records.set(`places/one/members/${role}`, {
        role: role === "employee" ? "employee" : "manager",
        active: role !== "revoked",
      });
    await expect(
      ServiceSessionsRepository.open("one", input, user),
    ).rejects.toThrow();
    expect(mocks.set).not.toHaveBeenCalled();
  },
);
it("requires sessions module but allows tableless consumption with tables disabled", async () => {
  mocks.records.set("places/one/settings/modules", {
    schemaVersion: 1,
    enabled: { serviceSessions: true, tables: false },
  });
  await ServiceSessionsRepository.open("one", input, owner);
  await expect(
    ServiceSessionsRepository.open(
      "one",
      { ...input, serviceType: "table", tableId: "t1" },
      owner,
    ),
  ).rejects.toThrow();
  mocks.records.delete("places/one/settings/modules");
  await expect(
    ServiceSessionsRepository.open("one", input, owner),
  ).rejects.toThrow();
});

it("rejects occupied tables before creating any session", async () => {
  mocks.records.set("places/one/tables/t1", { active: true });
  mocks.records.set("places/one/tableOccupancies/t1", {
    sessionId: "existing",
  });
  await expect(
    ServiceSessionsRepository.open(
      "one",
      { ...input, serviceType: "table", tableId: "t1" },
      owner,
    ),
  ).rejects.toThrow();
  expect(mocks.set).not.toHaveBeenCalled();
});
it("releases only the matching occupancy in the finishing transaction", async () => {
  mocks.records.set("places/one/serviceSessions/s1", {
    status: "open",
    tableId: "t1",
  });
  mocks.records.set("places/one/tableOccupancies/t1", { sessionId: "other" });
  await expect(
    ServiceSessionsRepository.finish("one", "s1", "closed", owner),
  ).rejects.toThrow();
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
  mocks.records.set("places/one/tableOccupancies/t1", { sessionId: "s1" });
  await ServiceSessionsRepository.finish("one", "s1", "closed", owner);
  expect(mocks.remove).toHaveBeenCalledWith(
    expect.objectContaining({ path: "places/one/tableOccupancies/t1" }),
  );
  expect(mocks.update).toHaveBeenCalledTimes(1);
});
