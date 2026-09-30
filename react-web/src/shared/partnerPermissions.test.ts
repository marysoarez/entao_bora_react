import { describe, expect, it } from "vitest";
import { parseEvent, parsePlace, parseUser } from "./domain";
import {
  allowsEvent,
  allowsPlace,
  canCreatePlace,
  type PlaceMembership,
  type PlaceMemberRole,
  type PartnerPermission,
} from "./partnerPermissions";
import { parseMembership } from "../core/placeMembershipService";

const user = parseUser("member", { role: "user" });
const place = parsePlace("p1", { ownerId: "legacy" });
const member = (role: PlaceMemberRole, active = true): PlaceMembership => ({
  uid: user.id,
  placeId: place.id,
  role,
  active,
  createdAt: null,
});
describe("permissões do estabelecimento", () => {
  it.each<[PlaceMemberRole, PartnerPermission, boolean]>([
    ["owner", "manageMembers", true],
    ["owner", "transferEvents", true],
    ["owner", "manageCampaigns", true],
    ["manager", "manageEvents", true],
    ["manager", "editMenu", true],
    ["manager", "editPlace", true],
    ["manager", "manageMembers", false],
    ["manager", "manageCampaigns", false],
    ["manager", "transferEvents", false],
    ["employee", "view", true],
    ["employee", "editMenu", false],
    ["employee", "editPlace", false],
    ["employee", "manageEvents", false],
    ["employee", "manageMembers", false],
    ["employee", "manageCampaigns", false],
  ])("%s / %s = %s sem exigir partner global", (role, permission, expected) => {
    expect(allowsPlace(user, place, member(role), permission)).toBe(expected);
  });
  it("nega usuário externo e mantém admin ativo", () => {
    expect(allowsPlace(user, place, null, "view")).toBe(false);
    expect(
      allowsPlace(
        parseUser("admin", { role: "admin" }),
        place,
        null,
        "manageMembers",
      ),
    ).toBe(true);
    expect(
      allowsPlace(
        parseUser("admin", { role: "admin", active: false }),
        place,
        null,
        "view",
      ),
    ).toBe(false);
  });
  it("mantém proprietário legado apenas na ausência de vínculo explícito", () => {
    const owned = { ...place, ownerId: user.id };
    expect(allowsPlace(user, owned, null, "manageMembers")).toBe(true);
    expect(allowsPlace(user, owned, member("owner", false), "view")).toBe(
      false,
    );
    expect(allowsPlace(user, owned, member("employee"), "editPlace")).toBe(
      false,
    );
  });
  it("isola pessoas e estabelecimentos", () => {
    expect(
      allowsPlace(user, place, { ...member("owner"), uid: "other" }, "view"),
    ).toBe(false);
    expect(
      allowsPlace(user, { ...place, id: "p2" }, member("owner"), "view"),
    ).toBe(false);
  });
  it("rejeita papel inválido e active ausente sem promover membro", () => {
    expect(
      parseMembership("p1", user.id, { role: "admin", active: true }).active,
    ).toBe(false);
    expect(parseMembership("p1", user.id, { role: "owner" }).active).toBe(
      false,
    );
  });
  it("preserva vínculo legado de parceiro e criação restrita de local", () => {
    expect(
      allowsPlace(
        parseUser("p", { role: "partner", partnerId: "legacy" }),
        place,
        null,
        "manageMembers",
      ),
    ).toBe(true);
    expect(
      allowsPlace(
        parseUser("p", { role: "user", partnerId: "legacy" }),
        place,
        null,
        "view",
      ),
    ).toBe(false);
    expect(canCreatePlace(user)).toBe(false);
    expect(canCreatePlace(parseUser("admin", { role: "admin" }))).toBe(true);
  });
  it("gestão de evento usa vínculo, mantém autor avulso e bloqueia funcionário autor", () => {
    const event = parseEvent("event", {
      createdBy: "someone",
      placeId: place.id,
    });
    expect(allowsEvent(user, event, place, member("manager"))).toBe(true);
    expect(
      allowsEvent(user, event, place, member("manager"), "transferEvents"),
    ).toBe(false);
    expect(
      allowsEvent(
        user,
        { ...event, createdBy: user.id },
        place,
        member("employee"),
      ),
    ).toBe(false);
    expect(
      allowsEvent(
        user,
        { ...event, createdBy: user.id, placeId: null },
        null,
        null,
      ),
    ).toBe(true);
  });
});
