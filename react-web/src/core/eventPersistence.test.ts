import { beforeEach, expect, it, vi } from "vitest";
import { parseEvent, parseUser } from "../shared/domain";
const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: "uid" } },
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  writeBatch: vi.fn(),
  batchUpdate: vi.fn(),
  batchCommit: vi.fn(),
}));
vi.mock("./firebase", () => ({
  auth: mocks.auth,
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
  writeBatch: mocks.writeBatch,
}));
import {
  checkIn,
  owned,
  saveEntity,
  resolvePublicEntity,
  setFeaturedEvent,
} from "./repository";
import { PlaceModulesService } from "./placeModulesService";
import { PartnerAccessService } from "./partnerAccessService";
const user = parseUser("uid", { partnerId: "partner", role: "partner" });
const event = () =>
  parseEvent("", {
    title: " Show ",
    description: " Descrição ",
    coverImage: "Y292ZXI=",
    createdBy: "uid",
    startDate: new Date("2026-10-10T20:00:00Z"),
    endDate: new Date("2026-10-10T20:00:00Z"),
    address: { displayName: "Local", latitude: -22, longitude: -43 },
  });
beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  mocks.auth.currentUser.uid = "uid";
  mocks.getDocs.mockResolvedValue({ docs: [] });
  mocks.getDoc.mockResolvedValue({ exists: () => false });
  mocks.get.mockResolvedValue({ exists: () => false });
  mocks.writeBatch.mockReturnValue({
    update: mocks.batchUpdate,
    commit: mocks.batchCommit,
  });
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
  const canEvent = vi.spyOn(PartnerAccessService, "canEvent");
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
  expect(canEvent).not.toHaveBeenCalled();
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
it("permite que usuário ativo comum publique evento sem local", async () => {
  const regularUser = parseUser("regular-user", { role: "user" });
  mocks.auth.currentUser.uid = "regular-user";

  await expect(saveEntity("events", event(), regularUser)).resolves.toBe(
    "generated-id",
  );
  expect(mocks.set.mock.calls[0][1]).toMatchObject({
    createdBy: "regular-user",
    placeId: null,
    featured: false,
  });
});
it("permite publicar em estabelecimento existente sem manageEvents", async () => {
  const regularUser = parseUser("regular-user", { role: "user" });
  mocks.auth.currentUser.uid = "regular-user";
  const canPlace = vi.spyOn(PartnerAccessService, "canPlace");
  await expect(
    saveEntity(
      "events",
      { ...event(), placeId: "existing-place" },
      regularUser,
    ),
  ).resolves.toBe("generated-id");
  expect(mocks.set.mock.calls[0][1]).toMatchObject({
    createdBy: "regular-user",
    placeId: "existing-place",
  });
  expect(canPlace).not.toHaveBeenCalled();
});
it("rejeita criação quando o ID informado não corresponde à sessão Firebase", async () => {
  const forgedUser = parseUser("someone-else", { role: "user" });
  mocks.auth.currentUser.uid = "authenticated-user";
  await expect(saveEntity("events", event(), forgedUser)).rejects.toThrow(
    "A sessão não corresponde ao usuário informado.",
  );
  expect(mocks.set).not.toHaveBeenCalled();
});
it("rejeita criação sem usuário Firebase autenticado", async () => {
  mocks.auth.currentUser.uid = "";
  await expect(saveEntity("events", event(), user)).rejects.toThrow(
    "Faça login para salvar um evento.",
  );
  expect(mocks.set).not.toHaveBeenCalled();
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
it("nega edição por admin de evento de terceiros no repositório", async () => {
  const admin = parseUser("admin", { role: "admin" });
  mocks.auth.currentUser.uid = "admin";
  mocks.get.mockResolvedValue({
    id: "third-party",
    exists: () => true,
    data: () => ({
      createdBy: "someone-else",
      createdAt: event().createdAt,
      status: "published",
    }),
  });
  await expect(
    saveEntity(
      "events",
      {
        ...event(),
        id: "third-party",
        createdBy: "someone-else",
      },
      admin,
    ),
  ).rejects.toThrow("Você não pode editar");
  expect(mocks.update).not.toHaveBeenCalled();
});
it("nega tentativa do criador de alterar createdBy no repositório", async () => {
  mocks.get.mockResolvedValue({
    id: "existing",
    exists: () => true,
    data: () => ({
      createdBy: "uid",
      createdAt: event().createdAt,
      status: "published",
    }),
  });
  await expect(
    saveEntity(
      "events",
      { ...event(), id: "existing", createdBy: "target" },
      user,
    ),
  ).rejects.toThrow("A autoria do evento não pode ser alterada");
  expect(mocks.update).not.toHaveBeenCalled();
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
it("ao destacar evento já salvo, atualiza somente os destaques anteriores", async () => {
  mocks.auth.currentUser.uid = "admin";
  const previous = { id: "previous", ref: { id: "previous" } };
  mocks.getDoc.mockResolvedValue({
    exists: () => true,
    data: () => ({ status: "published", featured: true }),
  });
  mocks.getDocs.mockResolvedValue({ docs: [previous] });

  await setFeaturedEvent(
    "selected",
    true,
    parseUser("admin", { role: "admin" }),
  );

  expect(mocks.batchUpdate).toHaveBeenCalledTimes(1);
  expect(mocks.batchUpdate).toHaveBeenCalledWith(previous.ref, {
    featured: false,
  });
  expect(mocks.batchCommit).toHaveBeenCalledTimes(1);
});
it("não faz batch redundante quando não há outro evento em destaque", async () => {
  mocks.auth.currentUser.uid = "admin";
  mocks.getDoc.mockResolvedValue({
    exists: () => true,
    data: () => ({ status: "published", featured: true }),
  });
  mocks.getDocs.mockResolvedValue({ docs: [] });

  await setFeaturedEvent(
    "selected",
    true,
    parseUser("admin", { role: "admin" }),
  );

  expect(mocks.batchUpdate).not.toHaveBeenCalled();
  expect(mocks.batchCommit).not.toHaveBeenCalled();
});
it("permite ao admin destacar evento de outra pessoa sem editar seu conteúdo", async () => {
  mocks.auth.currentUser.uid = "admin";
  const selectedRef = { id: "selected" };
  mocks.getDoc.mockResolvedValue({
    exists: () => true,
    data: () => ({ status: "published", featured: false }),
  });
  mocks.getDocs.mockResolvedValue({ docs: [] });

  await setFeaturedEvent(
    "selected",
    true,
    parseUser("admin", { role: "admin" }),
  );

  expect(mocks.batchUpdate).toHaveBeenCalledWith(selectedRef, {
    featured: true,
  });
  expect(mocks.batchCommit).toHaveBeenCalledOnce();
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

it.each(["user", "partner", "admin"])(
  "%s cria e edita somente eventos próprios",
  async (role) => {
    const actor = parseUser("uid", { role });
    await saveEntity("events", { ...event(), createdBy: "forged" }, actor);
    expect(mocks.set.mock.calls[0][1].createdBy).toBe("uid");
    mocks.get.mockResolvedValue({
      id: "existing",
      exists: () => true,
      data: () => ({ ...event(), createdBy: "uid" }),
    });
    await expect(
      saveEntity("events", { ...event(), id: "existing" }, actor),
    ).resolves.toBe("existing");
    mocks.update.mockClear();
    mocks.get.mockResolvedValue({
      id: "existing",
      exists: () => true,
      data: () => ({ ...event(), createdBy: "other" }),
    });
    await expect(
      saveEntity(
        "events",
        { ...event(), id: "existing", createdBy: "other" },
        actor,
      ),
    ).rejects.toThrow("Você não pode editar");
    expect(mocks.update).not.toHaveBeenCalled();
  },
);

it("autenticação basta para autoria, sem exigir perfil ativo de parceiro", async () => {
  const actor = parseUser("uid", { active: false, role: "user" });
  await expect(saveEntity("events", event(), actor)).resolves.toBe(
    "generated-id",
  );
  mocks.get.mockResolvedValue({
    id: "existing",
    exists: () => true,
    data: () => event(),
  });
  await expect(
    saveEntity("events", { ...event(), id: "existing" }, actor),
  ).resolves.toBe("existing");
});

it("edição de evento legado preserva createdBy como objeto e campos desconhecidos", async () => {
  mocks.get.mockResolvedValue({
    id: "existing",
    exists: () => true,
    data: () => ({
      ...event(),
      createdBy: { id: "uid", name: "Original" },
      legacy: "keep",
    }),
  });
  await saveEntity("events", { ...event(), id: "existing" }, user);
  expect(mocks.update.mock.calls[0][1].createdBy).toEqual({
    id: "uid",
    name: "Original",
  });
  expect(mocks.update.mock.calls[0][1]).not.toHaveProperty("legacy");
  expect(mocks.set).not.toHaveBeenCalled();
});

it("criador comum preserva destaque existente ao editar o conteúdo", async () => {
  mocks.get.mockResolvedValue({
    id: "existing",
    exists: () => true,
    data: () => ({ ...event(), featured: true }),
  });
  await saveEntity(
    "events",
    { ...event(), id: "existing", featured: true },
    user,
  );
  expect(mocks.update.mock.calls[0][1].featured).toBe(true);
  await expect(
    saveEntity("events", { ...event(), id: "existing", featured: false }, user),
  ).rejects.toThrow("Somente administradores");
});

it("destaque exige sessão correspondente e papel de administrador", async () => {
  await expect(setFeaturedEvent("e", true, user)).rejects.toThrow(
    "Somente administradores",
  );
  await expect(
    setFeaturedEvent("e", true, parseUser("forged", { role: "admin" })),
  ).rejects.toThrow("A sessão não corresponde");
  mocks.auth.currentUser.uid = "";
  await expect(
    setFeaturedEvent("e", true, parseUser("uid", { role: "admin" })),
  ).rejects.toThrow("Faça login");
  expect(mocks.batchCommit).not.toHaveBeenCalled();
});
