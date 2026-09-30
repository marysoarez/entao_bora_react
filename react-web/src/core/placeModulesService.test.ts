import { beforeEach, expect, it, vi } from "vitest";
import type { Transaction } from "firebase/firestore";
import { parseUser } from "../shared/domain";
import { defaultPlaceModules } from "../shared/placeModules";

const mocks = vi.hoisted(() => ({
  records: new Map<string, Record<string, unknown>>(),
  set: vi.fn(),
  get: vi.fn(),
}));
vi.mock("./firebase", () => ({
  database: () => ({}),
  assertProductWritesEnabled: vi.fn(),
}));
vi.mock("firebase/firestore", async (original) => ({
  ...(await original<typeof import("firebase/firestore")>()),
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  getDoc: mocks.get,
  runTransaction: async (
    _db: unknown,
    callback: (tx: Transaction) => Promise<void>,
  ) => callback({ get: mocks.get, set: mocks.set } as unknown as Transaction),
}));
import { PlaceModulesService } from "./placeModulesService";
const user = parseUser("owner", {});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.records.clear();
  mocks.records.set("places/one", { ownerId: "owner" });
  mocks.get.mockImplementation(async (ref: { path: string }) => ({
    id: ref.path.split("/").at(-1),
    exists: () => mocks.records.has(ref.path),
    data: () => mocks.records.get(ref.path),
  }));
});
it("consulta ausente devolve defaults sem criar documento", async () => {
  expect(await PlaceModulesService.get("one")).toEqual(defaultPlaceModules());
  expect(mocks.set).not.toHaveBeenCalled();
});
it("salva em settings/modules e preserva outras flags da leitura transacional", async () => {
  mocks.records.set("places/one/settings/modules", {
    ...defaultPlaceModules(),
    enabled: { ...defaultPlaceModules().enabled, tables: true },
  });
  await PlaceModulesService.setEnabled("one", "menu", false, user);
  expect(mocks.set).toHaveBeenCalledTimes(1);
  expect(mocks.set.mock.calls[0][0]).toEqual({
    path: "places/one/settings/modules",
  });
  expect(mocks.set.mock.calls[0][1]).toMatchObject({
    schemaVersion: 1,
    enabled: { events: true, team: true, tables: true, menu: false },
    updatedBy: "owner",
  });
});
it("não deixa manager configurar módulos nem owner alterar outro estabelecimento", async () => {
  mocks.records.set("places/one/members/manager", {
    role: "manager",
    active: true,
  });
  await expect(
    PlaceModulesService.setEnabled(
      "one",
      "menu",
      false,
      parseUser("manager", {}),
    ),
  ).rejects.toThrow("Sem permissão");
  mocks.records.set("places/two", { ownerId: "another" });
  await expect(
    PlaceModulesService.setEnabled("two", "menu", false, user),
  ).rejects.toThrow("Sem permissão");
  expect(mocks.set).not.toHaveBeenCalled();
});
it("bloqueia desativação de eventos e não consulta configuração para liberá-los", async () => {
  await expect(
    PlaceModulesService.setEnabled("one", "events", false, user),
  ).rejects.toThrow("permanecer habilitado");
  mocks.get.mockRejectedValueOnce(Error("permission-denied"));
  await expect(
    PlaceModulesService.assertAvailable("one", "events"),
  ).resolves.toBeUndefined();
  expect(mocks.get).not.toHaveBeenCalled();
});
it("nega cardápio desativado e propaga erro sem liberar por fallback", async () => {
  mocks.records.set("places/one/settings/modules", {
    ...defaultPlaceModules(),
    enabled: { ...defaultPlaceModules().enabled, menu: false },
  });
  await expect(
    PlaceModulesService.assertAvailable("one", "menu"),
  ).rejects.toThrow("não está disponível");
  mocks.get.mockRejectedValueOnce(Error("permission-denied"));
  await expect(
    PlaceModulesService.assertAvailable("one", "menu"),
  ).rejects.toThrow("permission-denied");
});
it("exige entitlement para habilitar e usar módulo pago", async () => {
  mocks.records.set("places/one/settings/modules", {
    ...defaultPlaceModules(),
    enabled: { ...defaultPlaceModules().enabled, orders: true },
  });
  await expect(
    PlaceModulesService.assertAvailable("one", "orders"),
  ).rejects.toThrow("plano");
  mocks.records.set("places/one/settings/entitlements", {
    schemaVersion: 1,
    planKey: "operations",
    status: "active",
    features: {
      notifications: false,
      tables: false,
      orders: true,
      inventory: false,
      purchases: false,
      advancedAnalytics: false,
    },
    validUntil: null,
  });
  await expect(
    PlaceModulesService.assertAvailable("one", "orders"),
  ).resolves.toBeUndefined();
});
