import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

initializeApp();
const region = "southamerica-east1";
const paidFeatures = [
  "notifications",
  "tables",
  "orders",
  "inventory",
  "purchases",
  "advancedAnalytics",
];
const entitlementStatuses = [
  "active",
  "trialing",
  "past_due",
  "cancelled",
  "expired",
];

function id(value, label) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 1500 ||
    value.includes("/")
  )
    throw new HttpsError("invalid-argument", `${label} inválido.`);
  return value.trim();
}
async function assertAdmin(auth) {
  if (!auth?.uid)
    throw new HttpsError("unauthenticated", "Autenticação obrigatória.");
  const actor = await getFirestore().doc(`users/${auth.uid}`).get();
  if (
    !actor.exists ||
    actor.get("active") !== true ||
    actor.get("role") !== "admin"
  )
    throw new HttpsError(
      "permission-denied",
      "Administrador global ativo obrigatório.",
    );
  return auth.uid;
}
function entitlement(input) {
  if (
    !input ||
    typeof input !== "object" ||
    typeof input.planKey !== "string" ||
    !input.planKey.trim() ||
    input.planKey.length > 100 ||
    !entitlementStatuses.includes(input.status)
  )
    throw new HttpsError("invalid-argument", "Plano ou status inválido.");
  const keys = Object.keys(input.features || {});
  if (
    keys.some((key) => !paidFeatures.includes(key)) ||
    paidFeatures.some((key) => typeof input.features[key] !== "boolean")
  )
    throw new HttpsError("invalid-argument", "Funcionalidades inválidas.");
  let validUntil = null;
  if (input.validUntil !== null) {
    if (typeof input.validUntil !== "string")
      throw new HttpsError("invalid-argument", "Validade inválida.");
    const parsed = new Date(input.validUntil);
    if (Number.isNaN(parsed.valueOf()))
      throw new HttpsError("invalid-argument", "Validade inválida.");
    validUntil = Timestamp.fromDate(parsed);
  }
  return {
    schemaVersion: 1,
    planKey: input.planKey.trim(),
    status: input.status,
    validUntil,
    features: Object.fromEntries(
      paidFeatures.map((key) => [key, input.features[key]]),
    ),
  };
}

export const adminUpdatePlaceEntitlements = onCall(
  { region },
  async (request) => {
    const actorUid = await assertAdmin(request.auth);
    const placeId = id(request.data?.placeId, "Estabelecimento");
    const next = entitlement(request.data);
    const db = getFirestore(),
      placeRef = db.doc(`places/${placeId}`),
      target = db.doc(`places/${placeId}/settings/entitlements`),
      audit = db.collection("adminAuditLogs").doc();
    await db.runTransaction(async (tx) => {
      const [place, before] = await Promise.all([
        tx.get(placeRef),
        tx.get(target),
      ]);
      if (!place.exists)
        throw new HttpsError("not-found", "Estabelecimento não encontrado.");
      const recorded = {
        ...next,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actorUid,
      };
      tx.set(target, recorded);
      tx.set(audit, {
        actorUid,
        placeId,
        targetType: "placeEntitlements",
        operation: before.exists ? "update" : "create",
        before: before.exists ? before.data() : null,
        after: next,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    return { ok: true };
  },
);

export const adminUpdateUser = onCall({ region }, async (request) => {
  const actorUid = await assertAdmin(request.auth);
  const uid = id(request.data?.uid, "Usuário");
  const { active, role, confirmation } = request.data || {};
  if (
    typeof active !== "boolean" ||
    !["user", "partner", "admin"].includes(role) ||
    confirmation !== uid
  )
    throw new HttpsError(
      "invalid-argument",
      "Alteração ou confirmação inválida.",
    );
  if (uid === actorUid && (!active || role !== "admin"))
    throw new HttpsError(
      "failed-precondition",
      "Você não pode remover seu próprio acesso administrativo.",
    );
  const db = getFirestore(),
    target = db.doc(`users/${uid}`),
    audit = db.collection("adminAuditLogs").doc();
  await db.runTransaction(async (tx) => {
    const before = await tx.get(target);
    if (!before.exists)
      throw new HttpsError("not-found", "Usuário não encontrado.");
    if (
      before.get("role") === "admin" &&
      before.get("active") === true &&
      (!active || role !== "admin")
    ) {
      const admins = await tx.get(
        db.collection("users").where("role", "==", "admin"),
      );
      if (
        admins.docs.filter((entry) => entry.get("active") === true).length <= 1
      )
        throw new HttpsError(
          "failed-precondition",
          "O sistema deve manter ao menos um administrador ativo.",
        );
    }
    const after = {
      role,
      active,
      adminUpdatedAt: FieldValue.serverTimestamp(),
      adminUpdatedBy: actorUid,
    };
    tx.update(target, after);
    tx.set(audit, {
      actorUid,
      targetUid: uid,
      targetType: "userAccess",
      operation: "update",
      before: {
        role: before.get("role") || "user",
        active: before.get("active") !== false,
      },
      after: { role, active },
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return { ok: true };
});
