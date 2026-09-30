import { paidFeatures, type PaidFeature } from "./placeEntitlements";

export interface CommercialPlan {
  key: string;
  name: string;
  description: string;
  active: boolean;
  features: Record<PaidFeature, boolean>;
  displayOrder: number;
}

// Plans contain capabilities only. Price, currency, billing interval, discounts and
// provider product IDs belong to trusted commercial infrastructure.
export function parseCommercialPlan(
  key: string,
  data: Record<string, unknown>,
): CommercialPlan {
  if (
    typeof data.name !== "string" ||
    typeof data.description !== "string" ||
    typeof data.active !== "boolean" ||
    typeof data.displayOrder !== "number" ||
    !Number.isInteger(data.displayOrder) ||
    !data.features ||
    typeof data.features !== "object" ||
    Array.isArray(data.features)
  )
    throw Error("Configuração de plano inválida.");
  const raw = data.features as Record<string, unknown>;
  if (paidFeatures.some((feature) => typeof raw[feature] !== "boolean"))
    throw Error("Configuração de plano inválida.");
  return {
    key,
    name: data.name,
    description: data.description,
    active: data.active,
    displayOrder: data.displayOrder,
    features: Object.fromEntries(
      paidFeatures.map((feature) => [feature, raw[feature]]),
    ) as Record<PaidFeature, boolean>,
  };
}
