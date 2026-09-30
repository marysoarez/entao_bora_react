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
import { stockAfter } from "../../inventory/model/inventory";
import {
  purchaseLine,
  validatePurchaseItems,
  validateSupplier,
  type PurchaseItem,
  type PurchaseItemInput,
  type PurchaseOrder,
  type Supplier,
} from "../model/purchase";

function validId(value: string) {
  if (!value || value.includes("/") || value.length > 1500)
    throw Error("Identificação inválida.");
  return value;
}
const group = (placeId: string, kind: string) =>
  collection(database(), "places", validId(placeId), kind);
const ref = (placeId: string, kind: string, value: string) =>
  doc(group(placeId, kind), validId(value));
async function authorize(
  placeId: string,
  user: User,
  write: boolean,
  tx?: Transaction,
) {
  const placeRef = doc(database(), "places", validId(placeId));
  const place = await (tx ? tx.get(placeRef) : getDoc(placeRef));
  if (
    !user.active ||
    !place.exists() ||
    !(await PartnerAccessService.canPlace(
      user,
      parsePlace(place.id, place.data()),
      write ? "managePurchases" : "view",
      tx,
    ))
  )
    throw Error("Sem permissão para acessar compras.");
  await PlaceModulesService.assertAvailable(placeId, "purchases", tx);
  if (write)
    await PlaceModulesService.assertAvailable(placeId, "inventory", tx);
}
function date(value: unknown): Date | null {
  if (value === null) return null;
  if (value instanceof Date) return value;
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  )
    return value.toDate();
  return null;
}
export const PurchasesRepository = {
  watch(
    placeId: string,
    user: User,
    onChange: (
      suppliers: Supplier[],
      orders: PurchaseOrder[],
      items: PurchaseItem[],
    ) => void,
    onError: (error: Error) => void,
  ) {
    let alive = true,
      suppliers: Supplier[] | null = null,
      orders: PurchaseOrder[] | null = null,
      items: PurchaseItem[] | null = null;
    const stops: (() => void)[] = [];
    const publish = () => {
      if (alive && suppliers && orders && items)
        onChange(suppliers, orders, items);
    };
    void authorize(placeId, user, false)
      .then(() => {
        if (!alive) return;
        const watch = (
          kind: string,
          set: (rows: Record<string, unknown>[]) => void,
        ) =>
          stops.push(
            onSnapshot(
              group(placeId, kind),
              (snapshot) => {
                if (!alive || snapshot.metadata.hasPendingWrites) return;
                set(
                  snapshot.docs.map((row) => ({
                    ...row.data(),
                    id: row.id,
                    createdAt: date(row.data().createdAt),
                    updatedAt: date(row.data().updatedAt),
                    orderedAt: date(row.data().orderedAt),
                    receivedAt: date(row.data().receivedAt),
                  })),
                );
                publish();
              },
              (error) => {
                if (alive) onError(error);
              },
            ),
          );
        watch(
          "suppliers",
          (rows) =>
            (suppliers = (rows as unknown as Supplier[]).sort((a, b) =>
              a.name.localeCompare(b.name),
            )),
        );
        watch(
          "purchaseOrders",
          (rows) =>
            (orders = (rows as unknown as PurchaseOrder[]).sort(
              (a, b) => +b.createdAt - +a.createdAt,
            )),
        );
        watch(
          "purchaseItems",
          (rows) => (items = rows as unknown as PurchaseItem[]),
        );
      })
      .catch((error) => {
        if (alive) onError(error);
      });
    return () => {
      alive = false;
      stops.forEach((stop) => stop());
    };
  },
  async saveSupplier(
    placeId: string,
    supplierId: string | null,
    input: Pick<Supplier, "name" | "contact" | "active">,
    user: User,
  ) {
    assertProductWritesEnabled("Fornecedores");
    const fields = validateSupplier(input);
    const supplier = supplierId
      ? ref(placeId, "suppliers", supplierId)
      : doc(group(placeId, "suppliers"));
    await runTransaction(database(), async (tx) => {
      await authorize(placeId, user, true, tx);
      const old = await tx.get(supplier);
      if (supplierId && !old.exists())
        throw Error("Fornecedor não encontrado.");
      if (old.exists())
        tx.update(supplier, { ...fields, updatedAt: serverTimestamp() });
      else
        tx.set(supplier, {
          ...fields,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: user.id,
        });
    });
    return supplier.id;
  },
  async createOrder(
    placeId: string,
    supplierId: string,
    input: { notes: string; items: PurchaseItemInput[] },
    user: User,
  ) {
    assertProductWritesEnabled("Pedido de compra");
    validatePurchaseItems(input.items);
    if (input.notes.length > 1000)
      throw Error("Observações devem ter até 1000 caracteres.");
    const order = doc(group(placeId, "purchaseOrders"));
    await runTransaction(database(), async (tx) => {
      await authorize(placeId, user, true, tx);
      const [supplier, ...inventory] = await Promise.all([
        tx.get(ref(placeId, "suppliers", supplierId)),
        ...input.items.map((row) =>
          tx.get(ref(placeId, "inventoryItems", row.inventoryItemId)),
        ),
      ]);
      if (!supplier.exists() || !supplier.data().active)
        throw Error("Fornecedor indisponível.");
      const snapshots = input.items.map((row, index) => {
        const item = inventory[index];
        if (!item.exists() || !item.data().active)
          throw Error("Insumo indisponível.");
        return {
          purchaseOrderId: order.id,
          inventoryItemId: item.id,
          name: item.data().name,
          unit: item.data().unit,
          quantityMilli: row.quantityMilli,
          receivedMilli: 0,
          unitCostMicros: row.unitCostMicros,
          totalCostCents: purchaseLine(row.quantityMilli, row.unitCostMicros),
        };
      });
      const totalCostCents = snapshots.reduce(
        (total, row) => total + row.totalCostCents,
        0,
      );
      if (!Number.isSafeInteger(totalCostCents))
        throw Error("Custo total fora do limite.");
      tx.set(order, {
        supplierId,
        status: "ordered",
        notes: input.notes.trim(),
        itemCount: snapshots.length,
        totalCostCents,
        orderedAt: serverTimestamp(),
        receivedAt: null,
        createdBy: user.id,
        receivedBy: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      snapshots.forEach((row, index) =>
        tx.set(ref(placeId, "purchaseItems", `${order.id}_${index + 1}`), row),
      );
    });
    return order.id;
  },
  async receive(
    placeId: string,
    orderId: string,
    operationId: string,
    user: User,
  ) {
    assertProductWritesEnabled("Recebimento de compra");
    const order = ref(placeId, "purchaseOrders", orderId);
    return runTransaction(database(), async (tx) => {
      await authorize(placeId, user, true, tx);
      const current = await tx.get(order);
      if (!current.exists()) throw Error("Pedido de compra não encontrado.");
      if (current.data().status === "received") {
        if (current.data().receiptOperationId === operationId) return;
        throw Error("Pedido já recebido.");
      }
      if (current.data().status !== "ordered")
        throw Error("Somente pedidos enviados podem ser recebidos.");
      const itemRefs = Array.from(
        { length: current.data().itemCount },
        (_, index) => ref(placeId, "purchaseItems", `${orderId}_${index + 1}`),
      );
      const purchaseItems = await Promise.all(
        itemRefs.map((row) => tx.get(row)),
      );
      if (
        purchaseItems.some(
          (row) => !row.exists() || row.data().purchaseOrderId !== orderId,
        )
      )
        throw Error("Itens do pedido inconsistentes.");
      const purchaseData = purchaseItems.map((row) => row.data()!);
      const inventoryRefs = purchaseData.map((data) =>
        ref(placeId, "inventoryItems", data.inventoryItemId),
      );
      const inventory = await Promise.all(
        inventoryRefs.map((row) => tx.get(row)),
      );
      purchaseData.forEach((data, index) => {
        const item = inventory[index];
        if (!item?.exists() || item.data()!.unit !== data.unit)
          throw Error("Insumo incompatível com a compra.");
        const remaining = data.quantityMilli - data.receivedMilli;
        if (remaining <= 0)
          throw Error("Quantidade de recebimento inconsistente.");
        const movementId = `purchase_${operationId}_${index + 1}`;
        const afterMilli = stockAfter(item.data()!.stockMilli, remaining);
        tx.set(
          doc(collection(inventoryRefs[index]!, "movements"), movementId),
          {
            itemId: item.id,
            type: "entry",
            deltaMilli: remaining,
            beforeMilli: item.data()!.stockMilli,
            afterMilli,
            unit: data.unit,
            reason: `Recebimento da compra ${orderId}`,
            createdBy: user.id,
            createdAt: serverTimestamp(),
            purchaseOrderId: orderId,
          },
        );
        tx.update(inventoryRefs[index]!, {
          stockMilli: afterMilli,
          lastMovementId: movementId,
          updatedAt: serverTimestamp(),
        });
        tx.update(itemRefs[index]!, {
          receivedMilli: data.quantityMilli,
          receivedAt: serverTimestamp(),
          receivedBy: user.id,
        });
      });
      tx.update(order, {
        status: "received",
        receivedAt: serverTimestamp(),
        receivedBy: user.id,
        receiptOperationId: operationId,
        updatedAt: serverTimestamp(),
      });
    });
  },
};
