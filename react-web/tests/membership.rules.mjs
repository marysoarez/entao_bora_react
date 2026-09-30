import { after, before, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

// Fixed demo project: these tests never address the production database.
const projectId = "demo-entao-bora-members";
let env;
const db = (uid) =>
  uid
    ? env.authenticatedContext(uid).firestore()
    : env.unauthenticatedContext().firestore();
const membership = (role, active = true) => ({
  role,
  active,
  createdAt: Timestamp.fromMillis(1),
});
const moduleSettings = (uid, overrides = {}) => ({
  schemaVersion: 1,
  enabled: {
    events: true,
    tables: false,
    serviceSessions: false,
    menu: true,
    orders: false,
    inventory: false,
    purchases: false,
    notifications: false,
    analytics: false,
    heatmap: false,
    team: true,
    ...overrides,
  },
  updatedAt: serverTimestamp(),
  updatedBy: uid,
});
const entitlementSettings = (overrides = {}) => ({
  schemaVersion: 1,
  planKey: "test-full",
  status: "active",
  features: {
    notifications: true,
    tables: true,
    orders: true,
    inventory: true,
    purchases: true,
    advancedAnalytics: true,
    ...overrides,
  },
  validUntil: null,
  source: "manual",
  updatedAt: Timestamp.fromMillis(1),
  updatedBy: "test-backend",
});
const inventoryData = (unit = "un") => ({
  name: "Insumo",
  unit,
  active: true,
  minimumMilli: 1000,
  stockMilli: 0,
  lastMovementId: null,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});
async function seedInventory() {
  await setDoc(
    doc(db("owner"), "places/one/settings/modules"),
    moduleSettings("owner", { inventory: true }),
  );
  for (const [id, unit] of [
    ["lime", "un"],
    ["spirit", "ml"],
    ["sugar", "g"],
    ["ice", "g"],
    ["extra", "g"],
  ])
    await setDoc(
      doc(db("owner"), `places/one/inventoryItems/${id}`),
      inventoryData(unit),
    );
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "places/one/menuItems/drink"), {
      name: "Caipirinha",
      active: true,
    });
  });
}
async function inventoryMove(
  uid,
  operationId,
  type,
  deltaMilli,
  overrides = {},
) {
  const client = db(uid),
    item = doc(client, "places/one/inventoryItems/lime");
  const movement = doc(
    client,
    `places/one/inventoryItems/lime/movements/${operationId}`,
  );
  return runTransaction(client, async (tx) => {
    const [current, previous] = await Promise.all([
      tx.get(item),
      tx.get(movement),
    ]);
    if (previous.exists()) return;
    const beforeMilli = current.data().stockMilli;
    tx.set(movement, {
      itemId: "lime",
      type,
      deltaMilli,
      beforeMilli,
      afterMilli: beforeMilli + deltaMilli,
      unit: "un",
      reason: "Conferência",
      createdBy: uid,
      createdAt: serverTimestamp(),
      ...overrides,
    });
    tx.update(item, {
      stockMilli: beforeMilli + deltaMilli,
      lastMovementId: operationId,
      updatedAt: serverTimestamp(),
    });
  });
}
test("inventory: entries, exits, adjustments and losses retain immutable movement history", async () => {
  await seedInventory();
  await assertSucceeds(inventoryMove("owner", "entry", "entry", 10000));
  await assertSucceeds(inventoryMove("manager", "exit", "exit", -2000));
  await assertSucceeds(inventoryMove("owner", "loss", "loss", -1000));
  await assertSucceeds(inventoryMove("owner", "adjustment", "adjustment", 500));
  const client = db("owner"),
    item = doc(client, "places/one/inventoryItems/lime");
  if ((await getDoc(item)).data().stockMilli !== 7500)
    throw Error("Incorrect stock");
  await assertSucceeds(inventoryMove("owner", "entry", "entry", 10000));
  if (
    (
      await getDocs(
        collection(client, "places/one/inventoryItems/lime/movements"),
      )
    ).size !== 4
  )
    throw Error("Duplicate ledger");
  await assertFails(
    updateDoc(doc(client, "places/one/inventoryItems/lime/movements/entry"), {
      reason: "Changed",
    }),
  );
  await assertFails(
    deleteDoc(doc(client, "places/one/inventoryItems/lime/movements/entry")),
  );
  await assertFails(deleteDoc(item));
  await assertSucceeds(
    updateDoc(item, { active: false, updatedAt: serverTimestamp() }),
  );
  await assertFails(inventoryMove("owner", "inactive", "entry", 1000));
  if (
    (
      await getDocs(
        collection(client, "places/one/inventoryItems/lime/movements"),
      )
    ).size !== 4
  )
    throw Error("History lost");
});
test("inventory: denies detached or forged balances, signs, actors, units and negative stock", async () => {
  await seedInventory();
  const client = db("owner"),
    item = doc(client, "places/one/inventoryItems/lime");
  await assertFails(
    updateDoc(item, { stockMilli: 1000, updatedAt: serverTimestamp() }),
  );
  await assertFails(
    updateDoc(item, { unit: "ml", updatedAt: serverTimestamp() }),
  );
  await assertFails(
    setDoc(doc(client, "places/one/inventoryItems/forged"), {
      ...inventoryData(),
      stockMilli: 1000,
    }),
  );
  await assertFails(inventoryMove("owner", "negative", "exit", -1));
  await assertFails(inventoryMove("owner", "bad-sign", "loss", 1000));
  await assertFails(inventoryMove("owner", "zero", "adjustment", 0));
  await assertFails(
    inventoryMove("owner", "unit", "entry", 1000, { unit: "ml" }),
  );
  await assertFails(
    inventoryMove("owner", "actor", "entry", 1000, { createdBy: "outsider" }),
  );
  await assertFails(inventoryMove("owner", "fraction", "entry", 0.5));
  await assertFails(
    inventoryMove("owner", "balance", "entry", 1000, { afterMilli: 500 }),
  );
  const batch = writeBatch(client);
  for (const id of ["a", "b"])
    batch.set(doc(client, `places/one/inventoryItems/lime/movements/${id}`), {
      itemId: "lime",
      type: "entry",
      deltaMilli: 1000,
      beforeMilli: 0,
      afterMilli: 1000,
      unit: "un",
      reason: "Duplicate",
      createdBy: "owner",
      createdAt: serverTimestamp(),
    });
  batch.update(item, {
    stockMilli: 1000,
    lastMovementId: "a",
    updatedAt: serverTimestamp(),
  });
  await assertFails(batch.commit());
});
test("inventory: only authorized managers write, employees read, disabled module preserves records", async () => {
  await seedInventory();
  await assertSucceeds(
    getDocs(collection(db("employee"), "places/one/inventoryItems")),
  );
  for (const uid of ["employee", "outsider", "inactive", "revoked"])
    await assertFails(inventoryMove(uid, `denied-${uid}`, "entry", 1000));
  await assertFails(
    getDocs(collection(db("outsider"), "places/one/inventoryItems")),
  );
  await assertFails(getDocs(collection(db(), "places/one/inventoryItems")));
  await assertSucceeds(inventoryMove("admin", "admin", "entry", 1000));
  await setDoc(
    doc(db("owner"), "places/one/settings/modules"),
    moduleSettings("owner", { inventory: false }),
  );
  await assertFails(
    getDocs(collection(db("owner"), "places/one/inventoryItems")),
  );
  await assertFails(inventoryMove("owner", "disabled", "entry", 1000));
  await setDoc(
    doc(db("owner"), "places/one/settings/modules"),
    moduleSettings("owner", { inventory: true }),
  );
  if (
    (await getDoc(doc(db("owner"), "places/one/inventoryItems/lime"))).data()
      .stockMilli !== 1000
  )
    throw Error("Disabled module lost stock");
});
test("inventory: concurrent exits cannot overspend stock", async () => {
  await seedInventory();
  await inventoryMove("owner", "entry", "entry", 1000);
  const results = await Promise.allSettled([
    inventoryMove("owner", "exit-a", "exit", -1000),
    inventoryMove("manager", "exit-b", "exit", -1000),
  ]);
  if (results.filter((row) => row.status === "fulfilled").length !== 1)
    throw Error("Overspent balance");
  if (
    (await getDoc(doc(db("owner"), "places/one/inventoryItems/lime"))).data()
      .stockMilli !== 0
  )
    throw Error("Invalid final balance");
  if (
    (
      await getDocs(
        collection(db("owner"), "places/one/inventoryItems/lime/movements"),
      )
    ).size !== 2
  )
    throw Error("Invalid ledger");
});
test("inventory: recipes use multiple independent ingredients and validate same-place units and revisions", async () => {
  await seedInventory();
  const client = db("manager"),
    ref = doc(client, "places/one/inventoryRecipes/drink");
  const components = {
    lime: { unit: "un", quantityMilli: 1000 },
    spirit: { unit: "ml", quantityMilli: 50000 },
    sugar: { unit: "g", quantityMilli: 20000 },
    ice: { unit: "g", quantityMilli: 100000 },
    extra: { unit: "g", quantityMilli: 1000 },
  };
  const data = {
    menuItemId: "drink",
    components,
    active: true,
    revision: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: "manager",
  };
  await assertSucceeds(setDoc(ref, data));
  // The repository revalidates ingredient existence and units transactionally.
  // Rules keep recipes bounded; any future automatic deduction must revalidate again.
  await assertFails(
    updateDoc(ref, {
      components: {},
      revision: 2,
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    updateDoc(ref, { components, updatedAt: serverTimestamp() }),
  );
  await assertSucceeds(
    updateDoc(ref, {
      active: false,
      revision: 2,
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(deleteDoc(ref));
  await assertFails(
    setDoc(doc(client, "places/one/inventoryRecipes/missing"), {
      ...data,
      menuItemId: "missing",
    }),
  );
  if (
    (await getDoc(doc(client, "places/one/inventoryItems/lime"))).data()
      .stockMilli !== 0
  )
    throw Error("Recipe changed stock");
});
async function seedPurchases() {
  await seedInventory();
  await setDoc(
    doc(db("owner"), "places/one/settings/modules"),
    moduleSettings("owner", { inventory: true, purchases: true }),
  );
  await setDoc(doc(db("owner"), "places/one/suppliers/supplier"), {
    name: "Distribuidora",
    contact: "Contato",
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: "owner",
  });
}
async function createPurchase(uid, orderId = "po") {
  const client = db(uid),
    batch = writeBatch(client);
  batch.set(doc(client, `places/one/purchaseOrders/${orderId}`), {
    supplierId: "supplier",
    status: "ordered",
    notes: "Reposição",
    itemCount: 2,
    totalCostCents: 4000,
    orderedAt: serverTimestamp(),
    receivedAt: null,
    createdBy: uid,
    receivedBy: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(client, `places/one/purchaseItems/${orderId}_1`), {
    purchaseOrderId: orderId,
    inventoryItemId: "lime",
    name: "Limão",
    unit: "un",
    quantityMilli: 10000,
    receivedMilli: 0,
    unitCostMicros: 2000000,
    totalCostCents: 2000,
  });
  batch.set(doc(client, `places/one/purchaseItems/${orderId}_2`), {
    purchaseOrderId: orderId,
    inventoryItemId: "sugar",
    name: "Açúcar",
    unit: "g",
    quantityMilli: 20000,
    receivedMilli: 0,
    unitCostMicros: 1000000,
    totalCostCents: 2000,
  });
  return batch.commit();
}
async function receivePurchase(uid, orderId = "po", operationId = "receipt") {
  const client = db(uid);
  return runTransaction(client, async (tx) => {
    const order = doc(client, `places/one/purchaseOrders/${orderId}`);
    const itemRefs = [1, 2].map((index) =>
      doc(client, `places/one/purchaseItems/${orderId}_${index}`),
    );
    const stockRefs = ["lime", "sugar"].map((id) =>
      doc(client, `places/one/inventoryItems/${id}`),
    );
    const [orderSnapshot, ...snapshots] = await Promise.all([
      tx.get(order),
      ...itemRefs.map((row) => tx.get(row)),
      ...stockRefs.map((row) => tx.get(row)),
    ]);
    if (orderSnapshot.data().status === "received") return;
    for (let index = 0; index < 2; index++) {
      const purchase = snapshots[index].data(),
        stock = snapshots[index + 2].data();
      const movementId = `purchase_${operationId}_${index + 1}`,
        afterMilli = stock.stockMilli + purchase.quantityMilli;
      tx.set(
        doc(
          client,
          `places/one/inventoryItems/${purchase.inventoryItemId}/movements/${movementId}`,
        ),
        {
          itemId: purchase.inventoryItemId,
          type: "entry",
          deltaMilli: purchase.quantityMilli,
          beforeMilli: stock.stockMilli,
          afterMilli,
          unit: purchase.unit,
          reason: `Recebimento da compra ${orderId}`,
          createdBy: uid,
          createdAt: serverTimestamp(),
          purchaseOrderId: orderId,
        },
      );
      tx.update(stockRefs[index], {
        stockMilli: afterMilli,
        lastMovementId: movementId,
        updatedAt: serverTimestamp(),
      });
      tx.update(itemRefs[index], {
        receivedMilli: purchase.quantityMilli,
        receivedAt: serverTimestamp(),
        receivedBy: uid,
      });
    }
    tx.update(order, {
      status: "received",
      receivedAt: serverTimestamp(),
      receivedBy: uid,
      receiptOperationId: operationId,
      updatedAt: serverTimestamp(),
    });
  });
}
test("purchases: supplier, order and item snapshots are preserved through atomic stock receipt", async () => {
  await seedPurchases();
  await assertSucceeds(createPurchase("manager"));
  await assertSucceeds(receivePurchase("manager"));
  const client = db("owner"),
    order = (await getDoc(doc(client, "places/one/purchaseOrders/po"))).data();
  if (
    order.status !== "received" ||
    order.receivedBy !== "manager" ||
    order.totalCostCents !== 4000
  )
    throw Error("Receipt lost purchase history");
  if (
    (await getDoc(doc(client, "places/one/inventoryItems/lime"))).data()
      .stockMilli !== 10000
  )
    throw Error("Missing lime receipt");
  if (
    (await getDoc(doc(client, "places/one/inventoryItems/sugar"))).data()
      .stockMilli !== 20000
  )
    throw Error("Missing sugar receipt");
  if (
    (await getDocs(collection(client, "places/one/purchaseItems"))).size !== 2
  )
    throw Error("Purchase items lost");
  await assertSucceeds(receivePurchase("manager"));
  if (
    (
      await getDocs(
        collection(client, "places/one/inventoryItems/lime/movements"),
      )
    ).size !== 1
  )
    throw Error("Duplicate receipt movement");
  await assertFails(deleteDoc(doc(client, "places/one/purchaseOrders/po")));
  await assertFails(deleteDoc(doc(client, "places/one/purchaseItems/po_1")));
  await assertFails(deleteDoc(doc(client, "places/one/suppliers/supplier")));
});
test("purchases: denies forged costs, quantities, supplier links and detached receipts", async () => {
  await seedPurchases();
  const client = db("owner"),
    order = doc(client, "places/one/purchaseOrders/forged"),
    item = doc(client, "places/one/purchaseItems/forged_1");
  const baseOrder = {
    supplierId: "supplier",
    status: "ordered",
    notes: "",
    itemCount: 1,
    totalCostCents: 2000,
    orderedAt: serverTimestamp(),
    receivedAt: null,
    createdBy: "owner",
    receivedBy: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const baseItem = {
    purchaseOrderId: "forged",
    inventoryItemId: "lime",
    name: "Limão",
    unit: "un",
    quantityMilli: 10000,
    receivedMilli: 0,
    unitCostMicros: 2000000,
    totalCostCents: 2000,
  };
  for (const changed of [
    { totalCostCents: 1 },
    { supplierId: "missing" },
    { itemCount: 2 },
  ]) {
    const batch = writeBatch(client);
    batch.set(order, { ...baseOrder, ...changed });
    batch.set(item, baseItem);
    await assertFails(batch.commit());
  }
  {
    const batch = writeBatch(client);
    batch.set(order, baseOrder);
    batch.set(item, { ...baseItem, totalCostCents: 1 });
    await assertFails(batch.commit());
  }
  await assertFails(setDoc(item, baseItem));
  await createPurchase("owner", "valid");
  await assertFails(
    updateDoc(doc(client, "places/one/purchaseItems/valid_1"), {
      receivedMilli: 10000,
      receivedAt: serverTimestamp(),
      receivedBy: "owner",
    }),
  );
  await assertFails(
    updateDoc(doc(client, "places/one/purchaseOrders/valid"), {
      status: "received",
      receivedAt: serverTimestamp(),
      receivedBy: "owner",
      receiptOperationId: "x",
      updatedAt: serverTimestamp(),
    }),
  );
});
test("purchases: permissions and disabled modules preserve history while denying access", async () => {
  await seedPurchases();
  await createPurchase("owner");
  await assertSucceeds(
    getDocs(collection(db("employee"), "places/one/purchaseOrders")),
  );
  for (const uid of ["employee", "outsider", "inactive", "revoked"])
    await assertFails(createPurchase(uid, `denied-${uid}`));
  await assertFails(
    getDocs(collection(db("outsider"), "places/one/purchaseOrders")),
  );
  await setDoc(
    doc(db("owner"), "places/one/settings/modules"),
    moduleSettings("owner", { inventory: true, purchases: false }),
  );
  await assertFails(
    getDocs(collection(db("owner"), "places/one/purchaseOrders")),
  );
  await assertFails(receivePurchase("owner"));
  await setDoc(
    doc(db("owner"), "places/one/settings/modules"),
    moduleSettings("owner", { inventory: true, purchases: true }),
  );
  if (
    !(await getDoc(doc(db("owner"), "places/one/purchaseOrders/po"))).exists()
  )
    throw Error("Disabled purchases lost history");
});

before(async () => {
  const [host, port] = (
    process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8187"
  ).split(":");
  if (!["127.0.0.1", "localhost"].includes(host))
    throw Error("Use um emulador local.");
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: readFileSync(
        new URL("../firestore.rules", import.meta.url),
        "utf8",
      ),
    },
  });
});
after(async () => {
  await env?.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const batch = writeBatch(context.firestore());
    for (const uid of [
      "owner",
      "manager",
      "employee",
      "outsider",
      "target",
      "revoked",
      "admin",
      "inactive",
      "partner",
    ]) {
      batch.set(doc(context.firestore(), "users", uid), {
        id: uid,
        role:
          uid === "admin" ? "admin" : uid === "partner" ? "partner" : "user",
        active: uid !== "inactive",
        partnerId: uid === "partner" ? "legacy" : null,
      });
    }
    batch.set(doc(context.firestore(), "places", "one"), {
      id: "one",
      name: "One",
      ownerId: "owner",
      menuItems: [],
    });
    batch.set(doc(context.firestore(), "places", "two"), {
      id: "two",
      name: "Two",
      ownerId: { id: "legacy" },
      menuItems: [],
    });
    batch.set(
      doc(context.firestore(), "places/one/settings/entitlements"),
      entitlementSettings(),
    );
    batch.set(
      doc(context.firestore(), "places/two/settings/entitlements"),
      entitlementSettings(),
    );
    for (const [uid, role, active] of [
      ["manager", "manager", true],
      ["employee", "employee", true],
      ["revoked", "owner", false],
      ["inactive", "owner", true],
    ]) {
      batch.set(
        doc(context.firestore(), "places", "one", "members", uid),
        membership(role, active),
      );
    }
    for (const [id, placeId, createdBy] of [
      ["linked", "one", "outsider"],
      ["standalone", null, "outsider"],
      ["employee-event", "one", "employee"],
    ]) {
      batch.set(doc(context.firestore(), "events", id), {
        title: "Show",
        slug: id,
        placeId,
        createdBy,
        createdAt: Timestamp.fromMillis(1),
        status: "published",
        startDate: Timestamp.fromMillis(Date.now() - 60000),
        endDate: Timestamp.fromMillis(Date.now() + 3600000),
        boraCount: 0,
        checkinCount: 0,
        views: 0,
        shares: 0,
      });
    }
    await batch.commit();
  });
});

test("planos: entitlement é somente backend e protege recurso pago sem esconder menu", async () => {
  const entitlement = doc(db("owner"), "places/one/settings/entitlements");
  await assertSucceeds(getDoc(entitlement));
  await assertFails(updateDoc(entitlement, { "features.orders": false }));
  await assertFails(
    setDoc(
      doc(db("admin"), "places/one/settings/entitlements"),
      entitlementSettings(),
    ),
  );

  await setDoc(
    doc(db("owner"), "places/one/settings/modules"),
    moduleSettings("owner", { orders: true, serviceSessions: true }),
  );
  await env.withSecurityRulesDisabled((context) =>
    setDoc(
      doc(context.firestore(), "places/one/settings/entitlements"),
      entitlementSettings({ orders: false }),
    ),
  );
  await assertFails(getDocs(collection(db("owner"), "places/one/orders")));
  await assertFails(
    setDoc(
      doc(db("owner"), "places/one/settings/modules"),
      moduleSettings("owner", { orders: true, serviceSessions: true }),
    ),
  );
  await assertSucceeds(getDoc(doc(db("owner"), "events/linked")));
});

test("notificações: preferências são próprias e marketing exige consentimento explícito", async () => {
  const own = doc(db("owner"), "users/owner");
  await assertSucceeds(
    updateDoc(own, {
      notificationsEnabled: true,
      notificationPreferences: { events: true, orders: true, marketing: false },
      notificationUpdatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    updateDoc(doc(db("manager"), "users/owner"), {
      notificationPreferences: { events: true, orders: true, marketing: true },
    }),
  );
  await assertFails(
    updateDoc(own, {
      notificationPreferences: { events: true, orders: true, marketing: "yes" },
    }),
  );
});

test("notificações: somente owner cria rascunho e o cliente não dispara campanha", async () => {
  await setDoc(
    doc(db("owner"), "places/one/settings/modules"),
    moduleSettings("owner", { notifications: true }),
  );
  const draft = {
    title: "Novidade",
    body: "Programação nova no fim de semana",
    kind: "marketing",
    status: "draft",
    createdBy: "owner",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = doc(db("owner"), "places/one/notificationCampaigns/campaign");
  await assertSucceeds(setDoc(ref, draft));
  await assertFails(
    setDoc(doc(db("manager"), "places/one/notificationCampaigns/manager"), {
      ...draft,
      createdBy: "manager",
    }),
  );
  await assertFails(
    updateDoc(ref, { status: "queued", updatedAt: serverTimestamp() }),
  );
  await assertSucceeds(
    updateDoc(ref, { status: "cancelled", updatedAt: serverTimestamp() }),
  );
  await assertFails(deleteDoc(ref));
});

test("notificações: caixa de entrega é gravada apenas pelo backend", async () => {
  const own = doc(db("owner"), "users/owner/notifications/message");
  await assertFails(setDoc(own, { title: "forjada" }));
  await env.withSecurityRulesDisabled((context) =>
    setDoc(doc(context.firestore(), "users/owner/notifications/message"), {
      title: "Pedido pronto",
      readAt: null,
    }),
  );
  await assertSucceeds(getDoc(own));
  await assertFails(
    getDoc(doc(db("manager"), "users/owner/notifications/message")),
  );
  await assertSucceeds(updateDoc(own, { readAt: serverTimestamp() }));
  await assertFails(updateDoc(own, { title: "alterada" }));
});

test("módulos: owner configura, membros consultam e outros locais ficam isolados", async () => {
  await assertSucceeds(
    setDoc(
      doc(db("owner"), "places/one/settings/modules"),
      moduleSettings("owner"),
    ),
  );
  for (const uid of ["owner", "manager", "employee", "admin"]) {
    await assertSucceeds(getDoc(doc(db(uid), "places/one/settings/modules")));
  }
  for (const uid of [null, "outsider", "revoked", "inactive"]) {
    await assertFails(getDoc(doc(db(uid), "places/one/settings/modules")));
  }
  for (const uid of ["manager", "employee", "outsider"]) {
    await assertFails(
      setDoc(
        doc(db(uid), "places/one/settings/modules"),
        moduleSettings(uid, { menu: false }),
      ),
    );
  }
  await assertFails(
    setDoc(
      doc(db("owner"), "places/two/settings/modules"),
      moduleSettings("owner"),
    ),
  );
  await assertSucceeds(
    setDoc(
      doc(db("admin"), "places/two/settings/modules"),
      moduleSettings("admin"),
    ),
  );
});

test("módulos: schema protege Eventos, Equipe e não aceita assinaturas falsificadas", async () => {
  const ref = doc(db("owner"), "places/one/settings/modules");
  await assertFails(setDoc(ref, moduleSettings("owner", { events: false })));
  await assertFails(setDoc(ref, moduleSettings("owner", { team: false })));
  await assertFails(setDoc(ref, moduleSettings("owner", { menu: "yes" })));
  await assertFails(setDoc(ref, moduleSettings("owner", { unknown: true })));
  await assertFails(
    setDoc(ref, { ...moduleSettings("owner"), subscription: "paid" }),
  );
  await assertFails(
    setDoc(ref, { ...moduleSettings("owner"), updatedBy: "admin" }),
  );
  await assertSucceeds(setDoc(ref, moduleSettings("owner", { menu: false })));
  await assertFails(deleteDoc(ref));
});

test("módulos: desativar cardápio protege escrita direta e mantém informações e Eventos", async () => {
  await assertSucceeds(
    setDoc(
      doc(db("owner"), "places/one/settings/modules"),
      moduleSettings("owner", { menu: false }),
    ),
  );
  await assertFails(
    updateDoc(doc(db("manager"), "places/one"), { menuItems: [{ id: "new" }] }),
  );
  await assertFails(
    updateDoc(doc(db("owner"), "places/one"), { menuCategories: ["Drinks"] }),
  );
  await assertSucceeds(
    updateDoc(doc(db("manager"), "places/one"), { name: "Updated" }),
  );
  await assertSucceeds(
    updateDoc(doc(db("manager"), "places/one"), {
      name: "Legacy defaults",
      menuItems: [],
      menuCategories: [],
    }),
  );
  await assertSucceeds(
    updateDoc(doc(db("manager"), "events/linked"), { title: "Updated event" }),
  );
  await assertSucceeds(
    setDoc(doc(db("manager"), "events/new-module-event"), {
      createdBy: "manager",
      placeId: "one",
      title: "New event",
    }),
  );
  await assertSucceeds(
    setDoc(
      doc(db("owner"), "places/one/settings/modules"),
      moduleSettings("owner", { menu: true }),
    ),
  );
  await assertSucceeds(
    updateDoc(doc(db("manager"), "places/one"), { menuItems: [{ id: "new" }] }),
  );
});

test("Eventos não dependem de configuração ausente, corrompida ou de pagamento", async () => {
  await env.withSecurityRulesDisabled((c) =>
    setDoc(doc(c.firestore(), "places/one/settings/modules"), {
      schemaVersion: 99,
      enabled: { events: false },
      subscription: { status: "expired" },
    }),
  );
  await assertSucceeds(
    updateDoc(doc(db("manager"), "events/linked"), {
      title: "Always available",
    }),
  );
  await assertSucceeds(
    getDocs(query(collection(db(), "events"), where("slug", "==", "linked"))),
  );
});

test("owner legado gerencia membros sem migrar ownerId", async () => {
  await assertSucceeds(
    setDoc(doc(db("owner"), "places/one/members/target"), {
      role: "manager",
      active: true,
      createdAt: serverTimestamp(),
    }),
  );
  await assertSucceeds(getDocs(collection(db("owner"), "places/one/members")));
});
test("manager e employee não promovem a si nem terceiros", async () => {
  for (const uid of ["manager", "employee", "outsider"]) {
    await assertFails(
      setDoc(doc(db(uid), `places/one/members/${uid}`), {
        role: "owner",
        active: true,
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(
      setDoc(doc(db(uid), "places/one/members/target"), {
        role: "manager",
        active: true,
        createdAt: serverTimestamp(),
      }),
    );
  }
});
test("manager opera local, menu e eventos sem precisar de partner global", async () => {
  await assertSucceeds(
    updateDoc(doc(db("manager"), "places/one"), {
      name: "Edited",
      menuItems: [{ id: "item", price: 10 }],
    }),
  );
  await assertSucceeds(
    updateDoc(doc(db("manager"), "events/linked"), { title: "Edited" }),
  );
  await assertFails(
    updateDoc(doc(db("manager"), "events/linked"), {
      createdBy: "target",
      updatedAt: serverTimestamp(),
    }),
  );
});
test("employee lê próprio vínculo, sem escrita operacional nem lista de membros", async () => {
  await assertSucceeds(
    getDoc(doc(db("employee"), "places/one/members/employee")),
  );
  await assertFails(getDocs(collection(db("employee"), "places/one/members")));
  await assertFails(
    updateDoc(doc(db("employee"), "places/one"), { name: "Denied" }),
  );
  await assertFails(
    updateDoc(doc(db("employee"), "events/employee-event"), {
      title: "Denied",
    }),
  );
});
test("isola dois estabelecimentos e permite papéis distintos", async () => {
  await assertFails(
    updateDoc(doc(db("manager"), "places/two"), { name: "Denied" }),
  );
  await env.withSecurityRulesDisabled((c) =>
    setDoc(
      doc(c.firestore(), "places/two/members/manager"),
      membership("employee"),
    ),
  );
  await assertSucceeds(
    getDoc(doc(db("manager"), "places/two/members/manager")),
  );
  await assertFails(
    updateDoc(doc(db("manager"), "places/two"), { name: "Denied" }),
  );
  await assertSucceeds(
    updateDoc(doc(db("manager"), "places/one"), { name: "Allowed" }),
  );
});
test("revogação explícita prevalece sobre proprietário legado", async () => {
  await env.withSecurityRulesDisabled((c) =>
    setDoc(
      doc(c.firestore(), "places/one/members/owner"),
      membership("owner", false),
    ),
  );
  await assertFails(
    updateDoc(doc(db("owner"), "places/one"), { name: "Denied" }),
  );
  await assertFails(
    updateDoc(doc(db("revoked"), "places/one"), { name: "Denied" }),
  );
  await assertFails(
    updateDoc(doc(db("inactive"), "places/one"), { name: "Denied" }),
  );
});
test("admin ativo acessa todos os locais e membros", async () => {
  await assertSucceeds(
    updateDoc(doc(db("admin"), "places/two"), { name: "Admin" }),
  );
  await assertSucceeds(
    setDoc(doc(db("admin"), "places/one/members/target"), {
      role: "owner",
      active: true,
      createdAt: serverTimestamp(),
    }),
  );
  await assertSucceeds(
    updateDoc(doc(db("admin"), "events/linked"), { createdBy: "target" }),
  );
});
test("owner principal não é desativado e vínculos não podem ser apagados", async () => {
  await assertFails(
    setDoc(doc(db("owner"), "places/one/members/owner"), {
      role: "employee",
      active: true,
      createdAt: serverTimestamp(),
    }),
  );
  await assertFails(deleteDoc(doc(db("owner"), "places/one/members/manager")));
  await assertSucceeds(
    updateDoc(doc(db("owner"), "places/one/members/manager"), {
      active: false,
    }),
  );
  await assertFails(
    updateDoc(doc(db("manager"), "places/one"), {
      name: "Denied after revocation",
    }),
  );
});
test("valida schema, usuário alvo e createdAt imutável", async () => {
  await assertFails(
    setDoc(doc(db("owner"), "places/one/members/target"), {
      role: "admin",
      active: true,
      createdAt: serverTimestamp(),
    }),
  );
  await assertFails(
    setDoc(doc(db("owner"), "places/one/members/missing"), {
      role: "owner",
      active: true,
      createdAt: serverTimestamp(),
    }),
  );
  await assertFails(
    updateDoc(doc(db("owner"), "places/one/members/manager"), {
      createdAt: serverTimestamp(),
    }),
  );
});
test("novo estabelecimento e owner são criados atomicamente", async () => {
  const client = db("partner");
  const batch = writeBatch(client);
  batch.set(doc(client, "places/new"), { id: "new", ownerId: "partner" });
  batch.set(doc(client, "places/new/members/partner"), {
    role: "owner",
    active: true,
    createdAt: serverTimestamp(),
  });
  await assertSucceeds(batch.commit());
  await assertFails(
    setDoc(doc(db("outsider"), "places/intruder"), {
      id: "intruder",
      ownerId: "outsider",
    }),
  );
});
test("compatibilidade de ownerId legado e partnerId", async () => {
  await assertSucceeds(
    updateDoc(doc(db("partner"), "places/two"), { name: "Legacy" }),
  );
  await assertFails(
    updateDoc(doc(db("partner"), "places/two"), { ownerId: "partner" }),
  );
});
test("criação e mudança de vínculo de eventos respeitam o local", async () => {
  const event = { title: "Show", createdBy: "manager", placeId: "one" };
  await assertSucceeds(setDoc(doc(db("manager"), "events/new"), event));
  await assertFails(
    setDoc(doc(db("manager"), "events/wrong"), { ...event, placeId: "two" }),
  );
  await assertFails(
    updateDoc(doc(db("manager"), "events/linked"), { placeId: "two" }),
  );
  await assertSucceeds(
    updateDoc(doc(db("outsider"), "events/standalone"), { title: "Author" }),
  );
  await assertSucceeds(
    updateDoc(doc(db("owner"), "events/linked"), { createdBy: "target" }),
  );
});
test("protege role global, active e partnerId contra autoelevação", async () => {
  for (const patch of [
    { role: "admin" },
    { partnerId: "legacy" },
    { active: false },
  ])
    await assertFails(updateDoc(doc(db("outsider"), "users/outsider"), patch));
  await assertSucceeds(
    updateDoc(doc(db("outsider"), "users/outsider"), { name: "Updated" }),
  );
});
test("preserva login inicial e leitura pública por ID/slug", async () => {
  await assertSucceeds(
    setDoc(doc(db("new-user"), "users/new-user"), {
      id: "new-user",
      role: "user",
      active: true,
      partnerId: null,
    }),
  );
  await assertSucceeds(getDoc(doc(db(), "places/one")));
  await assertSucceeds(getDoc(doc(db(), "users/outsider")));
  await assertSucceeds(
    getDocs(query(collection(db(), "events"), where("slug", "==", "linked"))),
  );
  await assertFails(getDoc(doc(db(), "places/one/members/manager")));
});
test("Bora exige contador na mesma transação; atividade é privada", async () => {
  const client = db("employee");
  const batch = writeBatch(client);
  batch.set(doc(client, "events/linked/boras/employee"), {
    eventId: "linked",
    user: { id: "employee" },
    createdAt: serverTimestamp(),
  });
  batch.update(doc(client, "events/linked"), { boraCount: increment(1) });
  await assertSucceeds(batch.commit());
  await assertSucceeds(
    getDocs(
      query(
        collectionGroup(client, "boras"),
        where("user.id", "==", "employee"),
      ),
    ),
  );
  await assertFails(
    getDocs(
      query(
        collectionGroup(db("outsider"), "boras"),
        where("user.id", "==", "employee"),
      ),
    ),
  );
  await assertFails(
    updateDoc(doc(client, "events/linked"), { boraCount: 100 }),
  );
  const remove = writeBatch(client);
  remove.delete(doc(client, "events/linked/boras/employee"));
  remove.update(doc(client, "events/linked"), { boraCount: increment(-1) });
  await assertSucceeds(remove.commit());
});
test("check-in mantém caminho e contador e não aceita duplicação", async () => {
  const client = db("employee");
  const batch = writeBatch(client);
  const ref = doc(client, "events/linked/checkins/employee");
  const value = {
    eventId: "linked",
    user: { id: "employee" },
    checkedInAt: serverTimestamp(),
    latitude: -22,
    longitude: -43,
  };
  batch.set(ref, value);
  batch.update(doc(client, "events/linked"), { checkinCount: increment(1) });
  await assertSucceeds(batch.commit());
  await assertFails(setDoc(ref, value));
  await assertSucceeds(
    updateDoc(doc(db(), "events/linked"), { views: increment(1) }),
  );
});

const tableData = (id = "t1", overrides = {}) => ({
  id,
  number: 5,
  name: "Mesa 05",
  capacity: 4,
  active: true,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...overrides,
});
async function enableTables() {
  await setDoc(
    doc(db("owner"), "places/one/settings/modules"),
    moduleSettings("owner", { tables: true }),
  );
}
test("tables: owner and manager manage a reusable physical resource", async () => {
  await enableTables();
  const ref = doc(db("owner"), "places/one/tables/t1");
  await assertSucceeds(setDoc(ref, tableData()));
  const createdAt = (await getDoc(ref)).data().createdAt;
  const managerRef = doc(db("manager"), "places/one/tables/t1");
  await assertSucceeds(
    updateDoc(managerRef, {
      number: 6,
      name: "Varanda",
      capacity: 8,
      updatedAt: serverTimestamp(),
    }),
  );
  for (const active of [false, true, false, true])
    await assertSucceeds(
      updateDoc(managerRef, { active, updatedAt: serverTimestamp() }),
    );
  const data = (await getDoc(ref)).data();
  if (
    !data.createdAt.isEqual(createdAt) ||
    data.id !== "t1" ||
    data.capacity !== 8
  )
    throw Error("Physical identity changed");
  if ((await getDocs(collection(db("owner"), "places/one/tables"))).size !== 1)
    throw Error("Unexpected history records");
});
test("tables: active resources support QR lookup without granting management", async () => {
  await enableTables();
  await setDoc(doc(db("owner"), "places/one/tables/t1"), tableData());
  await assertSucceeds(
    getDocs(collection(db("employee"), "places/one/tables")),
  );
  await assertFails(
    updateDoc(doc(db("employee"), "places/one/tables/t1"), {
      active: false,
      updatedAt: serverTimestamp(),
    }),
  );
  for (const uid of ["outsider", "revoked"]) {
    await assertSucceeds(getDoc(doc(db(uid), "places/one/tables/t1")));
    await assertFails(
      setDoc(doc(db(uid), "places/one/tables/t2"), tableData("t2")),
    );
  }
  for (const uid of ["inactive", null]) {
    await assertFails(getDoc(doc(db(uid), "places/one/tables/t1")));
    await assertFails(
      setDoc(doc(db(uid), "places/one/tables/t2"), tableData("t2")),
    );
  }
  await assertSucceeds(
    updateDoc(doc(db("admin"), "places/one/tables/t1"), {
      capacity: 10,
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    setDoc(doc(db("manager"), "places/two/tables/t1"), tableData()),
  );
});
test("tables: module defaults off and disabling preserves data but denies operations", async () => {
  const ref = doc(db("owner"), "places/one/tables/t1");
  await assertFails(setDoc(ref, tableData()));
  await enableTables();
  await setDoc(ref, tableData());
  await setDoc(
    doc(db("owner"), "places/one/settings/modules"),
    moduleSettings("owner"),
  );
  await assertFails(getDoc(ref));
  await assertFails(
    updateDoc(ref, { active: false, updatedAt: serverTimestamp() }),
  );
  await enableTables();
  await assertSucceeds(getDoc(ref));
});
test("tables: strict physical schema, identity and timestamps; no deletion", async () => {
  await enableTables();
  const ref = doc(db("owner"), "places/one/tables/t1");
  for (const extra of [
    { number: 0 },
    { capacity: 0 },
    { capacity: 1.5 },
    { number: -1 },
    { active: "true" },
    { id: "other" },
    { name: "" },
    { name: "x".repeat(101) },
    { history: [] },
    { customerId: "a" },
    { sessionId: "a" },
    { orders: [] },
  ]) {
    await assertFails(setDoc(ref, tableData("t1", extra)));
  }
  await assertSucceeds(setDoc(ref, tableData()));
  await assertFails(
    updateDoc(ref, {
      createdAt: Timestamp.fromMillis(1),
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(updateDoc(ref, { updatedAt: Timestamp.fromMillis(1) }));
  await assertFails(
    updateDoc(ref, { id: "other", updatedAt: serverTimestamp() }),
  );
  await assertFails(deleteDoc(ref));
});

const sessionData = (id = "s1", overrides = {}) => ({
  id,
  placeId: "one",
  tableId: null,
  serviceType: "lounge",
  status: "open",
  customerCount: 4,
  openedAt: serverTimestamp(),
  closedAt: null,
  openedBy: "owner",
  closedBy: null,
  source: "partner_web",
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...overrides,
});
async function enableSessions(tables = false) {
  await setDoc(
    doc(db("owner"), "places/one/settings/modules"),
    moduleSettings("owner", { serviceSessions: true, tables }),
  );
}
const finishSession = async (uid, id, status) => {
  const database = db(uid);
  const ref = doc(database, `places/one/serviceSessions/${id}`);
  const snapshot = await getDoc(ref);
  const batch = writeBatch(database);
  if (snapshot.data()?.tableId)
    batch.delete(
      doc(database, `places/one/tableOccupancies/${snapshot.data().tableId}`),
    );
  batch.update(ref, {
    status,
    closedAt: serverTimestamp(),
    closedBy: uid,
    updatedAt: serverTimestamp(),
  });
  return batch.commit();
};
async function openTableSession(database, id, tableId = "t1") {
  return runTransaction(database, async (tx) => {
    const lock = doc(database, `places/one/tableOccupancies/${tableId}`);
    if ((await tx.get(lock)).exists()) throw Error("occupied");
    tx.set(lock, { sessionId: id });
    tx.set(
      doc(database, `places/one/serviceSessions/${id}`),
      sessionData(id, { serviceType: "table", tableId }),
    );
  });
}
test("sessions: anonymous groups without tables, all non-table types and terminal lifecycle", async () => {
  await enableSessions();
  for (const serviceType of ["counter", "lounge", "takeaway"]) {
    const ref = doc(db("owner"), `places/one/serviceSessions/${serviceType}`);
    await assertSucceeds(
      setDoc(ref, sessionData(serviceType, { serviceType })),
    );
    const initial = (await getDoc(ref)).data();
    await assertSucceeds(finishSession("manager", serviceType, "closed"));
    const final = (await getDoc(ref)).data();
    if (
      final.closedBy !== "manager" ||
      final.tableId !== null ||
      final.customerCount !== 4 ||
      !initial.openedAt.isEqual(final.openedAt)
    )
      throw Error("Session identity lost");
    await assertFails(finishSession("owner", serviceType, "cancelled"));
    await assertFails(
      updateDoc(ref, {
        status: "open",
        closedAt: null,
        closedBy: null,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(deleteDoc(ref));
  }
  await setDoc(
    doc(db("owner"), "places/one/serviceSessions/cancel"),
    sessionData("cancel"),
  );
  await assertSucceeds(finishSession("owner", "cancel", "cancelled"));
  await assertFails(finishSession("owner", "cancel", "closed"));
});
test("sessions: table belongs to the place, is active, and survives repeated journeys unchanged", async () => {
  await enableSessions(true);
  const tableRef = doc(db("owner"), "places/one/tables/t1");
  await setDoc(tableRef, tableData());
  const initial = (await getDoc(tableRef)).data();
  const first = doc(db("owner"), "places/one/serviceSessions/s1");
  await assertFails(
    setDoc(
      first,
      sessionData("s1", { serviceType: "table", tableId: "missing" }),
    ),
  );
  await updateDoc(tableRef, { active: false, updatedAt: serverTimestamp() });
  await assertFails(
    setDoc(first, sessionData("s1", { serviceType: "table", tableId: "t1" })),
  );
  await updateDoc(tableRef, { active: true, updatedAt: serverTimestamp() });
  const beforeSessions = (await getDoc(tableRef)).data();
  for (const id of ["s1", "s2", "s3"]) {
    await assertSucceeds(openTableSession(db("owner"), id));
    await assertSucceeds(finishSession("owner", id, "closed"));
  }
  const final = (await getDoc(tableRef)).data();
  if (
    !final.createdAt.isEqual(initial.createdAt) ||
    !final.updatedAt.isEqual(beforeSessions.updatedAt) ||
    Object.keys(final).length !== 7
  )
    throw Error("Table was modified by service");
  if (
    (await getDocs(collection(db("owner"), "places/one/serviceSessions")))
      .size !== 3
  )
    throw Error("Sessions were overwritten");
});
test("sessions: employee reads; owner, manager and admin write; inactive and foreign members denied", async () => {
  await enableSessions();
  await assertSucceeds(
    setDoc(
      doc(db("manager"), "places/one/serviceSessions/s1"),
      sessionData("s1", { openedBy: "manager" }),
    ),
  );
  await assertSucceeds(
    getDocs(collection(db("employee"), "places/one/serviceSessions")),
  );
  await assertFails(finishSession("employee", "s1", "closed"));
  for (const uid of ["employee", "outsider", "revoked", "inactive", null]) {
    await assertFails(
      setDoc(
        doc(db(uid), "places/one/serviceSessions/s2"),
        sessionData("s2", { openedBy: uid }),
      ),
    );
    if (uid !== "employee")
      await assertFails(getDoc(doc(db(uid), "places/one/serviceSessions/s1")));
  }
  await assertSucceeds(finishSession("admin", "s1", "closed"));
  await assertFails(
    setDoc(
      doc(db("manager"), "places/two/serviceSessions/s1"),
      sessionData("s1", { placeId: "two", openedBy: "manager" }),
    ),
  );
});
test("sessions: strict schema, actors, timestamps and table/type consistency", async () => {
  await enableSessions(true);
  const ref = doc(db("owner"), "places/one/serviceSessions/s1");
  for (const extra of [
    { id: "other" },
    { placeId: "two" },
    { serviceType: "unknown" },
    { customerCount: 0 },
    { customerCount: 1.5 },
    { status: "closed" },
    { openedBy: "manager" },
    { openedAt: Timestamp.fromMillis(1) },
    { closedBy: "owner" },
    { closedAt: Timestamp.fromMillis(1) },
    { source: "untrusted" },
    { tableId: "t1" },
    { serviceType: "table", tableId: null },
    { orders: [] },
    { customerUid: "required-user" },
  ]) {
    await assertFails(setDoc(ref, sessionData("s1", extra)));
  }
  await setDoc(ref, sessionData());
  for (const extra of [
    { customerCount: 10 },
    { openedBy: "other" },
    { tableId: "t1" },
    { source: "other" },
    { createdAt: Timestamp.fromMillis(1) },
    { placeId: "two" },
  ]) {
    await assertFails(
      updateDoc(ref, {
        status: "closed",
        closedBy: "owner",
        closedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...extra,
      }),
    );
  }
  await assertFails(
    updateDoc(ref, {
      status: "closed",
      closedBy: "manager",
      closedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
});
test("sessions: module disabled denies access but preserves existing journeys", async () => {
  const ref = doc(db("owner"), "places/one/serviceSessions/s1");
  await assertFails(setDoc(ref, sessionData()));
  await enableSessions();
  await setDoc(ref, sessionData());
  await setDoc(
    doc(db("owner"), "places/one/settings/modules"),
    moduleSettings("owner"),
  );
  await assertFails(getDoc(ref));
  await assertFails(finishSession("owner", "s1", "closed"));
  await enableSessions();
  await assertSucceeds(finishSession("owner", "s1", "closed"));
});
test("sessions: disabling or deactivating tables never prevents finishing a journey", async () => {
  await enableSessions(true);
  await setDoc(doc(db("owner"), "places/one/tables/t1"), tableData());
  await openTableSession(db("owner"), "s1");
  await updateDoc(doc(db("owner"), "places/one/tables/t1"), {
    active: false,
    updatedAt: serverTimestamp(),
  });
  await enableSessions(false);
  await assertSucceeds(finishSession("owner", "s1", "closed"));
  await assertFails(
    setDoc(
      doc(db("owner"), "places/one/serviceSessions/s2"),
      sessionData("s2", { serviceType: "table", tableId: "t1" }),
    ),
  );
});

test("occupancy: two independent devices racing for one table yield exactly one winner", async () => {
  await enableSessions(true);
  await setDoc(doc(db("owner"), "places/one/tables/t1"), tableData());
  const results = await Promise.allSettled([
    openTableSession(db("owner"), "race-a"),
    openTableSession(db("owner"), "race-b"),
  ]);
  if (results.filter((result) => result.status === "fulfilled").length !== 1)
    throw Error("Expected one winner");
  const lock = (
    await getDoc(doc(db("owner"), "places/one/tableOccupancies/t1"))
  ).data();
  const sessions = await getDocs(
    collection(db("owner"), "places/one/serviceSessions"),
  );
  if (sessions.size !== 1 || sessions.docs[0].id !== lock.sessionId)
    throw Error("Atomicity failed");
  await finishSession("owner", lock.sessionId, "closed");
  await assertSucceeds(openTableSession(db("owner"), "next"));
  if (
    (await getDocs(collection(db("owner"), "places/one/serviceSessions")))
      .size !== 2
  )
    throw Error("History overwritten");
});
test("occupancy: direct writes, lock theft and non-atomic release are rejected", async () => {
  await enableSessions(true);
  const database = db("owner");
  await setDoc(doc(database, "places/one/tables/t1"), tableData());
  await assertFails(
    setDoc(
      doc(database, "places/one/serviceSessions/no-lock"),
      sessionData("no-lock", { serviceType: "table", tableId: "t1" }),
    ),
  );
  await assertFails(
    setDoc(doc(database, "places/one/tableOccupancies/t1"), {
      sessionId: "missing",
    }),
  );
  await openTableSession(database, "first");
  await assertFails(deleteDoc(doc(database, "places/one/tableOccupancies/t1")));
  await assertFails(
    updateDoc(doc(database, "places/one/tableOccupancies/t1"), {
      sessionId: "second",
    }),
  );
  await assertFails(
    updateDoc(doc(database, "places/one/serviceSessions/first"), {
      status: "closed",
      closedBy: "owner",
      closedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
  const batch = writeBatch(database);
  batch.set(
    doc(database, "places/one/serviceSessions/second"),
    sessionData("second", { serviceType: "table", tableId: "t1" }),
  );
  batch.set(doc(database, "places/one/tableOccupancies/t1"), {
    sessionId: "second",
  });
  await assertFails(batch.commit());
  await finishSession("owner", "first", "cancelled");
  await assertSucceeds(openTableSession(database, "after-cancel"));
});
test("occupancy: multiple simultaneous tableless journeys remain independent", async () => {
  await enableSessions();
  await Promise.all(
    ["counter", "lounge", "takeaway"].flatMap((serviceType) =>
      [1, 2].map((n) => {
        const id = `${serviceType}-${n}`;
        return assertSucceeds(
          setDoc(
            doc(db("owner"), `places/one/serviceSessions/${id}`),
            sessionData(id, { serviceType }),
          ),
        );
      }),
    ),
  );
  if (
    (await getDocs(collection(db("owner"), "places/one/serviceSessions")))
      .size !== 6
  )
    throw Error("Unexpected exclusivity");
});

const categoryData = (id = "cat", extra = {}) => ({
  id,
  name: "Bebidas",
  description: "",
  order: 0,
  active: true,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...extra,
});
const productData = (id = "item", extra = {}) => ({
  id,
  categoryId: "cat",
  name: "IPA",
  description: "",
  price: 18.5,
  imageUrl: "",
  active: true,
  available: true,
  order: 0,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...extra,
});
async function prepareMenu() {
  await updateDoc(doc(db("owner"), "places/one"), { menuSchemaVersion: 2 });
}
async function addCategory(database, id = "cat") {
  const batch = writeBatch(database);
  batch.set(doc(database, `places/one/menuCategories/${id}`), categoryData(id));
  batch.set(doc(database, `places/one/menuCategoryUsage/${id}`), {
    count: 0,
    itemId: "",
    imported: false,
  });
  return batch.commit();
}
async function addProduct(database, id = "item", extra = {}) {
  const batch = writeBatch(database);
  batch.set(
    doc(database, `places/one/menuItems/${id}`),
    productData(id, extra),
  );
  batch.update(doc(database, "places/one/menuCategoryUsage/cat"), {
    count: increment(1),
    itemId: id,
    imported: false,
  });
  return batch.commit();
}
test("menu: import preserves legacy fields and atomically establishes the new schema", async () => {
  const database = db("owner");
  await updateDoc(doc(database, "places/one"), {
    menuCategories: ["Bebidas"],
    menuItems: [{ id: "item", title: "IPA", price: 18.5 }],
  });
  const batch = writeBatch(database);
  batch.update(doc(database, "places/one"), { menuSchemaVersion: 2 });
  batch.set(doc(database, "places/one/menuCategories/cat"), categoryData());
  batch.set(doc(database, "places/one/menuCategoryUsage/cat"), {
    count: 1,
    itemId: "",
    imported: true,
  });
  batch.set(doc(database, "places/one/menuItems/item"), productData());
  await assertSucceeds(batch.commit());
  if ((await getDoc(doc(database, "places/one"))).data().menuItems.length !== 1)
    throw Error("Legacy data lost");
  await assertFails(updateDoc(doc(database, "places/one"), { menuItems: [] }));
  await assertFails(
    updateDoc(doc(database, "places/one"), { menuSchemaVersion: 1 }),
  );
});
test("menu: CRUD, ordering, availability, category move and safe deletion", async () => {
  await prepareMenu();
  const database = db("manager");
  await addCategory(database);
  await addCategory(database, "other");
  await addProduct(database);
  await assertSucceeds(
    updateDoc(doc(database, "places/one/menuItems/item"), {
      price: 20.25,
      available: false,
      order: 3,
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(deleteDoc(doc(database, "places/one/menuCategories/cat")));
  const move = writeBatch(database);
  move.update(doc(database, "places/one/menuItems/item"), {
    categoryId: "other",
    updatedAt: serverTimestamp(),
  });
  move.update(doc(database, "places/one/menuCategoryUsage/cat"), {
    count: 0,
    itemId: "item",
    imported: false,
  });
  move.update(doc(database, "places/one/menuCategoryUsage/other"), {
    count: 1,
    itemId: "item",
    imported: false,
  });
  await assertSucceeds(move.commit());
  const remove = writeBatch(database);
  remove.delete(doc(database, "places/one/menuItems/item"));
  remove.update(doc(database, "places/one/menuCategoryUsage/other"), {
    count: 0,
    itemId: "item",
    imported: false,
  });
  await assertSucceeds(remove.commit());
  const removeCategory = writeBatch(database);
  removeCategory.delete(doc(database, "places/one/menuCategories/other"));
  removeCategory.delete(doc(database, "places/one/menuCategoryUsage/other"));
  await assertSucceeds(removeCategory.commit());
});
test("menu: public active queries and membership writes", async () => {
  await prepareMenu();
  await addCategory(db("owner"));
  await addProduct(db("owner"));
  await assertSucceeds(
    getDocs(
      query(
        collection(db(null), "places/one/menuItems"),
        where("active", "==", true),
      ),
    ),
  );
  await assertSucceeds(
    getDocs(
      query(
        collection(db(null), "places/one/menuCategories"),
        where("active", "==", true),
      ),
    ),
  );
  for (const uid of ["employee", "outsider", "revoked", "inactive", null])
    await assertFails(
      updateDoc(doc(db(uid), "places/one/menuItems/item"), {
        price: 1,
        updatedAt: serverTimestamp(),
      }),
    );
  await assertSucceeds(
    updateDoc(doc(db("admin"), "places/one/menuItems/item"), {
      active: false,
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(getDoc(doc(db(null), "places/one/menuItems/item")));
  await assertSucceeds(
    getDoc(doc(db("employee"), "places/one/menuItems/item")),
  );
});
test("menu: invalid prices, forged usage, foreign category and disabled module rejected", async () => {
  await prepareMenu();
  const database = db("owner");
  await addCategory(database);
  await addProduct(database);
  for (const extra of [
    { price: -1 },
    { price: 1.234 },
    { categoryId: "missing" },
    { imageUrl: "javascript:alert(1)" },
    { name: "" },
    { order: -1 },
    { id: "other" },
  ])
    await assertFails(
      updateDoc(doc(database, "places/one/menuItems/item"), {
        ...extra,
        updatedAt: serverTimestamp(),
      }),
    );
  await assertFails(
    updateDoc(doc(database, "places/one/menuCategoryUsage/cat"), {
      count: 0,
      itemId: "item",
      imported: false,
    }),
  );
  await assertFails(
    setDoc(
      doc(database, "places/one/menuItems/unguarded"),
      productData("unguarded"),
    ),
  );
  await setDoc(
    doc(database, "places/one/settings/modules"),
    moduleSettings("owner", { menu: false }),
  );
  await assertFails(
    updateDoc(doc(database, "places/one/menuItems/item"), {
      available: false,
      updatedAt: serverTimestamp(),
    }),
  );
  await assertSucceeds(getDoc(doc(db(null), "places/one/menuItems/item")));
});

const presence = (source = "manual") => ({
  userId: "outsider",
  placeId: "one",
  source,
  sources: [source],
  checkedInAt: serverTimestamp(),
  checkedOutAt: null,
});
test("presence merges origins without changing start, identity or creating duplicates", async () => {
  const ref = doc(db("outsider"), "places/one/checkins/outsider");
  await assertSucceeds(setDoc(ref, presence()));
  await assertSucceeds(updateDoc(ref, { sources: ["manual", "qr"] }));
  await assertFails(
    setDoc(doc(db("outsider"), "places/one/checkins/random"), presence()),
  );
  await assertFails(updateDoc(ref, { source: "qr" }));
  await assertFails(updateDoc(ref, { sources: ["qr"] }));
  await assertFails(updateDoc(ref, { sources: ["manual", "qr", "geofence"] }));
  await assertFails(deleteDoc(ref));
});
test("presence protects staff, geofence and private data", async () => {
  await assertFails(
    setDoc(
      doc(db("outsider"), "places/one/checkins/outsider"),
      presence("staff"),
    ),
  );
  await assertFails(
    setDoc(
      doc(db("outsider"), "places/one/checkins/outsider"),
      presence("geofence"),
    ),
  );
  await assertSucceeds(
    setDoc(
      doc(db("employee"), "places/one/checkins/outsider"),
      presence("staff"),
    ),
  );
  await assertFails(getDoc(doc(db("target"), "places/one/checkins/outsider")));
  await assertFails(getDocs(collection(db("target"), "places/one/checkins")));
  await assertFails(
    setDoc(doc(db("inactive"), "places/one/checkins/inactive"), {
      ...presence(),
      userId: "inactive",
    }),
  );
});
test("future trusted geofence presence accepts manual context without a new record", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), "places/one/checkins/outsider"),
      presence("geofence"),
    );
  });
  await assertSucceeds(
    updateDoc(doc(db("outsider"), "places/one/checkins/outsider"), {
      sources: ["geofence", "manual"],
    }),
  );
});
test("auto checkin settings stay optional, authorized and without duplicate coordinates", async () => {
  const ref = doc(db("owner"), "places/one");
  await assertSucceeds(updateDoc(ref, { autoCheckinSettings: {} }));
  await assertSucceeds(
    updateDoc(ref, {
      autoCheckinSettings: {
        autoCheckinEnabled: false,
        radiusMeters: 150,
        minimumStayMinutes: 5,
      },
    }),
  );
  await assertFails(updateDoc(ref, { autoCheckinSettings: { latitude: 1 } }));
  await assertFails(
    updateDoc(ref, { autoCheckinSettings: { radiusMeters: -1 } }),
  );
  await assertFails(
    updateDoc(doc(db("employee"), "places/one"), {
      autoCheckinSettings: { autoCheckinEnabled: true },
    }),
  );
});

test("concurrent manual and QR reuse the same presence atomically", async () => {
  const client = db("outsider");
  const ref = doc(client, "places/one/checkins/outsider");
  const record = (source) =>
    runTransaction(client, async (tx) => {
      const current = await tx.get(ref);
      if (!current.exists()) tx.set(ref, presence(source));
      else if (!current.data().sources.includes(source))
        tx.update(ref, { sources: [...current.data().sources, source] });
    });
  await Promise.all([record("manual"), record("qr")]);
  const result = await getDoc(ref);
  if (result.data().sources.length !== 2) throw Error("Context lost");
  await env.withSecurityRulesDisabled(async (context) => {
    const trusted = context.firestore();
    if ((await getDocs(collection(trusted, "places/one/checkins"))).size !== 1)
      throw Error("Duplicate presence");
    for (const path of [
      "places/one/serviceSessions",
      "places/one/tables",
      "places/one/orders",
    ])
      if (!(await getDocs(collection(trusted, path))).empty)
        throw Error("Unexpected operation");
  });
});

async function seedOrders() {
  await env.withSecurityRulesDisabled(async (context) => {
    const trusted = context.firestore();
    const batch = writeBatch(trusted);
    batch.update(doc(trusted, "places/one"), { menuSchemaVersion: 2 });
    batch.set(
      doc(trusted, "places/one/settings/modules"),
      moduleSettings("owner", {
        orders: true,
        serviceSessions: true,
        menu: true,
        tables: false,
      }),
    );
    for (const [id, serviceType, tableId] of [
      ["counter", "counter", null],
      ["lounge", "lounge", null],
      ["table", "table", "table05"],
      ["takeaway", "takeaway", null],
    ])
      batch.set(doc(trusted, `places/one/serviceSessions/${id}`), {
        placeId: "one",
        serviceType,
        tableId,
        status: "open",
      });
    for (let i = 0; i < 5; i++) {
      batch.set(doc(trusted, `places/one/menuItems/ipa${i}`), {
        id: `ipa${i}`,
        categoryId: "beer",
        name: `IPA ${i}`,
        price: 18,
        active: true,
        available: true,
      });
    }
    batch.set(doc(trusted, "places/one/menuCategories/beer"), { active: true });
    await batch.commit();
  });
}
const orderLine = (i = 0) => ({
  menuItemId: `ipa${i}`,
  name: `IPA ${i}`,
  quantity: 2,
  unitPrice: 18,
  total: 36,
});
const orderData = (id = "o", serviceType = "counter", overrides = {}) => ({
  id,
  placeId: "one",
  serviceSessionId: serviceType,
  serviceType,
  tableId: serviceType === "table" ? "table05" : null,
  customerUid: null,
  status: "pending",
  items: [orderLine()],
  subtotal: 36,
  total: 36,
  notes: "",
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...overrides,
});
test("mobile geofence requires explicit consent and supports tolerant checkout", async () => {
  const client = db("outsider"),
    ref = doc(client, "places/one/checkins/outsider");
  await assertFails(setDoc(ref, presence("geofence")));
  await updateDoc(doc(client, "users/outsider"), {
    autoCheckinConsentEnabled: true,
    autoCheckinConsentUpdatedAt: serverTimestamp(),
  });
  await assertSucceeds(setDoc(ref, presence("geofence")));
  await assertSucceeds(updateDoc(ref, { checkedOutAt: serverTimestamp() }));
  const closed = (await getDoc(ref)).data();
  if (!(closed.checkedOutAt instanceof Timestamp))
    throw Error("Automatic checkout was not persisted");
});
test("orders: several anonymous orders share a session with or without table", async () => {
  await seedOrders();
  for (const kind of ["counter", "lounge", "takeaway", "table"])
    for (let i = 0; i < 3; i++) {
      const id = `${kind}${i}`;
      await assertSucceeds(
        setDoc(
          doc(db("owner"), `places/one/orders/${id}`),
          orderData(id, kind),
        ),
      );
    }
  await assertSucceeds(
    getDocs(collection(db("employee"), "places/one/orders")),
  );
});
test("orders: validates five authoritative snapshots within rule access limits for manager", async () => {
  await seedOrders();
  await assertSucceeds(
    setDoc(
      doc(db("manager"), "places/one/orders/o"),
      orderData("o", "counter", {
        items: Array.from({ length: 5 }, (_, i) => orderLine(i)),
        subtotal: 180,
        total: 180,
      }),
    ),
  );
});
test("orders: lifecycle, immutable prices and preservation after menu changes", async () => {
  await seedOrders();
  const client = db("owner"),
    ref = doc(client, "places/one/orders/o");
  await assertSucceeds(setDoc(ref, orderData()));
  await env.withSecurityRulesDisabled(async (context) => {
    await deleteDoc(doc(context.firestore(), "places/one/menuItems/ipa0"));
    await updateDoc(
      doc(context.firestore(), "places/one/serviceSessions/counter"),
      { status: "closed" },
    );
  });
  await assertFails(
    updateDoc(ref, { status: "ready", updatedAt: serverTimestamp() }),
  );
  await assertFails(
    updateDoc(ref, {
      items: [{ ...orderLine(), unitPrice: 20, total: 40 }],
      subtotal: 40,
      total: 40,
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    updateDoc(ref, {
      serviceSessionId: "lounge",
      serviceType: "lounge",
      updatedAt: serverTimestamp(),
    }),
  );
  for (const status of ["accepted", "preparing", "ready", "delivered"])
    await assertSucceeds(
      updateDoc(ref, { status, updatedAt: serverTimestamp() }),
    );
  await assertFails(
    updateDoc(ref, { status: "cancelled", updatedAt: serverTimestamp() }),
  );
  await assertFails(deleteDoc(ref));
  const result = (await getDoc(ref)).data();
  if (result.total !== 36 || result.items[0].name !== "IPA 0")
    throw Error("Order snapshot changed");
});
test("orders: cancellation is terminal and timestamps cannot be forged", async () => {
  await seedOrders();
  const ref = doc(db("owner"), "places/one/orders/o");
  await assertSucceeds(setDoc(ref, orderData()));
  await assertFails(
    updateDoc(ref, { status: "accepted", updatedAt: Timestamp.fromMillis(1) }),
  );
  await assertSucceeds(
    updateDoc(ref, { status: "cancelled", updatedAt: serverTimestamp() }),
  );
  await assertFails(
    updateDoc(ref, { status: "pending", updatedAt: serverTimestamp() }),
  );
});
test("orders: blocks forged totals, quantities, links, unavailable products and closed sessions", async () => {
  await seedOrders();
  const ref = doc(db("owner"), "places/one/orders/o");
  for (const overrides of [
    { total: 1 },
    { subtotal: 1, total: 1 },
    { items: [] },
    { items: [{ ...orderLine(), quantity: 0 }] },
    { items: [{ ...orderLine(), quantity: 1.5 }] },
    {
      items: [{ ...orderLine(), unitPrice: 1, total: 2 }],
      subtotal: 2,
      total: 2,
    },
    { items: [{ ...orderLine(), name: "Forged" }] },
    {
      items: Array.from({ length: 6 }, () => orderLine()),
      subtotal: 216,
      total: 216,
    },
    { serviceSessionId: "missing" },
    { placeId: "two" },
    { tableId: "foreign-table" },
    { serviceType: "table" },
    { customerUid: 123 },
    { status: "delivered" },
    { createdAt: Timestamp.fromMillis(1) },
    { notes: "x".repeat(2001) },
  ])
    await assertFails(setDoc(ref, orderData("o", "counter", overrides)));
  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), "places/one/menuItems/ipa0"), {
      available: false,
    });
  });
  await assertFails(setDoc(ref, orderData()));
  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), "places/one/menuItems/ipa0"), {
      available: true,
    });
    await updateDoc(
      doc(context.firestore(), "places/one/serviceSessions/counter"),
      { status: "closed" },
    );
  });
  await assertFails(setDoc(ref, orderData()));
});
test("orders: member isolation and module gates apply to direct SDK writes", async () => {
  await seedOrders();
  for (const uid of ["employee", "outsider", "inactive", "revoked", null]) {
    await assertFails(setDoc(doc(db(uid), "places/one/orders/o"), orderData()));
  }
  await assertFails(
    setDoc(
      doc(db("owner"), "places/two/orders/o"),
      orderData("o", "counter", { placeId: "two" }),
    ),
  );
  for (const module of ["orders", "serviceSessions", "menu"]) {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "places/one/settings/modules"),
        moduleSettings("owner", {
          orders: true,
          serviceSessions: true,
          menu: true,
          [module]: false,
        }),
      );
    });
    await assertFails(
      setDoc(doc(db("owner"), "places/one/orders/o"), orderData()),
    );
  }
});
test("orders: direct concurrent status updates cannot apply the same transition twice", async () => {
  await seedOrders();
  await setDoc(doc(db("owner"), "places/one/orders/o"), orderData());
  const results = await Promise.allSettled(
    ["owner", "manager"].map((uid) =>
      updateDoc(doc(db(uid), "places/one/orders/o"), {
        status: "accepted",
        updatedAt: serverTimestamp(),
      }),
    ),
  );
  if (results.filter((result) => result.status === "fulfilled").length !== 1)
    throw Error("Expected exactly one transition");
});

test("orders: realtime listener receives another operator's status update", async () => {
  await seedOrders();
  await setDoc(doc(db("owner"), "places/one/orders/o"), orderData());
  let stop = () => {};
  let timer;
  const received = new Promise((resolve, reject) => {
    timer = setTimeout(
      () => reject(Error("Realtime order update timed out")),
      10000,
    );
    stop = onSnapshot(
      doc(db("employee"), "places/one/orders/o"),
      (snapshot) => {
        if (snapshot.data()?.status === "accepted") resolve();
      },
      reject,
    );
  });
  try {
    await updateDoc(doc(db("manager"), "places/one/orders/o"), {
      status: "accepted",
      updatedAt: serverTimestamp(),
    });
    await received;
  } finally {
    stop();
    clearTimeout(timer);
  }
});
test("orders: fractional prices and a full transactional menu read remain valid", async () => {
  await seedOrders();
  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), "places/one/menuItems/ipa0"), {
      price: 0.1,
    });
  });
  const client = db("manager");
  await assertSucceeds(
    runTransaction(client, async (tx) => {
      for (const path of [
        "places/one",
        "places/one/members/manager",
        "places/one/settings/modules",
        "places/one/serviceSessions/counter",
        "places/one/menuCategories/beer",
      ])
        await tx.get(doc(client, path));
      const items = [];
      for (let i = 0; i < 5; i++) {
        const product = (
          await tx.get(doc(client, `places/one/menuItems/ipa${i}`))
        ).data();
        items.push({
          ...orderLine(i),
          unitPrice: product.price,
          total: (Math.round(product.price * 100) * 2) / 100,
        });
      }
      const total =
        items.reduce((sum, item) => sum + Math.round(item.total * 100), 0) /
        100;
      tx.set(
        doc(client, "places/one/orders/o"),
        orderData("o", "counter", { items, subtotal: total, total }),
      );
    }),
  );
});

async function seedSessionAccounts() {
  await seedOrders();
  await env.withSecurityRulesDisabled(async (context) => {
    const trusted = context.firestore(),
      batch = writeBatch(trusted);
    batch.set(
      doc(trusted, "places/one/settings/modules"),
      moduleSettings("owner", {
        orders: true,
        serviceSessions: true,
        menu: true,
        tables: true,
      }),
    );
    for (const serviceType of ["counter", "lounge", "table"])
      batch.set(
        doc(trusted, `places/one/serviceSessions/${serviceType}`),
        sessionData(serviceType, {
          serviceType,
          tableId: serviceType === "table" ? "table05" : null,
        }),
      );
    batch.set(doc(trusted, "places/one/tables/table05"), tableData("table05"));
    batch.set(doc(trusted, "places/one/tableOccupancies/table05"), {
      sessionId: "table",
    });
    await batch.commit();
  });
}
test("accounts: table closing releases occupancy and preserves all orders and session fields", async () => {
  await seedSessionAccounts();
  const client = db("owner");
  for (const id of ["100", "112", "130"])
    await setDoc(
      doc(client, `places/one/orders/${id}`),
      orderData(id, "table"),
    );
  const original = (
    await getDoc(doc(client, "places/one/serviceSessions/table"))
  ).data();
  await assertSucceeds(finishSession("owner", "table", "closed"));
  const closed = (
    await getDoc(doc(client, "places/one/serviceSessions/table"))
  ).data();
  if (
    closed.status !== "closed" ||
    !closed.closedAt ||
    !closed.openedAt.isEqual(original.openedAt)
  )
    throw Error("History lost");
  if ("total" in closed || "orders" in closed)
    throw Error("Unsafe duplicate totals");
  if (
    (await getDoc(doc(client, "places/one/tableOccupancies/table05"))).exists()
  )
    throw Error("Table not released");
  await assertSucceeds(openTableSession(client, "next-visit", "table05"));
  const orders = await getDocs(collection(client, "places/one/orders"));
  if (
    orders.size !== 3 ||
    orders.docs.some((row) => row.data().serviceSessionId !== "table")
  )
    throw Error("Order history reassigned");
  await assertFails(
    setDoc(doc(client, "places/one/orders/late"), orderData("late", "table")),
  );
  await assertFails(deleteDoc(doc(client, "places/one/serviceSessions/table")));
  await assertFails(
    updateDoc(doc(client, "places/one/serviceSessions/table"), { total: 108 }),
  );
});
test("accounts: counter and lounge closing affects only their own journey", async () => {
  await seedSessionAccounts();
  const client = db("owner");
  for (const kind of ["counter", "lounge"]) {
    await setDoc(
      doc(client, `places/one/orders/${kind}`),
      orderData(kind, kind),
    );
    await assertSucceeds(finishSession("manager", kind, "closed"));
    await assertFails(
      setDoc(
        doc(client, `places/one/orders/${kind}-late`),
        orderData(`${kind}-late`, kind),
      ),
    );
    if (!(await getDoc(doc(client, `places/one/orders/${kind}`))).exists())
      throw Error("Order deleted");
  }
  if (
    !(await getDoc(doc(client, "places/one/tableOccupancies/table05"))).exists()
  )
    throw Error("Unrelated table released");
  if (
    (await getDoc(doc(client, "places/one/serviceSessions/table"))).data()
      .status !== "open"
  )
    throw Error("Unrelated session closed");
});
test("accounts: cancelled orders remain historical and monetary changes stop after closing", async () => {
  await seedSessionAccounts();
  const client = db("owner"),
    cancelled = doc(client, "places/one/orders/cancelled"),
    active = doc(client, "places/one/orders/active");
  await setDoc(cancelled, orderData("cancelled"));
  await setDoc(active, orderData("active"));
  await assertSucceeds(
    updateDoc(cancelled, { status: "cancelled", updatedAt: serverTimestamp() }),
  );
  await finishSession("owner", "counter", "closed");
  await assertFails(
    updateDoc(active, { status: "cancelled", updatedAt: serverTimestamp() }),
  );
  await assertSucceeds(
    updateDoc(active, { status: "accepted", updatedAt: serverTimestamp() }),
  );
  await assertFails(
    updateDoc(active, { total: 0, subtotal: 0, updatedAt: serverTimestamp() }),
  );
  await assertFails(deleteDoc(active));
  const records = await getDocs(collection(client, "places/one/orders"));
  const cents = records.docs.reduce(
    (sum, row) =>
      sum +
      (row.data().status === "cancelled"
        ? 0
        : Math.round(row.data().total * 100)),
    0,
  );
  if (records.size !== 2 || cents !== 3600) throw Error("Closed bill changed");
});
test("accounts: closing and adding or cancelling an order in the same batch is denied", async () => {
  await seedSessionAccounts();
  const client = db("owner");
  await setDoc(
    doc(client, "places/one/orders/existing"),
    orderData("existing"),
  );
  for (const action of ["create", "cancel"]) {
    const batch = writeBatch(client);
    batch.update(doc(client, "places/one/serviceSessions/counter"), {
      status: "closed",
      closedAt: serverTimestamp(),
      closedBy: "owner",
      updatedAt: serverTimestamp(),
    });
    if (action === "create")
      batch.set(doc(client, "places/one/orders/new"), orderData("new"));
    else
      batch.update(doc(client, "places/one/orders/existing"), {
        status: "cancelled",
        updatedAt: serverTimestamp(),
      });
    await assertFails(batch.commit());
  }
  if (
    (await getDoc(doc(client, "places/one/serviceSessions/counter"))).data()
      .status !== "open"
  )
    throw Error("Partial closure");
});
test("accounts: a transaction that read open cannot add an order after another operator closes", async () => {
  await seedSessionAccounts();
  const client = db("manager");
  let readOpen, resume;
  const read = new Promise((resolve) => {
    readOpen = resolve;
  });
  const gate = new Promise((resolve) => {
    resume = resolve;
  });
  const pending = runTransaction(client, async (tx) => {
    const snapshot = await tx.get(
      doc(client, "places/one/serviceSessions/counter"),
    );
    if (snapshot.data().status !== "open") throw Error("Session closed");
    readOpen();
    await gate;
    tx.set(doc(client, "places/one/orders/racing"), orderData("racing"));
  }).then(
    () => true,
    () => false,
  );
  await read;
  try {
    await finishSession("owner", "counter", "closed");
  } finally {
    resume();
  }
  if (await pending) throw Error("Order committed after closure");
  if ((await getDoc(doc(db("owner"), "places/one/orders/racing"))).exists())
    throw Error("Late order persisted");
});
test("accounts: a cancellation that read open cannot change the bill after closing", async () => {
  await seedSessionAccounts();
  const client = db("manager");
  await setDoc(
    doc(db("owner"), "places/one/orders/racing"),
    orderData("racing"),
  );
  let readOpen, resume;
  const read = new Promise((resolve) => {
    readOpen = resolve;
  });
  const gate = new Promise((resolve) => {
    resume = resolve;
  });
  const pending = runTransaction(client, async (tx) => {
    const snapshot = await tx.get(
      doc(client, "places/one/serviceSessions/counter"),
    );
    await tx.get(doc(client, "places/one/orders/racing"));
    if (snapshot.data().status !== "open") throw Error("Session closed");
    readOpen();
    await gate;
    tx.update(doc(client, "places/one/orders/racing"), {
      status: "cancelled",
      updatedAt: serverTimestamp(),
    });
  }).then(
    () => true,
    () => false,
  );
  await read;
  try {
    await finishSession("owner", "counter", "closed");
  } finally {
    resume();
  }
  if (await pending) throw Error("Cancellation committed after closure");
  if (
    (await getDoc(doc(db("owner"), "places/one/orders/racing"))).data()
      .status !== "pending"
  )
    throw Error("Bill changed");
});

const qrPresence = (uid) => ({
  userId: uid,
  placeId: "one",
  source: "qr",
  sources: ["qr"],
  checkedInAt: serverTimestamp(),
  checkedOutAt: null,
});
const qrSession = (id, uid, tableId = null) => ({
  id,
  placeId: "one",
  tableId,
  serviceType: tableId ? "table" : "counter",
  status: "open",
  customerCount: 1,
  openedAt: serverTimestamp(),
  closedAt: null,
  openedBy: uid,
  closedBy: null,
  source: "customer_qr",
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});
const qrContext = (uid, sessionId, tableId = null) => ({
  userId: uid,
  placeId: "one",
  serviceSessionId: sessionId,
  tableId,
  source: "qr",
  updatedAt: serverTimestamp(),
});
const qrParticipant = (uid, sessionId) => ({
  userId: uid,
  placeId: "one",
  serviceSessionId: sessionId,
  source: "customer_qr",
  joinedAt: serverTimestamp(),
  leftAt: null,
});
async function seedQr() {
  await seedOrders();
  await env.withSecurityRulesDisabled(async (context) => {
    const trusted = context.firestore(),
      batch = writeBatch(trusted);
    batch.set(
      doc(trusted, "places/one/settings/modules"),
      moduleSettings("owner", {
        orders: true,
        serviceSessions: true,
        menu: true,
        tables: true,
      }),
    );
    batch.set(
      doc(trusted, "places/one/tables/table05"),
      tableData("table05", { number: 5, name: "Mesa 05", active: true }),
    );
    batch.set(
      doc(trusted, "places/one/tables/table06"),
      tableData("table06", { number: 6, name: "Mesa 06", active: false }),
    );
    await batch.commit();
  });
}
async function createQrJourney(uid, sessionId, tableId = null) {
  const client = db(uid);
  const presence = doc(client, `places/one/checkins/${String(uid)}`);
  if (!(await getDoc(presence)).exists())
    await setDoc(presence, qrPresence(uid));
  const batch = writeBatch(client);
  batch.set(
    doc(client, `places/one/customerContexts/${String(uid)}`),
    qrContext(uid, sessionId, tableId),
  );
  batch.set(
    doc(client, `places/one/serviceSessions/${String(sessionId)}`),
    qrSession(sessionId, uid, tableId),
  );
  batch.set(
    doc(
      client,
      `places/one/serviceSessions/${String(sessionId)}/participants/${String(uid)}`,
    ),
    qrParticipant(uid, sessionId),
  );
  if (tableId)
    batch.set(doc(client, `places/one/tableOccupancies/${String(tableId)}`), {
      sessionId,
    });
  return batch.commit();
}
test("qr: check-in remains independent until the customer starts a service journey", async () => {
  await seedQr();
  const client = db("outsider");
  await assertSucceeds(
    setDoc(doc(client, "places/one/checkins/outsider"), qrPresence("outsider")),
  );
  if (
    (await getDoc(doc(client, "places/one/customerContexts/outsider"))).exists()
  )
    throw Error("Check-in created a customer context");
  if (
    (
      await getDoc(doc(db("owner"), "places/one/serviceSessions/general-visit"))
    ).exists()
  )
    throw Error("Check-in created a service session");
  const batch = writeBatch(client);
  batch.set(
    doc(client, "places/one/customerContexts/outsider"),
    qrContext("outsider", "general-visit"),
  );
  batch.set(
    doc(client, "places/one/serviceSessions/general-visit"),
    qrSession("general-visit", "outsider"),
  );
  batch.set(
    doc(
      client,
      "places/one/serviceSessions/general-visit/participants/outsider",
    ),
    qrParticipant("outsider", "general-visit"),
  );
  await assertSucceeds(batch.commit());
  const context = (
    await getDoc(doc(client, "places/one/customerContexts/outsider"))
  ).data();
  if (context.tableId !== null || context.serviceSessionId !== "general-visit")
    throw Error("Invalid general context");
  await assertSucceeds(
    getDoc(doc(client, "places/one/serviceSessions/general-visit")),
  );
});
test("qr: table link creates occupancy once and can join its current dynamic journey", async () => {
  await seedQr();
  await assertSucceeds(createQrJourney("outsider", "table-visit", "table05"));
  const target = db("target"),
    batch = writeBatch(target);
  batch.set(doc(target, "places/one/checkins/target"), qrPresence("target"));
  batch.set(
    doc(target, "places/one/customerContexts/target"),
    qrContext("target", "table-visit", "table05"),
  );
  batch.set(
    doc(target, "places/one/serviceSessions/table-visit/participants/target"),
    qrParticipant("target", "table-visit"),
  );
  await assertSucceeds(batch.commit());
  const participants = await getDocs(
    collection(
      db("owner"),
      "places/one/serviceSessions/table-visit/participants",
    ),
  );
  if (participants.size !== 2)
    throw Error("Session did not retain multiple participants");
  await assertSucceeds(
    getDoc(doc(target, "places/one/serviceSessions/table-visit")),
  );
  await assertFails(createQrJourney("target", "second-table-visit", "table05"));
  if (
    (
      await getDoc(doc(db("owner"), "places/one/tableOccupancies/table05"))
    ).data().sessionId !== "table-visit"
  )
    throw Error("Physical QR replaced occupancy");
});
test("qr: physical table link remains reusable after the previous group leaves", async () => {
  await seedQr();
  await createQrJourney("outsider", "first", "table05");
  await finishSession("owner", "first", "closed");
  const client = db("outsider"),
    batch = writeBatch(client);
  batch.set(
    doc(client, "places/one/customerContexts/outsider"),
    qrContext("outsider", "second", "table05"),
  );
  batch.set(
    doc(client, "places/one/serviceSessions/second"),
    qrSession("second", "outsider", "table05"),
  );
  batch.set(
    doc(client, "places/one/serviceSessions/second/participants/outsider"),
    qrParticipant("outsider", "second"),
  );
  batch.set(doc(client, "places/one/tableOccupancies/table05"), {
    sessionId: "second",
  });
  await assertSucceeds(batch.commit());
  if (
    (await getDoc(doc(client, "places/one/customerContexts/outsider"))).data()
      .serviceSessionId !== "second"
  )
    throw Error("Stale session persisted");
});
test("qr: table lookup exposes active physical resources but not inactive ones", async () => {
  await seedQr();
  await assertSucceeds(
    getDocs(
      query(
        collection(db("outsider"), "places/one/tables"),
        where("number", "==", 5),
        where("active", "==", true),
      ),
    ),
  );
  await assertFails(getDoc(doc(db("outsider"), "places/one/tables/table06")));
  await assertFails(getDocs(collection(db("outsider"), "places/one/tables")));
});
test("qr: context cannot forge another user, place, table, source or closed session", async () => {
  await seedQr();
  await createQrJourney("outsider", "valid");
  const ref = doc(db("outsider"), "places/one/customerContexts/outsider");
  for (const change of [
    { userId: "target" },
    { placeId: "two" },
    { tableId: "table05" },
    { source: "manual" },
    { serviceSessionId: "missing" },
    { updatedAt: Timestamp.fromMillis(1) },
  ])
    await assertFails(updateDoc(ref, change));
  await assertFails(
    getDoc(doc(db("target"), "places/one/customerContexts/outsider")),
  );
  await assertFails(deleteDoc(ref));
});
test("qr: participants are scoped to their user and session and cannot be rewritten", async () => {
  await seedQr();
  await createQrJourney("outsider", "participants");
  const own = doc(
    db("outsider"),
    "places/one/serviceSessions/participants/participants/outsider",
  );
  await assertSucceeds(getDoc(own));
  await assertFails(
    getDoc(
      doc(
        db("target"),
        "places/one/serviceSessions/participants/participants/outsider",
      ),
    ),
  );
  await assertFails(updateDoc(own, { leftAt: serverTimestamp() }));
  await assertFails(
    setDoc(
      doc(
        db("target"),
        "places/one/serviceSessions/participants/participants/forged",
      ),
      qrParticipant("forged", "participants"),
    ),
  );
});
test("qr: customer creates and follows only own orders in the current context", async () => {
  await seedQr();
  await createQrJourney("outsider", "visit");
  const client = db("outsider"),
    own = doc(client, "places/one/orders/own");
  await assertSucceeds(
    setDoc(
      own,
      orderData("own", "counter", {
        serviceSessionId: "visit",
        customerUid: "outsider",
      }),
    ),
  );
  await assertSucceeds(getDoc(own));
  await assertSucceeds(
    getDocs(
      query(
        collection(client, "places/one/orders"),
        where("customerUid", "==", "outsider"),
      ),
    ),
  );
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), "places/one/orders/foreign"),
      orderData("foreign", "counter", {
        serviceSessionId: "visit",
        customerUid: "target",
      }),
    );
  });
  await assertFails(getDoc(doc(client, "places/one/orders/foreign")));
  await assertFails(getDocs(collection(client, "places/one/orders")));
  await assertFails(
    updateDoc(own, { status: "accepted", updatedAt: serverTimestamp() }),
  );
});
test("qr: customer order rejects stale context, forged table and another customer UID", async () => {
  await seedQr();
  await createQrJourney("outsider", "visit");
  const client = db("outsider"),
    ref = doc(client, "places/one/orders/o");
  await assertFails(
    setDoc(
      ref,
      orderData("o", "counter", {
        serviceSessionId: "missing",
        customerUid: "outsider",
      }),
    ),
  );
  await assertFails(
    setDoc(
      ref,
      orderData("o", "counter", {
        serviceSessionId: "visit",
        tableId: "table05",
        customerUid: "outsider",
      }),
    ),
  );
  await assertFails(
    setDoc(
      ref,
      orderData("o", "counter", {
        serviceSessionId: "visit",
        customerUid: "target",
      }),
    ),
  );
  await finishSession("owner", "visit", "closed");
  await assertFails(
    setDoc(
      ref,
      orderData("o", "counter", {
        serviceSessionId: "visit",
        customerUid: "outsider",
      }),
    ),
  );
});
test("qr: anonymous and inactive users cannot create contexts or journeys", async () => {
  await seedQr();
  await assertFails(createQrJourney(null, "anonymous"));
  await assertFails(createQrJourney("inactive", "inactive"));
});
