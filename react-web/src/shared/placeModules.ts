import type { PartnerPermission } from "./partnerPermissions";
import { isModuleEntitled, type PlaceEntitlements } from "./placeEntitlements";

export type PlaceModuleId =
  | "events"
  | "tables"
  | "serviceSessions"
  | "menu"
  | "orders"
  | "inventory"
  | "purchases"
  | "notifications"
  | "analytics"
  | "heatmap"
  | "team";
export type PlaceModuleGroup =
  | "content"
  | "operation"
  | "engagement"
  | "management";
export interface PlaceModuleDefinition {
  id: PlaceModuleId;
  label: string;
  description: string;
  group: PlaceModuleGroup;
  availability: "available" | "planned";
  defaultEnabled: boolean;
  alwaysEnabled: boolean;
  plannedPaid: boolean;
  permission: PartnerPermission;
}
// Product catalog, not a subscription/entitlement system. Keep keys stable for all clients.
export const placeModuleCatalog: readonly PlaceModuleDefinition[] = [
  {
    id: "events",
    label: "Eventos",
    description: "Programação, publicação e edição dos seus eventos.",
    group: "content",
    availability: "available",
    defaultEnabled: true,
    alwaysEnabled: true,
    plannedPaid: false,
    permission: "view",
  },
  {
    id: "tables",
    label: "Mesas",
    description: "Organização dos recursos físicos do estabelecimento.",
    group: "operation",
    availability: "available",
    defaultEnabled: false,
    alwaysEnabled: false,
    plannedPaid: true,
    permission: "view",
  },
  {
    id: "serviceSessions",
    label: "Atendimentos",
    description: "Jornada de consumo de clientes e grupos.",
    group: "operation",
    availability: "available",
    defaultEnabled: false,
    alwaysEnabled: false,
    plannedPaid: false,
    permission: "view",
  },
  {
    id: "menu",
    label: "Cardápio",
    description: "Produtos, categorias e preços do cardápio existente.",
    group: "operation",
    availability: "available",
    defaultEnabled: true,
    alwaysEnabled: false,
    plannedPaid: false,
    permission: "editMenu",
  },
  {
    id: "orders",
    label: "Pedidos",
    description: "Pedidos realizados dentro de um atendimento.",
    group: "operation",
    availability: "available",
    defaultEnabled: false,
    alwaysEnabled: false,
    plannedPaid: true,
    permission: "view",
  },
  {
    id: "inventory",
    label: "Estoque",
    description: "Controle de produtos e movimentações de estoque.",
    group: "management",
    availability: "available",
    defaultEnabled: false,
    alwaysEnabled: false,
    plannedPaid: true,
    permission: "view",
  },
  {
    id: "purchases",
    label: "Compras",
    description: "Compras e abastecimento do estabelecimento.",
    group: "management",
    availability: "available",
    defaultEnabled: false,
    alwaysEnabled: false,
    plannedPaid: true,
    permission: "view",
  },
  {
    id: "notifications",
    label: "Notificações",
    description: "Comunicação do estabelecimento com seu público.",
    group: "engagement",
    availability: "available",
    defaultEnabled: false,
    alwaysEnabled: false,
    plannedPaid: true,
    permission: "manageCampaigns",
  },
  {
    id: "analytics",
    label: "Analytics",
    description: "Análises detalhadas de desempenho do estabelecimento.",
    group: "engagement",
    availability: "planned",
    defaultEnabled: false,
    alwaysEnabled: false,
    plannedPaid: true,
    permission: "view",
  },
  {
    id: "heatmap",
    label: "Heatmap",
    description: "Análise de concentração e movimento do público.",
    group: "engagement",
    availability: "planned",
    defaultEnabled: false,
    alwaysEnabled: false,
    plannedPaid: false,
    permission: "view",
  },
  {
    id: "team",
    label: "Equipe",
    description: "Membros e permissões deste estabelecimento.",
    group: "management",
    availability: "available",
    defaultEnabled: true,
    alwaysEnabled: true,
    plannedPaid: false,
    permission: "manageMembers",
  },
];
export const placeModuleGroups: readonly {
  id: PlaceModuleGroup;
  label: string;
}[] = [
  { id: "content", label: "Conteúdo" },
  { id: "operation", label: "Operação" },
  { id: "management", label: "Gestão" },
  { id: "engagement", label: "Engajamento" },
];
export interface PlaceModules {
  schemaVersion: 1;
  enabled: Record<PlaceModuleId, boolean>;
}
export const defaultPlaceModules = (): PlaceModules => ({
  schemaVersion: 1,
  enabled: Object.fromEntries(
    placeModuleCatalog.map((definition) => [
      definition.id,
      definition.defaultEnabled,
    ]),
  ) as Record<PlaceModuleId, boolean>,
});
export function parsePlaceModules(
  data?: Record<string, unknown>,
): PlaceModules {
  const result = defaultPlaceModules();
  if (!data) return result;
  if (
    data.schemaVersion !== 1 ||
    !data.enabled ||
    typeof data.enabled !== "object" ||
    Array.isArray(data.enabled)
  )
    throw Error("Configuração de módulos não suportada.");
  const enabled = data.enabled as Record<string, unknown>;
  for (const definition of placeModuleCatalog) {
    if (definition.alwaysEnabled) continue;
    if (definition.id in enabled) {
      if (typeof enabled[definition.id] !== "boolean")
        throw Error("Configuração de módulos inválida.");
      result.enabled[definition.id] = enabled[definition.id] as boolean;
    }
  }
  return result;
}
export function moduleDefinition(id: PlaceModuleId) {
  const result = placeModuleCatalog.find((definition) => definition.id === id);
  if (!result) throw Error("Módulo desconhecido.");
  return result;
}
export function isPlaceModuleEnabled(config: PlaceModules, id: PlaceModuleId) {
  return moduleDefinition(id).alwaysEnabled || config.enabled[id] === true;
}
export function isPlaceModuleAvailable(
  config: PlaceModules,
  id: PlaceModuleId,
  entitlements?: PlaceEntitlements,
) {
  return (
    moduleDefinition(id).availability === "available" &&
    isPlaceModuleEnabled(config, id) &&
    (!entitlements || isModuleEntitled(entitlements, id))
  );
}
// Existing URLs and event CRUD are reused; planned modules intentionally have no route.
export function placeModuleDestination(
  id: PlaceModuleId,
  placeId: string,
): string | null {
  if (id === "events")
    return `/partner-dashboard?placeId=${encodeURIComponent(placeId)}#partner-events`;
  if (id === "team")
    return `/partner-dashboard?placeId=${encodeURIComponent(placeId)}#partner-team`;
  if (id === "menu")
    return `/places/menu?placeId=${encodeURIComponent(placeId)}`;
  if (id === "serviceSessions")
    return `/places/service-sessions?placeId=${encodeURIComponent(placeId)}`;
  if (id === "tables")
    return `/places/tables?placeId=${encodeURIComponent(placeId)}`;
  if (id === "orders")
    return `/places/orders?placeId=${encodeURIComponent(placeId)}`;
  if (id === "inventory")
    return `/places/inventory?placeId=${encodeURIComponent(placeId)}`;
  if (id === "purchases")
    return `/places/purchases?placeId=${encodeURIComponent(placeId)}`;
  if (id === "notifications")
    return `/places/notifications?placeId=${encodeURIComponent(placeId)}`;
  return null;
}
