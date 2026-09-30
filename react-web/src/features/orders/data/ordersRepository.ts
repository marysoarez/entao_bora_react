import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type Transaction,
} from "firebase/firestore";
import { assertProductWritesEnabled, database } from "../../../core/firebase";
import { PartnerAccessService } from "../../../core/partnerAccessService";
import { PlaceModulesService } from "../../../core/placeModulesService";
import { parsePlace } from "../../../shared/domain";
import type { User } from "../../../shared/models";
import {
  serviceTypes,
  type ServiceType,
} from "../../service-sessions/model/serviceSession";
import {
  orderStatuses,
  orderSubtotal,
  snapshotOrderItem,
  validId,
  validateOrderInput,
  validateOrderTransition,
  type CreateOrderInput,
  type Order,
  type OrderStatus,
} from "../model/order";

const ordersRef = (placeId: string) =>
  collection(database(), "places", placeId, "orders");
async function authorize(
  placeId: string,
  user: User,
  write: boolean,
  tx?: Transaction,
) {
  if (!validId(placeId) || !user.active) throw Error("Acesso indisponível.");
  const ref = doc(database(), "places", placeId);
  const place = await (tx ? tx.get(ref) : getDoc(ref));
  if (
    !place.exists() ||
    !(await PartnerAccessService.canPlace(
      user,
      parsePlace(place.id, place.data()),
      write ? "manageOrders" : "view",
      tx,
    ))
  )
    throw Error("Sem permissão para acessar os pedidos deste estabelecimento.");
  await PlaceModulesService.assertAvailable(placeId, "orders", tx);
  return place.data();
}
function date(value: unknown): Date {
  if (value instanceof Date) return value;
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  )
    return value.toDate();
  throw Error("Data do pedido inválida.");
}
export function parseOrder(
  id: string,
  placeId: string,
  data: Record<string, unknown>,
): Order {
  if (
    data.id !== id ||
    data.placeId !== placeId ||
    !orderStatuses.includes(data.status as OrderStatus) ||
    !serviceTypes.includes(data.serviceType as ServiceType)
  )
    throw Error("Pedido inválido.");
  return {
    ...data,
    id,
    placeId,
    createdAt: date(data.createdAt),
    updatedAt: date(data.updatedAt),
  } as Order;
}
export const OrdersRepository = {
  watch(
    placeId: string,
    user: User,
    onChange: (orders: Order[], metadata: { fromCache: boolean }) => void,
    onError: (error: Error) => void,
  ) {
    let cancelled = false;
    let latestOrders: Order[] = [];
    let stop = () => {};
    void authorize(placeId, user, false)
      .then(() => {
        if (cancelled) return;
        stop = onSnapshot(
          ordersRef(placeId),
          { includeMetadataChanges: true },
          (snapshot) => {
            if (cancelled) return;
            // Wait for server timestamps so optimistic snapshots cannot break parsing.
            if (snapshot.metadata.hasPendingWrites) {
              onChange(latestOrders, { fromCache: true });
              return;
            }
            try {
              latestOrders = snapshot.docs
                .map((s) => parseOrder(s.id, placeId, s.data()))
                .sort(
                  (a, b) =>
                    +b.createdAt - +a.createdAt || a.id.localeCompare(b.id),
                );
              onChange(latestOrders, {
                fromCache: snapshot.metadata.fromCache,
              });
            } catch (error) {
              onError(error as Error);
            }
          },
          (error) => {
            if (!cancelled) onError(error);
          },
        );
      })
      .catch((error: Error) => {
        if (!cancelled) onError(error);
      });
    return () => {
      cancelled = true;
      stop();
    };
  },
  async create(placeId: string, input: CreateOrderInput, user: User) {
    assertProductWritesEnabled("Pedidos");
    const fields = validateOrderInput(input);
    const ref = doc(ordersRef(placeId));
    await runTransaction(database(), async (tx) => {
      const place = await authorize(placeId, user, true, tx);
      await PlaceModulesService.assertAvailable(placeId, "serviceSessions", tx);
      await PlaceModulesService.assertAvailable(placeId, "menu", tx);
      if (place.menuSchemaVersion !== 2)
        throw Error("Prepare o cardápio antes de registrar pedidos.");
      const session = await tx.get(
        doc(
          database(),
          "places",
          placeId,
          "serviceSessions",
          fields.serviceSessionId,
        ),
      );
      if (
        !session.exists() ||
        session.data().status !== "open" ||
        session.data().placeId !== placeId
      )
        throw Error("O atendimento deve estar aberto neste estabelecimento.");
      const { tableId, serviceType } = session.data();
      if (
        !serviceTypes.includes(serviceType) ||
        (serviceType === "table" ? !validId(tableId) : tableId !== null)
      )
        throw Error("Atendimento inconsistente.");
      const items = await Promise.all(
        fields.items.map(async (line) => {
          const product = await tx.get(
            doc(database(), "places", placeId, "menuItems", line.menuItemId),
          );
          if (
            !product.exists() ||
            product.data().active !== true ||
            product.data().available !== true
          )
            throw Error("Produto indisponível. Atualize o pedido.");
          const data = product.data();
          const category = await tx.get(
            doc(
              database(),
              "places",
              placeId,
              "menuCategories",
              data.categoryId,
            ),
          );
          if (!category.exists() || category.data().active !== true)
            throw Error("Categoria indisponível.");
          return snapshotOrderItem(
            line.menuItemId,
            { name: data.name, price: data.price },
            line.quantity,
          );
        }),
      );
      const subtotal = orderSubtotal(items);
      tx.set(ref, {
        id: ref.id,
        placeId,
        serviceSessionId: fields.serviceSessionId,
        tableId,
        serviceType,
        customerUid: fields.customerUid,
        status: "pending",
        items,
        subtotal,
        total: subtotal,
        notes: fields.notes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    return ref.id;
  },
  async updateStatus(
    placeId: string,
    id: string,
    status: OrderStatus,
    user: User,
  ) {
    assertProductWritesEnabled("Pedidos");
    if (!validId(id)) throw Error("Pedido inválido.");
    await runTransaction(database(), async (tx) => {
      await authorize(placeId, user, true, tx);
      const ref = doc(database(), "places", placeId, "orders", id);
      const current = await tx.get(ref);
      if (!current.exists()) throw Error("Pedido não encontrado.");
      validateOrderTransition(current.data().status, status);
      if (status === "cancelled") {
        const session = await tx.get(
          doc(
            database(),
            "places",
            placeId,
            "serviceSessions",
            current.data().serviceSessionId,
          ),
        );
        if (!session.exists() || session.data().status !== "open")
          throw Error(
            "Não é possível cancelar pedidos de um atendimento encerrado.",
          );
      }
      tx.update(ref, { status, updatedAt: serverTimestamp() });
    });
  },
};
