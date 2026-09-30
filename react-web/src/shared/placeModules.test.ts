import { describe, expect, it } from "vitest";
import {
  defaultPlaceModules,
  isPlaceModuleAvailable,
  parsePlaceModules,
  placeModuleCatalog,
  placeModuleDestination,
} from "./placeModules";
import { allowsPlace } from "./partnerPermissions";
import { parsePlace, parseUser } from "./domain";

describe("módulos do estabelecimento", () => {
  it("mantém os recursos existentes em locais sem configuração, sem gravar defaults", () => {
    const modules = parsePlaceModules();
    expect(isPlaceModuleAvailable(modules, "events")).toBe(true);
    expect(isPlaceModuleAvailable(modules, "menu")).toBe(true);
    expect(isPlaceModuleAvailable(modules, "team")).toBe(true);
    expect(isPlaceModuleAvailable(modules, "tables")).toBe(false);
  });
  it("eventos e equipe não são desativados por dados antigos ou assinatura", () => {
    const modules = parsePlaceModules({
      schemaVersion: 1,
      enabled: { events: false, team: false, menu: false },
      subscription: { status: "expired" },
    });
    expect(isPlaceModuleAvailable(modules, "events")).toBe(true);
    expect(isPlaceModuleAvailable(modules, "team")).toBe(true);
    expect(isPlaceModuleAvailable(modules, "menu")).toBe(false);
  });
  it("não apresenta módulos planejados como implementados, mesmo com flag habilitada", () => {
    for (const definition of placeModuleCatalog.filter(
      (definition) => definition.availability === "planned",
    )) {
      const config = defaultPlaceModules();
      config.enabled[definition.id] = true;
      expect(isPlaceModuleAvailable(config, definition.id)).toBe(false);
      expect(placeModuleDestination(definition.id, "place")).toBeNull();
    }
  });
  it("marca os módulos comerciais previstos como pagos", () => {
    expect(
      placeModuleCatalog
        .filter((definition) => definition.plannedPaid)
        .map((definition) => definition.id)
        .sort(),
    ).toEqual([
      "analytics",
      "inventory",
      "notifications",
      "orders",
      "purchases",
      "tables",
    ]);
  });
  it("mantém Mesas e Atendimentos separados e preserva rotas existentes", () => {
    expect(
      placeModuleCatalog.find(
        (definition) => definition.id === "serviceSessions",
      )?.label,
    ).toBe("Atendimentos");
    expect(placeModuleDestination("menu", "bar & rock")).toBe(
      "/places/menu?placeId=bar%20%26%20rock",
    );
    expect(placeModuleDestination("events", "p1")).toBe(
      "/partner-dashboard?placeId=p1#partner-events",
    );
    expect(placeModuleDestination("notifications", "p1")).toBe(
      "/places/notifications?placeId=p1",
    );
  });
  it("não compartilha configuração mutável entre estabelecimentos", () => {
    const one = defaultPlaceModules();
    one.enabled.menu = false;
    expect(defaultPlaceModules().enabled.menu).toBe(true);
  });
  it("rejeita versões/valores inválidos sem assumir módulos liberados", () => {
    expect(() => parsePlaceModules({ schemaVersion: 2, enabled: {} })).toThrow(
      "não suportada",
    );
    expect(() =>
      parsePlaceModules({ schemaVersion: 1, enabled: { menu: "true" } }),
    ).toThrow("inválida");
  });
  it("configuração exige owner ou admin, não apenas gestão operacional", () => {
    const place = parsePlace("p1", { ownerId: "owner" });
    expect(
      allowsPlace(parseUser("owner", {}), place, null, "manageModules"),
    ).toBe(true);
    expect(
      allowsPlace(
        parseUser("admin", { role: "admin" }),
        place,
        null,
        "manageModules",
      ),
    ).toBe(true);
    expect(
      allowsPlace(
        parseUser("manager", {}),
        place,
        {
          placeId: "p1",
          uid: "manager",
          role: "manager",
          active: true,
          createdAt: null,
        },
        "manageModules",
      ),
    ).toBe(false);
  });
});
