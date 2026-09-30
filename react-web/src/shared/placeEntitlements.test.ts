import { describe, expect, it } from "vitest";
import {
  emptyPlaceEntitlements,
  hasEntitlement,
  isModuleEntitled,
  parsePlaceEntitlements,
} from "./placeEntitlements";

describe("entitlements comerciais", () => {
  it("não concede recurso pago quando o documento está ausente", () => {
    const free = parsePlaceEntitlements();
    expect(isModuleEntitled(free, "events")).toBe(true);
    expect(isModuleEntitled(free, "menu")).toBe(true);
    expect(isModuleEntitled(free, "orders")).toBe(false);
  });

  it("aceita recurso ativo ou em teste dentro da validade", () => {
    const entitlement = emptyPlaceEntitlements();
    entitlement.status = "trialing";
    entitlement.features.orders = true;
    entitlement.validUntil = new Date("2030-01-01T00:00:00Z");
    expect(hasEntitlement(entitlement, "orders", new Date("2029-01-01"))).toBe(
      true,
    );
    expect(hasEntitlement(entitlement, "orders", new Date("2031-01-01"))).toBe(
      false,
    );
    entitlement.status = "past_due";
    expect(hasEntitlement(entitlement, "orders", new Date("2029-01-01"))).toBe(
      false,
    );
  });

  it("rejeita documentos incompletos ou adulterados", () => {
    expect(() =>
      parsePlaceEntitlements({
        schemaVersion: 1,
        planKey: "pro",
        status: "active",
        features: {},
      }),
    ).toThrow("inválido");
  });
});
