import type { PlaceModuleId } from "./placeModules";

export type PaidFeature =
  | "notifications"
  | "tables"
  | "orders"
  | "inventory"
  | "purchases"
  | "advancedAnalytics";
export type EntitlementStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "cancelled"
  | "expired";

export interface PlaceEntitlements {
  schemaVersion: 1;
  planKey: string;
  status: EntitlementStatus;
  features: Record<PaidFeature, boolean>;
  validUntil: Date | null;
}

export const paidFeatures: readonly PaidFeature[] = [
  "notifications",
  "tables",
  "orders",
  "inventory",
  "purchases",
  "advancedAnalytics",
];

export function emptyPlaceEntitlements(): PlaceEntitlements {
  return {
    schemaVersion: 1,
    planKey: "free",
    status: "active",
    features: Object.fromEntries(
      paidFeatures.map((feature) => [feature, false]),
    ) as Record<PaidFeature, boolean>,
    validUntil: null,
  };
}

function date(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  )
    return value.toDate() as Date;
  if (value instanceof Date) return value;
  throw Error("Validade do plano inválida.");
}

export function parsePlaceEntitlements(
  data?: Record<string, unknown>,
): PlaceEntitlements {
  if (!data) return emptyPlaceEntitlements();
  if (
    data.schemaVersion !== 1 ||
    typeof data.planKey !== "string" ||
    !["active", "trialing", "past_due", "cancelled", "expired"].includes(
      String(data.status),
    ) ||
    !data.features ||
    typeof data.features !== "object" ||
    Array.isArray(data.features)
  )
    throw Error("Entitlement comercial inválido.");
  const raw = data.features as Record<string, unknown>;
  if (paidFeatures.some((feature) => typeof raw[feature] !== "boolean"))
    throw Error("Entitlement comercial inválido.");
  return {
    schemaVersion: 1,
    planKey: data.planKey,
    status: data.status as EntitlementStatus,
    features: Object.fromEntries(
      paidFeatures.map((feature) => [feature, raw[feature]]),
    ) as Record<PaidFeature, boolean>,
    validUntil: date(data.validUntil),
  };
}

export function modulePaidFeature(moduleId: PlaceModuleId): PaidFeature | null {
  if (moduleId === "analytics" || moduleId === "heatmap")
    return "advancedAnalytics";
  return paidFeatures.includes(moduleId as PaidFeature)
    ? (moduleId as PaidFeature)
    : null;
}

export function hasEntitlement(
  entitlements: PlaceEntitlements,
  feature: PaidFeature,
  now = new Date(),
) {
  return (
    ["active", "trialing"].includes(entitlements.status) &&
    (!entitlements.validUntil || entitlements.validUntil > now) &&
    entitlements.features[feature] === true
  );
}

export function isModuleEntitled(
  entitlements: PlaceEntitlements,
  moduleId: PlaceModuleId,
  now = new Date(),
) {
  const feature = modulePaidFeature(moduleId);
  return !feature || hasEntitlement(entitlements, feature, now);
}
