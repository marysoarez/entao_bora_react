import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  runTransaction,
  serverTimestamp,
  type Transaction,
} from "firebase/firestore";
import { database, assertProductWritesEnabled } from "../../../core/firebase";
import { PartnerAccessService } from "../../../core/partnerAccessService";
import { PlaceModulesService } from "../../../core/placeModulesService";
import { parsePlace } from "../../../shared/domain";
import type { User } from "../../../shared/models";
import {
  validateCategory,
  validateProduct,
  menuOrder,
  type CategoryInput,
  type ProductInput,
  type MenuCategory,
  type MenuProduct,
} from "../model/menu";
const ref = (placeId: string, kind: string, id: string) =>
  doc(database(), "places", placeId, kind, id);
const group = (placeId: string, kind: string) =>
  collection(database(), "places", placeId, kind);
async function authorize(
  placeId: string,
  user: User,
  tx: Transaction,
  initialized = true,
) {
  const place = await tx.get(doc(database(), "places", placeId));
  if (
    !place.exists() ||
    !(await PartnerAccessService.canPlace(
      user,
      parsePlace(place.id, place.data()),
      "editMenu",
      tx,
    ))
  )
    throw Error("Sem permissão para editar o cardápio.");
  await PlaceModulesService.assertAvailable(placeId, "menu", tx);
  if (initialized && place.data().menuSchemaVersion !== 2)
    throw Error("Importe o cardápio existente primeiro.");
  return place;
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
  return new Date(0);
}
export const MenuRepository = {
  watch(
    placeId: string,
    partner: boolean,
    onChange: (categories: MenuCategory[], items: MenuProduct[]) => void,
    onError: (error: Error) => void,
  ) {
    let categories: MenuCategory[] | null = null,
      items: MenuProduct[] | null = null;
    const publish = () => {
      if (categories && items)
        onChange(menuOrder(categories), menuOrder(items));
    };
    const source = (kind: string) =>
      partner
        ? group(placeId, kind)
        : query(group(placeId, kind), where("active", "==", true));
    const stops = [
      onSnapshot(
        source("menuCategories"),
        (snapshot) => {
          categories = snapshot.docs.map(
            (s) =>
              ({
                ...s.data(),
                id: s.id,
                createdAt: date(s.data().createdAt),
                updatedAt: date(s.data().updatedAt),
              }) as MenuCategory,
          );
          publish();
        },
        onError,
      ),
      onSnapshot(
        source("menuItems"),
        (snapshot) => {
          items = snapshot.docs.map(
            (s) =>
              ({
                ...s.data(),
                id: s.id,
                createdAt: date(s.data().createdAt),
                updatedAt: date(s.data().updatedAt),
              }) as MenuProduct,
          );
          publish();
        },
        onError,
      ),
    ];
    return () => stops.forEach((stop) => stop());
  },
  async initialize(placeId: string, user: User) {
    assertProductWritesEnabled("Cardápio");
    await runTransaction(database(), async (tx) => {
      const snapshot = await authorize(placeId, user, tx, false);
      if (snapshot.data().menuSchemaVersion === 2) return;
      const place = parsePlace(placeId, snapshot.data());
      const names = [
        ...new Set([
          ...place.menuCategories,
          ...place.menuItems.map((item) => item.category || "Geral"),
        ]),
      ];
      if (names.length * 2 + place.menuItems.length > 450)
        throw Error("Cardápio grande: importação administrativa necessaria.");
      const categories = names.map((name, order) => ({
        id: `legacy-category-${order}`,
        ...validateCategory({ name, description: "", order, active: true }),
      }));
      const products = place.menuItems.map((item, order) => ({
        id:
          item.id && !item.id.includes("/") ? item.id : `legacy-item-${order}`,
        ...validateProduct({
          name: item.title,
          description: item.description || "",
          price: item.price,
          imageUrl: item.photo
            ? /^https:|^data:/.test(item.photo)
              ? item.photo
              : `data:image/jpeg;base64,${item.photo}`
            : "",
          categoryId: categories.find(
            (c) => c.name === (item.category || "Geral").trim(),
          )!.id,
          active: true,
          available: true,
          order,
        }),
      }));
      if (new Set(products.map((item) => item.id)).size !== products.length)
        throw Error(
          "IDs duplicados no cardápio antigo. Revise antes de importar.",
        );
      for (const category of categories) {
        tx.set(ref(placeId, "menuCategories", category.id), {
          ...category,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        tx.set(ref(placeId, "menuCategoryUsage", category.id), {
          count: products.filter((item) => item.categoryId === category.id)
            .length,
          itemId: "",
          imported: true,
        });
      }
      for (const product of products)
        tx.set(ref(placeId, "menuItems", product.id), {
          ...product,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      tx.update(snapshot.ref, { menuSchemaVersion: 2 });
    });
  },
  async saveCategory(
    placeId: string,
    input: CategoryInput,
    user: User,
    id?: string,
  ) {
    assertProductWritesEnabled("Cardápio");
    const fields = validateCategory(input);
    const target = id
      ? ref(placeId, "menuCategories", id)
      : doc(group(placeId, "menuCategories"));
    await runTransaction(database(), async (tx) => {
      await authorize(placeId, user, tx);
      const old = await tx.get(target);
      if (id && !old.exists()) throw Error("Categoria não encontrada.");
      if (old.exists())
        tx.update(target, { ...fields, updatedAt: serverTimestamp() });
      else {
        tx.set(target, {
          id: target.id,
          ...fields,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        tx.set(ref(placeId, "menuCategoryUsage", target.id), {
          count: 0,
          itemId: "",
          imported: false,
        });
      }
    });
    return target.id;
  },
  async deleteCategory(placeId: string, id: string, user: User) {
    assertProductWritesEnabled("Cardápio");
    await runTransaction(database(), async (tx) => {
      await authorize(placeId, user, tx);
      const usage = await tx.get(ref(placeId, "menuCategoryUsage", id));
      if (!usage.exists() || usage.data().count !== 0)
        throw Error("Remova ou mova os produtos antes de excluir a categoria.");
      tx.delete(ref(placeId, "menuCategories", id));
      tx.delete(usage.ref);
    });
  },
  async saveProduct(
    placeId: string,
    input: ProductInput,
    user: User,
    id?: string,
  ) {
    assertProductWritesEnabled("Cardápio");
    const fields = validateProduct(input);
    const target = id
      ? ref(placeId, "menuItems", id)
      : doc(group(placeId, "menuItems"));
    await runTransaction(database(), async (tx) => {
      await authorize(placeId, user, tx);
      const old = await tx.get(target);
      if (id && !old.exists()) throw Error("Produto não encontrado.");
      if (
        !(
          await tx.get(ref(placeId, "menuCategories", fields.categoryId))
        ).exists()
      )
        throw Error("Categoria não encontrada.");
      const previous = old.exists() ? (old.data().categoryId as string) : null;
      const changed = previous !== fields.categoryId;
      const nextUsage = changed
        ? await tx.get(ref(placeId, "menuCategoryUsage", fields.categoryId))
        : null;
      const previousUsage =
        changed && previous
          ? await tx.get(ref(placeId, "menuCategoryUsage", previous))
          : null;
      if (nextUsage && !nextUsage.exists())
        throw Error("Categoria inconsistente.");
      if (nextUsage)
        tx.update(nextUsage.ref, {
          count: nextUsage.data()!.count + 1,
          itemId: target.id,
          imported: false,
        });
      if (previousUsage)
        tx.update(previousUsage.ref, {
          count: previousUsage.data()!.count - 1,
          itemId: target.id,
          imported: false,
        });
      if (old.exists())
        tx.update(target, { ...fields, updatedAt: serverTimestamp() });
      else
        tx.set(target, {
          id: target.id,
          ...fields,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
    });
    return target.id;
  },
  async deleteProduct(placeId: string, id: string, user: User) {
    assertProductWritesEnabled("Cardápio");
    await runTransaction(database(), async (tx) => {
      await authorize(placeId, user, tx);
      const item = await tx.get(ref(placeId, "menuItems", id));
      if (!item.exists()) throw Error("Produto não encontrado.");
      const usage = await tx.get(
        ref(placeId, "menuCategoryUsage", item.data().categoryId),
      );
      tx.update(usage.ref, {
        count: usage.data()!.count - 1,
        itemId: id,
        imported: false,
      });
      tx.delete(item.ref);
    });
  },
  async initialized(placeId: string) {
    return (
      (await getDoc(doc(database(), "places", placeId))).data()
        ?.menuSchemaVersion === 2
    );
  },
};
