import { collection, doc, onSnapshot, query, runTransaction, serverTimestamp, where } from "firebase/firestore";
import { assertProductWritesEnabled, database } from "../../../core/firebase";
import type { User } from "../../../shared/models";
import { parseOrder } from "../../orders/data/ordersRepository";
import { orderSubtotal, snapshotOrderItem, validateOrderInput, type CreateOrderInput, type Order } from "../../orders/model/order";
import type { QrContext } from "../model/qrContext";

export const QrOrdersRepository = {
  watch(placeId: string, uid: string, onChange: (orders: Order[]) => void, onError: (error: Error) => void) {
    return onSnapshot(query(collection(database(), "places", placeId, "orders"), where("customerUid", "==", uid)), snapshot => {
      if (snapshot.metadata.hasPendingWrites) return;
      try {
        onChange(snapshot.docs.map(row => parseOrder(row.id, placeId, row.data()))
          .sort((a, b) => +b.createdAt - +a.createdAt || a.id.localeCompare(b.id)));
      } catch (error) { onError(error as Error); }
    }, onError);
  },
  async create(context: QrContext, input: Omit<CreateOrderInput, "serviceSessionId" | "customerUid">, user: User) {
    assertProductWritesEnabled("Pedido por QR");
    if (!user.active || context.userId !== user.id) throw Error("Contexto de atendimento inválido.");
    const fields = validateOrderInput({ ...input, serviceSessionId: context.serviceSessionId, customerUid: user.id });
    const db = database();
    const ref = doc(collection(db, "places", context.placeId, "orders"));
    await runTransaction(db, async tx => {
      const savedContext = await tx.get(doc(db, "places", context.placeId, "customerContexts", user.id));
      if (!savedContext.exists() || savedContext.data().serviceSessionId !== context.serviceSessionId || savedContext.data().tableId !== context.tableId)
        throw Error("Escaneie o QR novamente para atualizar o atendimento.");
      const session = await tx.get(doc(db, "places", context.placeId, "serviceSessions", context.serviceSessionId));
      if (!session.exists() || session.data().status !== "open" || session.data().tableId !== context.tableId)
        throw Error("Este atendimento foi encerrado. Escaneie o QR novamente.");
      const items = await Promise.all(fields.items.map(async line => {
        const product = await tx.get(doc(db, "places", context.placeId, "menuItems", line.menuItemId));
        if (!product.exists() || product.data().active !== true || product.data().available !== true)
          throw Error("Produto indisponível. Atualize o cardápio.");
        const data = product.data();
        const category = await tx.get(doc(db, "places", context.placeId, "menuCategories", data.categoryId));
        if (!category.exists() || category.data().active !== true) throw Error("Categoria indisponível.");
        return snapshotOrderItem(line.menuItemId, { name: data.name, price: data.price }, line.quantity);
      }));
      const subtotal = orderSubtotal(items);
      tx.set(ref, { id: ref.id, placeId: context.placeId, serviceSessionId: context.serviceSessionId,
        tableId: context.tableId, serviceType: session.data().serviceType, customerUid: user.id,
        status: "pending", items, subtotal, total: subtotal, notes: fields.notes,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    });
    return ref.id;
  },
};
