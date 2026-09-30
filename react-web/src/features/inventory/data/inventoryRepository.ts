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
  movementDelta,
  stockAfter,
  validateItem,
  validateRecipe,
  type InventoryItem,
  type InventoryMovement,
  type MovementType,
  type Recipe,
} from "../model/inventory";

function id(value: string) {
  if (!value || value.includes("/") || value.length > 1500)
    throw Error("Identificação inválida.");
  return value;
}
const itemsRef = (placeId: string) =>
  collection(database(), "places", id(placeId), "inventoryItems");
const itemRef = (placeId: string, itemId: string) =>
  doc(itemsRef(placeId), id(itemId));
async function authorize(
  placeId: string,
  user: User,
  write: boolean,
  tx?: Transaction,
) {
  if (!user.active) throw Error("Conta inativa.");
  const ref = doc(database(), "places", id(placeId));
  const place = await (tx ? tx.get(ref) : getDoc(ref));
  if (
    !place.exists() ||
    !(await PartnerAccessService.canPlace(
      user,
      parsePlace(place.id, place.data()),
      write ? "manageInventory" : "view",
      tx,
    ))
  )
    throw Error("Sem permissão para acessar o estoque.");
  await PlaceModulesService.assertAvailable(placeId, "inventory", tx);
}

export const InventoryRepository = {
  watch(
    placeId: string,
    user: User,
    onChange: (items: InventoryItem[], recipes: Recipe[]) => void,
    onError: (error: Error) => void,
  ) {
    let alive = true;
    const stops: (() => void)[] = [];
    let items: InventoryItem[] | null = null,
      recipes: Recipe[] | null = null;
    const publish = () => {
      if (alive && items && recipes) onChange(items, recipes);
    };
    void authorize(placeId, user, false)
      .then(() => {
        if (!alive) return;
        stops.push(
          onSnapshot(
            itemsRef(placeId),
            (snapshot) => {
              if (!alive || snapshot.metadata.hasPendingWrites) return;
              items = snapshot.docs
                .map((row) => ({ ...row.data(), id: row.id }) as InventoryItem)
                .sort((a, b) => a.name.localeCompare(b.name));
              publish();
            },
            (error) => {
              if (alive) onError(error);
            },
          ),
        );
        stops.push(
          onSnapshot(
            collection(database(), "places", placeId, "inventoryRecipes"),
            (snapshot) => {
              if (!alive || snapshot.metadata.hasPendingWrites) return;
              recipes = snapshot.docs.map((row) => row.data() as Recipe);
              publish();
            },
            (error) => {
              if (alive) onError(error);
            },
          ),
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
  watchMovements(
    placeId: string,
    itemId: string,
    user: User,
    onChange: (rows: InventoryMovement[]) => void,
    onError: (error: Error) => void,
  ) {
    let alive = true,
      stop = () => {};
    void authorize(placeId, user, false)
      .then(() => {
        if (!alive) return;
        stop = onSnapshot(
          collection(itemRef(placeId, itemId), "movements"),
          (snapshot) => {
            if (!alive || snapshot.metadata.hasPendingWrites) return;
            onChange(
              snapshot.docs
                .map(
                  (row) =>
                    ({
                      ...row.data(),
                      id: row.id,
                      createdAt: row.data().createdAt.toDate(),
                    }) as InventoryMovement,
                )
                .sort(
                  (a, b) =>
                    +b.createdAt - +a.createdAt || a.id.localeCompare(b.id),
                ),
            );
          },
          (error) => {
            if (alive) onError(error);
          },
        );
      })
      .catch((error) => {
        if (alive) onError(error);
      });
    return () => {
      alive = false;
      stop();
    };
  },
  async saveItem(
    placeId: string,
    itemId: string | null,
    input: Pick<InventoryItem, "name" | "unit" | "minimumMilli" | "active">,
    user: User,
  ) {
    assertProductWritesEnabled("Estoque");
    const fields = validateItem(input);
    const ref = itemId ? itemRef(placeId, itemId) : doc(itemsRef(placeId));
    await runTransaction(database(), async (tx) => {
      await authorize(placeId, user, true, tx);
      const old = await tx.get(ref);
      if (itemId && !old.exists()) throw Error("Insumo não encontrado.");
      if (old.exists()) {
        if (fields.unit !== old.data().unit)
          throw Error("A unidade do insumo não pode ser alterada.");
        tx.update(ref, { ...fields, updatedAt: serverTimestamp() });
      } else
        tx.set(ref, {
          ...fields,
          stockMilli: 0,
          lastMovementId: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
    });
    return ref.id;
  },
  async move(
    placeId: string,
    itemId: string,
    operationId: string,
    input: { type: MovementType; amountMilli: number; reason: string },
    user: User,
  ) {
    assertProductWritesEnabled("Movimentação de estoque");
    const deltaMilli = movementDelta(input.type, input.amountMilli);
    const reason = input.reason.trim();
    if (!reason || reason.length > 300)
      throw Error("Informe um motivo de até 300 caracteres.");
    const ref = itemRef(placeId, itemId),
      movement = doc(collection(ref, "movements"), id(operationId));
    return runTransaction(database(), async (tx) => {
      await authorize(placeId, user, true, tx);
      const [item, previous] = await Promise.all([
        tx.get(ref),
        tx.get(movement),
      ]);
      if (previous.exists()) {
        const old = previous.data();
        if (
          old.deltaMilli !== deltaMilli ||
          old.type !== input.type ||
          old.reason !== reason ||
          old.createdBy !== user.id
        )
          throw Error("Identificador de movimentação já utilizado.");
        return;
      }
      if (!item.exists() || !item.data().active)
        throw Error("Insumo indisponível.");
      const beforeMilli = item.data().stockMilli;
      const afterMilli = stockAfter(beforeMilli, deltaMilli);
      tx.set(movement, {
        itemId,
        type: input.type,
        deltaMilli,
        beforeMilli,
        afterMilli,
        unit: item.data().unit,
        reason,
        createdBy: user.id,
        createdAt: serverTimestamp(),
      });
      tx.update(ref, {
        stockMilli: afterMilli,
        lastMovementId: operationId,
        updatedAt: serverTimestamp(),
      });
    });
  },
  async saveRecipe(
    placeId: string,
    menuItemId: string,
    components: Recipe["components"],
    active: boolean,
    user: User,
  ) {
    assertProductWritesEnabled("Receitas");
    const ids = Object.keys(components);
    if (ids.length < 1 || ids.length > 5 || typeof active !== "boolean")
      throw Error("Use de 1 a 5 insumos por receita.");
    const ref = doc(
      database(),
      "places",
      id(placeId),
      "inventoryRecipes",
      id(menuItemId),
    );
    await runTransaction(database(), async (tx) => {
      await authorize(placeId, user, true, tx);
      const [menu, old, ...items] = await Promise.all([
        tx.get(doc(database(), "places", placeId, "menuItems", menuItemId)),
        tx.get(ref),
        ...ids.map((itemId) => tx.get(itemRef(placeId, itemId))),
      ]);
      if (!menu.exists())
        throw Error("Item do cardápio não encontrado neste local.");
      validateRecipe(
        components,
        items
          .filter((row) => row.exists())
          .map((row) => ({ ...row.data(), id: row.id }) as InventoryItem),
      );
      tx.set(ref, {
        menuItemId,
        components,
        active,
        revision: (old.data()?.revision ?? 0) + 1,
        createdAt: old.data()?.createdAt ?? serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: user.id,
      });
    });
  },
};
