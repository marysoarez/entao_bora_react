import { beforeEach, expect, it, vi } from "vitest";
import type { Transaction } from "firebase/firestore";
import { parseUser } from "../../../shared/domain";
import { fullEntitlements } from "../../../shared/testEntitlements";
const mocks = vi.hoisted(() => ({
  records: new Map<string, Record<string, unknown>>(),
  set: vi.fn(),
  update: vi.fn(),
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
    getDocs: async () => ({ docs: [] }),
    query: (ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }),
    where: (field: string, op: string, value: unknown) => ({
      field,
      op,
      value,
    }),
    runTransaction: async (
      _db: unknown,
      callback: (tx: Transaction) => Promise<void>,
    ) =>
      callback({
        get,
        set: mocks.set,
        update: mocks.update,
      } as unknown as Transaction),
  };
});
import { TablesRepository, parseTable } from "./tablesRepository";
const owner = parseUser("owner", {});
const input = { number: 5, name: "Mesa 05", capacity: 4, active: true };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.records.clear();
  mocks.records.set("places/one/settings/entitlements", fullEntitlements());
  mocks.records.set("places/one", { ownerId: "owner" });
  mocks.records.set("places/one/settings/modules", {
    schemaVersion: 1,
    enabled: { tables: true },
  });
});
it("creates exactly the portable physical schema under the selected place", async () => {
  expect(await TablesRepository.save("one", input, owner)).toBe("generated");
  const [ref, data] = mocks.set.mock.calls[0];
  expect(ref.path).toBe("places/one/tables/generated");
  expect(Object.keys(data).sort()).toEqual(
    [
      "id",
      "number",
      "name",
      "capacity",
      "active",
      "createdAt",
      "updatedAt",
    ].sort(),
  );
  expect(data.id).toBe("generated");
});
it("editing preserves document ID and creation time; activation updates only state", async () => {
  mocks.records.set("places/one/tables/stable", {
    id: "stable",
    ...input,
    createdAt: new Date(1),
  });
  await TablesRepository.save(
    "one",
    { ...input, number: 6, capacity: 8 },
    owner,
    "stable",
  );
  expect(mocks.update.mock.calls[0][0].path).toBe("places/one/tables/stable");
  expect(mocks.update.mock.calls[0][1]).not.toHaveProperty("createdAt");
  expect(mocks.update.mock.calls[0][1]).not.toHaveProperty("id");
  await TablesRepository.setActive("one", "stable", false, owner);
  expect(Object.keys(mocks.update.mock.calls[1][1]).sort()).toEqual([
    "active",
    "updatedAt",
  ]);
  expect(mocks.set).not.toHaveBeenCalled();
});
it.each(["employee", "outsider", "inactive", "revoked"])(
  "rejects unauthorized writes by %s",
  async (role) => {
    const user = parseUser(role, { active: role !== "inactive" });
    if (role !== "outsider")
      mocks.records.set(`places/one/members/${role}`, {
        role: role === "employee" ? "employee" : "manager",
        active: role !== "revoked",
      });
    await expect(TablesRepository.save("one", input, user)).rejects.toThrow();
    expect(mocks.set).not.toHaveBeenCalled();
  },
);
it("denies missing module and missing table edits", async () => {
  await expect(
    TablesRepository.save("one", input, owner, "missing"),
  ).rejects.toThrow();
  mocks.records.delete("places/one/settings/modules");
  await expect(TablesRepository.save("one", input, owner)).rejects.toThrow();
  expect(mocks.set).not.toHaveBeenCalled();
});
it("parses identity from the path and Firestore timestamps", () => {
  const parsed = parseTable("path-id", {
    ...input,
    id: "wrong",
    createdAt: { toDate: () => new Date(10) },
    updatedAt: new Date(20),
    history: [],
  });
  expect(parsed.id).toBe("path-id");
  expect(parsed.createdAt.getTime()).toBe(10);
  expect(parsed).not.toHaveProperty("history");
});
