import { beforeEach, expect, it, vi } from "vitest";
import { parseEvent, parseUser } from "../shared/domain";
const mocks = vi.hoisted(() => ({
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
}));
vi.mock("./firebase", () => ({
  database: () => ({}),
  assertProductWritesEnabled: vi.fn(),
}));
vi.mock("firebase/firestore", async (original) => ({
  ...(await original<typeof import("firebase/firestore")>()),
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (...args: any[]) => ({
    id: args.length === 3 ? args[2] : "generated-id",
  }),
  query: (ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }),
  where: (field: string, op: string, value: string) => ({ field, op, value }),
  limit: (value: number) => ({ limit: value }),
  getDocs: mocks.getDocs,
  getDoc: mocks.getDoc,
  runTransaction: (_db: unknown, callback: (tx: unknown) => unknown) =>
    callback({ get: mocks.get, set: mocks.set, update: mocks.update }),
}));
import { checkIn, owned, saveEntity, resolvePublicEntity } from "./repository";
import { PlaceModulesService } from "./placeModulesService";
import { PartnerAccessService } from "./partnerAccessService";
const user = parseUser("uid", { partnerId: "partner", role: "partner" });
const event = () =>
  parseEvent("", {
    title: " Show ",
    description: " Descrição ",
    coverImage: "Y292ZXI=",
    startDate: new Date("2026-10-10T20:00:00Z"),
    endDate: new Date("2026-10-10T20:00:00Z"),
    address: { displayName: "Local", latitude: -22, longitude: -43 },
  });
beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  mocks.getDocs.mockResolvedValue({ docs: [] });
  mocks.getDoc.mockResolvedValue({ exists: () => false });
  mocks.get.mockResolvedValue({ exists: () => false });
});
it("publicação de Evento não depende de configuração de módulos ou cobrança", async () => {
  const settings = vi
    .spyOn(PlaceModulesService, "get")
    .mockRejectedValue(Error("settings unavailable"));
  await expect(saveEntity("events", event(), user)).resolves.toBe(
    "generated-id",
  );
  expect(settings).not.toHaveBeenCalled();
});
it("edição mantém ID, slug, vínculo e métricas sem consultar módulos", async () => {
  const settings = vi
    .spyOn(PlaceModulesService, "get")
    .mockRejectedValue(Error("settings unavailable"));
  vi.spyOn(PartnerAccessService, "canEvent").mockResolvedValue(true);
  mocks.get.mockResolvedValue({
    id: "existing",
    exists: () => true,
    data: () => ({
      createdBy: "uid",
      placeId: "same-place",
      slug: "published-link",
      createdAt: event().createdAt,
      status: "published",
      boraCount: 12,
      checkinCount: 4,
      views: 50,
      shares: 3,
    }),
  });
  await expect(
    saveEntity(
      "events",
      {
        ...event(),
        id: "existing",
        slug: "published-link",
        title: "Changed title",
        placeId: "same-place",
      },
      user,
    ),
  ).resolves.toBe("existing");
  expect(mocks.update.mock.calls[0][1]).toMatchObject({
    slug: "published-link",
    placeId: "same-place",
    createdBy: "uid",
    boraCount: 12,
    checkinCount: 4,
    views: 50,
    shares: 3,
  });
  expect(settings).not.toHaveBeenCalled();
});
it("link público por slug resolve ID real do evento sem módulos", async () => {
  mocks.getDocs.mockResolvedValue({
    docs: [
      {
        id: "real-id",
        data: () => ({ ...event(), id: "wrong-id", slug: "public-link" }),
      },
    ],
  });
  const resolved = await resolvePublicEntity("events", "public-link");
  expect(resolved?.id).toBe("real-id");
  expect(mocks.getDocs.mock.calls[0][0].constraints[0]).toEqual({
    field: "slug",
    op: "==",
    value: "public-link",
  });
});
it("lista locais por membro ou proprietario legado", async () => {
  const place = {
    id: "place",
    data: () => ({ name: "Meu Local", ownerId: "uid" }),
  };
  mocks.getDocs.mockResolvedValue({ docs: [place] });
  expect(await owned("places", user)).toHaveLength(1);
  expect(mocks.getDoc).toHaveBeenCalledTimes(1);
});

it("publica com ID automático após conferir slug derivado do título", async () => {
  expect(await saveEntity("events", event(), user)).toBe("generated-id");
  expect(mocks.getDocs.mock.calls[0][0].constraints[0].value).toBe("show");
  expect(mocks.set.mock.calls[0][1]).toMatchObject({
    title: "Show",
    status: "published",
    createdBy: "uid",
  });
});
it("bloqueia slug duplicado antes da escrita", async () => {
  mocks.getDocs.mockResolvedValue({ docs: [{ id: "another" }] });
  await expect(saveEntity("events", event(), user)).rejects.toThrow(
    "Já existe um evento",
  );
  expect(mocks.set).not.toHaveBeenCalled();
});
it("edita com update e preserva contadores atuais da transação", async () => {
  mocks.getDocs.mockResolvedValue({ docs: [{ id: "existing" }] });
  mocks.get.mockResolvedValue({
    id: "existing",
    exists: () => true,
    data: () => ({
      createdBy: "uid",
      createdAt: event().createdAt,
      views: 42,
      status: "published",
    }),
  });
  await saveEntity("events", { ...event(), id: "existing", views: 1 }, user);
  expect(mocks.update.mock.calls[0][1].views).toBe(42);
  expect(mocks.set).not.toHaveBeenCalled();
});
it("bloqueia alteração de destaque por parceiro antes de gravar", async () => {
  vi.spyOn(PartnerAccessService, "canEvent").mockResolvedValue(true);
  mocks.get.mockResolvedValue({
    id: "existing",
    exists: () => true,
    data: () => ({
      createdBy: "uid",
      createdAt: event().createdAt,
      status: "published",
      featured: false,
    }),
  });
  await expect(
    saveEntity("events", { ...event(), id: "existing", featured: true }, user),
  ).rejects.toThrow("Somente administradores podem alterar o destaque.");
  expect(mocks.update).not.toHaveBeenCalled();
});
it("propaga erro de gravação sem retornar sucesso", async () => {
  mocks.set.mockImplementationOnce(() => {
    throw Error("permission-denied");
  });
  await expect(saveEntity("events", event(), user)).rejects.toThrow(
    "permission-denied",
  );
});
it("bloqueia documento grande antes de gravar", async () => {
  await expect(
    saveEntity("events", { ...event(), coverImage: "a".repeat(950000) }, user),
  ).rejects.toThrow("muito grande");
  expect(mocks.set).not.toHaveBeenCalled();
});

it("check-in de Evento preserva contador e acrescenta contrato de origem manual", async () => {
  mocks.get
    .mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        ...event(),
        placeId: "place",
        status: "published",
        startDate: new Date(Date.now() - 60000),
        endDate: new Date(Date.now() + 60000),
      }),
    })
    .mockResolvedValueOnce({ exists: () => false });
  await checkIn("event", user, { latitude: -22, longitude: -43 });
  expect(mocks.set.mock.calls[0][1]).toMatchObject({
    eventId: "event",
    userId: "uid",
    placeId: "place",
    source: "manual",
    sources: ["manual"],
    checkedOutAt: null,
  });
  expect(mocks.update).toHaveBeenCalledTimes(1);
  expect(Object.keys(mocks.update.mock.calls[0][1])).toEqual(["checkinCount"]);
});
it("check-in legado de Evento continua idempotente", async () => {
  mocks.get.mockResolvedValue({ exists: () => true });
  await checkIn("event", user, { latitude: -22, longitude: -43 });
  expect(mocks.set).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});
