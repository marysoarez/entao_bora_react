import { beforeEach, expect, it, vi } from "vitest";
import { Timestamp, type Transaction } from "firebase/firestore";
import { parseUser } from "../shared/domain";

const mocks = vi.hoisted(() => ({
  records: new Map<string, Record<string, unknown>>(),
  set: vi.fn(),
  guard: vi.fn(),
}));
vi.mock("./firebase", () => ({
  database: () => ({}),
  assertProductWritesEnabled: mocks.guard,
}));
vi.mock("firebase/firestore", async (original) => {
  const get = async (ref: { path: string }) => ({
    id: ref.path.split("/").at(-1),
    exists: () => mocks.records.has(ref.path),
    data: () => mocks.records.get(ref.path),
  });
  return {
    ...(await original<typeof import("firebase/firestore")>()),
    doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
    collection: (_db: unknown, ...parts: string[]) => ({
      path: parts.join("/"),
    }),
    getDoc: get,
    getDocs: async () => ({
      docs: [...mocks.records]
        .filter(([key]) => /^places\/[^/]+$/.test(key))
        .map(([key, value]) => ({ id: key.split("/")[1], data: () => value })),
    }),
    runTransaction: async (
      _db: unknown,
      callback: (tx: Transaction) => Promise<void>,
    ) => callback({ get, set: mocks.set } as unknown as Transaction),
  };
});
import { PlaceMembershipService } from "./placeMembershipService";
import { PartnerAccessService } from "./partnerAccessService";

const owner = parseUser("owner", {});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.records.clear();
  mocks.records.set("places/one", { ownerId: "owner" });
  mocks.records.set("places/two", { ownerId: "other" });
  mocks.records.set("users/target", { active: true });
  mocks.records.set("users/owner", { active: true });
});
it("descobre vários estabelecimentos por vínculo sem papel global partner", async () => {
  mocks.records.set("places/one/members/target", {
    role: "manager",
    active: true,
  });
  mocks.records.set("places/two/members/target", {
    role: "employee",
    active: true,
  });
  const result = await PartnerAccessService.list(parseUser("target", {}));
  expect(result.map((a) => [a.place.id, a.membership?.role])).toEqual([
    ["one", "manager"],
    ["two", "employee"],
  ]);
});
it("desativação retira o acesso e não usa ownerId como alternativa", async () => {
  mocks.records.set("places/one/members/owner", {
    role: "owner",
    active: false,
  });
  expect(await PartnerAccessService.list(owner)).toEqual([]);
});
it("owner legado cria membro com timestamp sem modificar perfil global", async () => {
  await PlaceMembershipService.save("one", "target", "manager", true, owner);
  expect(mocks.guard).toHaveBeenCalled();
  expect(mocks.set).toHaveBeenCalledTimes(1);
  expect(mocks.set.mock.calls[0][0]).toEqual({
    path: "places/one/members/target",
  });
  expect(mocks.set.mock.calls[0][1]).toMatchObject({
    role: "manager",
    active: true,
  });
});
it("edição preserva createdAt e revoga sem excluir", async () => {
  const createdAt = Timestamp.fromMillis(123);
  mocks.records.set("places/one/members/target", {
    role: "manager",
    active: true,
    createdAt,
  });
  await PlaceMembershipService.save("one", "target", "employee", false, owner);
  expect(mocks.set.mock.calls[0][1]).toEqual({
    role: "employee",
    active: false,
    createdAt,
  });
});
it("manager não cria membros mesmo chamando o service diretamente", async () => {
  mocks.records.set("places/one/members/target", {
    role: "manager",
    active: true,
  });
  await expect(
    PlaceMembershipService.save(
      "one",
      "owner",
      "owner",
      true,
      parseUser("target", {}),
    ),
  ).rejects.toThrow("Sem permissão");
  expect(mocks.set).not.toHaveBeenCalled();
});
it("bloqueia alteração do proprietário principal e auto-revogação", async () => {
  await expect(
    PlaceMembershipService.save("one", "owner", "employee", true, owner),
  ).rejects.toThrow("proprietário principal");
  mocks.records.set("places/one/members/target", {
    role: "owner",
    active: true,
  });
  await expect(
    PlaceMembershipService.save(
      "one",
      "target",
      "owner",
      false,
      parseUser("target", {}),
    ),
  ).rejects.toThrow("próprio acesso");
  expect(mocks.set).not.toHaveBeenCalled();
});
it("nega usuário alvo inexistente e UID inválido", async () => {
  await expect(
    PlaceMembershipService.save("one", "missing", "employee", true, owner),
  ).rejects.toThrow("não encontrado");
  await expect(
    PlaceMembershipService.save("one", "invalid/path", "employee", true, owner),
  ).rejects.toThrow("inválido");
  expect(mocks.set).not.toHaveBeenCalled();
});
