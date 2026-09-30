import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import {
  normalizeSlug,
  parseEvent,
  parsePlace,
  parseUser,
  canCheckIn,
  distanceInMeters,
  isPartner,
  canManage,
  validateEvent,
  safeUrl,
} from "./domain";
describe("compatibilidade dos contratos", () => {
  it("preserva o ID real, autores legados e Timestamp", () => {
    const date = Timestamp.fromDate(new Date("2026-09-09T21:00:00Z"));
    const e = parseEvent("real-id", {
      id: "errado",
      createdBy: { id: "owner" },
      startDate: date,
    });
    expect(e.id).toBe("real-id");
    expect(e.createdBy).toBe("owner");
    expect(e.startDate.toISOString()).toBe("2026-09-09T21:00:00.000Z");
    expect(e.status).toBe("draft");
    expect(e.boraCount).toBe(0);
  });
  it("normaliza proprietário, categoria e gêneros desconhecidos", () => {
    const p = parsePlace("p", {
      ownerId: { id: "u" },
      musicGenres: ["jazz", "unknown"],
      menuItems: [{ price: 12 }],
    });
    expect(p.ownerId).toBe("u");
    expect(p.musicGenres).toEqual(["jazz", "other"]);
    expect(p.menuItems[0].category).toBe("Geral");
  });
  it("preserva a localização legada do usuário", () => {
    const user = parseUser("u", {
      lastKnownLocation: { latitude: -22.9, longitude: -43.17 },
    });
    expect(user.lastKnownLocation).toEqual({
      latitude: -22.9,
      longitude: -43.17,
    });
  });
  it.each([
    [" Então Bóra! ", "entao-bora"],
    ["Rock & Blues", "rock-blues"],
    ["!!!", ""],
    ["A---B", "a-b"],
  ])("slug %s", (input, output) => expect(normalizeSlug(input)).toBe(output));
  it("bloqueia URLs executáveis", () =>
    expect(safeUrl("javascript:alert(1)")).toBeUndefined());
});
describe("check-in", () => {
  const start = new Date("2026-09-09T20:00:00Z"),
    end = new Date("2026-09-09T22:00:00Z");
  const e = parseEvent("e", {
    status: "published",
    startDate: start,
    endDate: end,
    address: { displayName: "Local", latitude: 0, longitude: 0 },
  });
  const position = (meters: number) => ({
    latitude: ((meters / 6371000) * 180) / Math.PI,
    longitude: 0,
  });
  it("inclui os instantes exatos de início e fim", () => {
    expect(canCheckIn(e, position(0), start)).toBe(true);
    expect(canCheckIn(e, position(0), end)).toBe(true);
    expect(canCheckIn(e, position(0), new Date(+start - 1))).toBe(false);
    expect(canCheckIn(e, position(0), new Date(+end + 1))).toBe(false);
  });
  it("valida 99, 100 e 101 metros", () => {
    expect(distanceInMeters(e.address, position(100))).toBeCloseTo(100, 6);
    expect(canCheckIn(e, position(99), start)).toBe(true);
    expect(canCheckIn(e, position(100), start)).toBe(true);
    expect(canCheckIn(e, position(101), start)).toBe(false);
  });
  it("rejeita evento cancelado", () =>
    expect(canCheckIn({ ...e, status: "cancelled" }, position(0), start)).toBe(
      false,
    ));
  it("aceita datas iguais no cadastro como no Flutter", () =>
    expect(() =>
      validateEvent({
        ...e,
        title: "Show",
        description: "Show",
        slug: "show",
        coverImage: "https://example.com/a.jpg",
        endDate: start,
      }),
    ).not.toThrow());
});
describe("políticas de acesso", () => {
  it("admin não é parceiro automaticamente", () =>
    expect(isPartner(parseUser("u", { role: "admin" }))).toBe(false));
  it("inativo não gerencia nem seu próprio registro", () =>
    expect(canManage(parseUser("u", { active: false }), "u")).toBe(false));
  it("aceita parceiro vinculado e rejeita usuário com vínculo sem papel", () => {
    expect(
      canManage(parseUser("u", { role: "partner", partnerId: "p" }), "p"),
    ).toBe(true);
    expect(
      canManage(parseUser("u", { role: "user", partnerId: "p" }), "p"),
    ).toBe(false);
  });
});
