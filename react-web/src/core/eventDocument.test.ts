import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { eventDocument } from "./eventDocument";
import { parseEvent, validateEvent } from "../shared/domain";

const event = () =>
  parseEvent("", {
    title: "  Então Bora: Rock & Blues!  ",
    description: " Show ",
    coverImage: "data:image/jpeg;base64,Y292ZXI=",
    address: { displayName: "Rua do Show", latitude: -22.9, longitude: -43.1 },
    startDate: new Date("2026-10-10T20:00:00Z"),
    endDate: new Date("2026-10-10T22:00:00Z"),
    isBora: true,
    hasCheckedIn: true,
    unknownLegacyField: "omit",
  });
describe("contrato Flutter do evento", () => {
  it("preserva slug publicado ao editar o título", () => {
    expect(eventDocument({ ...event(), title: "Outro título" }, "uid", {
      slug: "link-publicado", createdBy: "uid", createdAt: Timestamp.fromMillis(1),
    }).slug).toBe("link-publicado");
  });
  it("persiste somente campos canônicos e Timestamp, com capa Base64", () => {
    const data = eventDocument(event(), "uid");
    expect(data).toMatchObject({
      title: "Então Bora: Rock & Blues!",
      description: "Show",
      slug: "entao-bora-rock-blues",
      placeId: null,
      locationName: "Rua do Show",
      coverImage: "Y292ZXI=",
      gallery: [],
      attractions: [],
      musicGenres: [],
      instagram: null,
      createdBy: "uid",
      status: "published",
      boraCount: 0,
      checkinCount: 0,
      views: 0,
      shares: 0,
      ticket: { type: "free", ticketUrl: null },
      address: {
        street: null,
        number: null,
        complement: null,
        latitude: -22.9,
        longitude: -43.1,
      },
    });
    expect(data.startDate).toBeInstanceOf(Timestamp);
    expect(data.startDate.toDate()).toEqual(event().startDate);
    expect(data.createdAt).toEqual(data.updatedAt);
    for (const key of ["id", "isBora", "hasCheckedIn", "unknownLegacyField"])
      expect(data).not.toHaveProperty(key);
    expect(JSON.stringify(data)).not.toContain("undefined");
    expect(parseEvent("saved-id", data).title).toBe(data.title);
  });
  it("mantém o ID interno, nome e cópia do endereço do estabelecimento", () => {
    const e = {
      ...event(),
      placeId: "internal-place",
      locationName: "Meu Bar",
    };
    const data = eventDocument(e, "uid");
    expect(data.placeId).toBe("internal-place");
    expect(data.locationName).toBe("Meu Bar");
    expect(data.address.latitude).toBe(e.address.latitude);
    expect(data.address).not.toBe(e.address);
  });
  it("preserva criação, autoria, status, galeria e métricas atuais na edição", () => {
    const createdAt = Timestamp.fromMillis(1000);
    const e = { ...event(), gallery: ["old-cover"], views: 1 };
    const data = eventDocument(e, "editor", {
      createdAt,
      createdBy: { id: "author" },
      status: "cancelled",
      views: 99,
    });
    expect(data).toMatchObject({
      createdAt,
      createdBy: "author",
      status: "cancelled",
      views: 99,
      gallery: ["old-cover"],
    });
  });
  it("remove URL residual do ingresso gratuito", () => {
    const e = event();
    e.ticket.ticketUrl = "https://tickets.example";
    expect(eventDocument(e, "uid").ticket.ticketUrl).toBeNull();
  });
});
describe("validações de publicação", () => {
  it.each([
    [{ title: " " }, "nome"],
    [{ description: " " }, "descrição"],
    [{ coverImage: "" }, "capa"],
    [
      {
        address: {
          displayName: "texto digitado",
          latitude: NaN,
          longitude: NaN,
        },
      },
      "local",
    ],
    [{ startDate: new Date(NaN) }, "início"],
    [{ endDate: new Date(NaN) }, "término"],
    [{ endDate: new Date(0) }, "data final"],
    [{ title: "!!!" }, "título válido"],
    [{ instagram: "https://instagram.com/test" }, "usuário do Instagram"],
    [{ ticket: { type: "external", ticketUrl: " " } }, "link para compra"],
    [
      { ticket: { type: "external", ticketUrl: "javascript:alert(1)" } },
      "link válido",
    ],
  ])("rejeita campos inválidos: %j", (patch, message) => {
    expect(() =>
      validateEvent({ ...event(), ...patch } as ReturnType<typeof event>),
    ).toThrow(message);
  });
  it("aceita datas iguais, gêneros vazios e Instagram opcional", () => {
    const e = event();
    e.endDate = e.startDate;
    expect(() => validateEvent(e)).not.toThrow();
  });
});
