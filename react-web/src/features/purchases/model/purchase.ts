import {
  inventoryUnits,
  validStock,
  type InventoryUnit,
} from "../../inventory/model/inventory";

export const purchaseStatuses = [
  "draft",
  "ordered",
  "received",
  "cancelled",
] as const;
export type PurchaseStatus = (typeof purchaseStatuses)[number];
export interface Supplier {
  id: string;
  name: string;
  contact: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}
export interface PurchaseOrder {
  id: string;
  supplierId: string;
  status: PurchaseStatus;
  notes: string;
  itemCount: number;
  totalCostCents: number;
  orderedAt: Date | null;
  receivedAt: Date | null;
  createdBy: string;
  receivedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface PurchaseItem {
  id: string;
  purchaseOrderId: string;
  inventoryItemId: string;
  name: string;
  unit: InventoryUnit;
  quantityMilli: number;
  receivedMilli: number;
  unitCostMicros: number;
  totalCostCents: number;
}
export interface PurchaseItemInput {
  inventoryItemId: string;
  quantityMilli: number;
  unitCostMicros: number;
}
export function validateSupplier(
  input: Pick<Supplier, "name" | "contact" | "active">,
) {
  if (
    !input.name?.trim() ||
    input.name.trim().length > 120 ||
    typeof input.contact !== "string" ||
    input.contact.length > 300 ||
    typeof input.active !== "boolean"
  )
    throw Error("Fornecedor inválido. Confira nome, contato e situação.");
  return {
    name: input.name.trim(),
    contact: input.contact.trim(),
    active: input.active,
  };
}
export function purchaseLine(quantityMilli: number, unitCostMicros: number) {
  if (
    !validStock(quantityMilli) ||
    quantityMilli === 0 ||
    !Number.isSafeInteger(unitCostMicros) ||
    unitCostMicros < 0 ||
    unitCostMicros > 1_000_000_000_000
  )
    throw Error("Quantidade ou custo inválido.");
  const totalCostCents = Math.round(
    (quantityMilli * unitCostMicros) / 10_000_000,
  );
  if (!Number.isSafeInteger(totalCostCents) || totalCostCents < 0)
    throw Error("Custo total fora do limite.");
  return totalCostCents;
}
export function validatePurchaseItems(items: readonly PurchaseItemInput[]) {
  if (
    items.length < 1 ||
    items.length > 5 ||
    new Set(items.map((item) => item.inventoryItemId)).size !== items.length
  )
    throw Error("O pedido deve ter de 1 a 5 insumos diferentes.");
  for (const item of items) {
    if (!item.inventoryItemId || item.inventoryItemId.includes("/"))
      throw Error("Insumo inválido.");
    purchaseLine(item.quantityMilli, item.unitCostMicros);
  }
  return items;
}
export function validatePurchaseItemSnapshot(item: PurchaseItem) {
  if (
    !inventoryUnits.includes(item.unit) ||
    !validStock(item.quantityMilli) ||
    item.quantityMilli === 0 ||
    !validStock(item.receivedMilli) ||
    item.receivedMilli > item.quantityMilli ||
    purchaseLine(item.quantityMilli, item.unitCostMicros) !==
      item.totalCostCents
  )
    throw Error("Item de compra inconsistente.");
  return item;
}
export function lowStockNeeds(
  items: readonly {
    id: string;
    active: boolean;
    stockMilli: number;
    minimumMilli: number;
  }[],
) {
  return items
    .filter((item) => item.active && item.stockMilli <= item.minimumMilli)
    .map((item) => ({
      inventoryItemId: item.id,
      missingToMinimumMilli: Math.max(0, item.minimumMilli - item.stockMilli),
    }));
}
