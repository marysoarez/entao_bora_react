import type { ServiceType } from "../../service-sessions/model/serviceSession";

export const orderStatuses = [
  "pending",
  "accepted",
  "preparing",
  "ready",
  "delivered",
  "cancelled",
] as const;
export type OrderStatus = (typeof orderStatuses)[number];
export const orderStatusLabels: Record<OrderStatus, string> = {
  pending: "Novo pedido",
  accepted: "Aceito",
  preparing: "Preparando",
  ready: "Pronto",
  delivered: "Entregue",
  cancelled: "Cancelado",
};
// Bounded document validation in Security Rules; another order may use the same session.
export const MAX_ORDER_ITEMS = 5;
export interface OrderItem {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}
export interface Order {
  id: string;
  placeId: string;
  serviceSessionId: string;
  tableId: string | null;
  customerUid: string | null;
  serviceType: ServiceType;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  total: number;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface CreateOrderInput {
  serviceSessionId: string;
  customerUid?: string | null;
  items: { menuItemId: string; quantity: number }[];
  notes: string;
}
export function validId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    !!value.trim() &&
    !value.includes("/") &&
    value.length <= 1500
  );
}
export function validateOrderInput(input: CreateOrderInput): CreateOrderInput {
  if (!validId(input.serviceSessionId))
    throw Error("Selecione um atendimento aberto.");
  if (input.customerUid != null && !validId(input.customerUid))
    throw Error("Cliente inválido.");
  if (typeof input.notes !== "string" || input.notes.length > 2000)
    throw Error("Observações devem ter até 2000 caracteres.");
  if (
    !Array.isArray(input.items) ||
    !input.items.length ||
    input.items.length > MAX_ORDER_ITEMS
  )
    throw Error(`Selecione de 1 a ${MAX_ORDER_ITEMS} produtos por pedido.`);
  if (
    new Set(input.items.map((item) => item.menuItemId)).size !==
    input.items.length
  )
    throw Error("Agrupe as quantidades do mesmo produto.");
  for (const item of input.items) {
    if (
      !validId(item.menuItemId) ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 999
    )
      throw Error("Produto ou quantidade inválidos (1 a 999).");
  }
  return {
    ...input,
    customerUid: input.customerUid ?? null,
    notes: input.notes.trim(),
  };
}
export function snapshotOrderItem(
  menuItemId: string,
  product: { name: string; price: number },
  quantity: number,
): OrderItem {
  const cents = Math.round(product.price * 100);
  if (
    !validId(menuItemId) ||
    typeof product.name !== "string" ||
    !product.name.trim() ||
    product.name.length > 100 ||
    !Number.isFinite(product.price) ||
    product.price < 0 ||
    product.price > 999999.99 ||
    Math.abs(product.price * 100 - cents) > 0.000001 ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > 999
  )
    throw Error("Produto ou preço inválido.");
  return {
    menuItemId,
    name: product.name,
    quantity,
    unitPrice: cents / 100,
    total: (cents * quantity) / 100,
  };
}
export function orderSubtotal(items: OrderItem[]) {
  return (
    items.reduce(
      (sum, item) => sum + Math.round(item.unitPrice * 100) * item.quantity,
      0,
    ) / 100
  );
}
export function nextOrderStatus(status: OrderStatus): OrderStatus | null {
  const flow: OrderStatus[] = [
    "pending",
    "accepted",
    "preparing",
    "ready",
    "delivered",
  ];
  const index = flow.indexOf(status);
  return index >= 0 ? (flow[index + 1] ?? null) : null;
}
export function validateOrderTransition(
  current: OrderStatus,
  next: OrderStatus,
) {
  if (
    !orderStatuses.includes(current) ||
    !orderStatuses.includes(next) ||
    current === "delivered" ||
    current === "cancelled" ||
    (next !== "cancelled" && next !== nextOrderStatus(current))
  )
    throw Error("Transição de pedido inválida.");
}
export function orderLocation(
  order: Pick<Order, "serviceType" | "tableId">,
  tables: { id: string; number: number }[] = [],
) {
  if (order.tableId !== null) {
    const table = tables.find((row) => row.id === order.tableId);
    return `Mesa ${table ? String(table.number).padStart(2, "0") : order.tableId}`;
  }
  return {
    counter: "Balcão",
    lounge: "Salão",
    takeaway: "Retirada",
    table: "Mesa",
  }[order.serviceType];
}
