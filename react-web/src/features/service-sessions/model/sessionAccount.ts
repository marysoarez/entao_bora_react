import type { Order } from "../../orders/model/order";
import type { ServiceSession } from "./serviceSession";

export function sessionAccount(
  session: Pick<ServiceSession, "id" | "placeId">,
  orders: readonly Order[],
) {
  const rows = orders
    .filter(
      (order) =>
        order.placeId === session.placeId &&
        order.serviceSessionId === session.id,
    )
    .sort((a, b) => +a.createdAt - +b.createdAt || a.id.localeCompare(b.id));
  const ids = new Set<string>();
  let totalCents = 0;
  for (const order of rows) {
    if (ids.has(order.id)) throw Error("Pedido duplicado na conta.");
    ids.add(order.id);
    const cents = Math.round(order.total * 100);
    if (
      !Number.isSafeInteger(cents) ||
      cents < 0 ||
      Math.abs(order.total * 100 - cents) > 0.0001
    )
      throw Error(
        "Valor de pedido inválido. Confira os registros antes de fechar.",
      );
    if (order.status !== "cancelled") totalCents += cents;
    if (!Number.isSafeInteger(totalCents))
      throw Error("Total da conta excede o limite suportado.");
  }
  return { orders: rows, totalCents };
}
