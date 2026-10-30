import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
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

function referenceId(value) {
  if (typeof value === "string") return value;
  return value && typeof value === "object" && typeof value.id === "string"
    ? value.id
    : "";
}

function responsible(actor, owner) {
  const ownerId = referenceId(owner);
  return !!ownerId &&
    (ownerId === actor.uid ||
      (actor.role === "partner" && actor.partnerId === ownerId));
}

async function canTransferEvent(db, actor, event) {
  if (actor.role === "admin") return true;
  const placeId = event.placeId;
  if (typeof placeId === "string" && placeId.trim()) {
    const [place, membership] = await Promise.all([
      db.doc(`places/${placeId}`).get(),
      db.doc(`places/${placeId}/members/${actor.uid}`).get(),
    ]);
    if (membership.exists) {
      return place.exists && membership.get("active") === true &&
        membership.get("role") === "owner";
    }
    if (place.exists && responsible(actor, place.get("ownerId"))) return true;
  }
  return actor.role === "partner" && responsible(actor, event.createdBy);
}

export const searchEventTransferRecipients = onCall(
  { region, timeoutSeconds: 30 },
  async (request) => {
    let stage = "authentication";
    if (!request.auth?.uid)
      throw new HttpsError("unauthenticated", "Autenticação obrigatória.");
    try {
      const db = getFirestore();
      stage = "actor-profile";
      const actorSnap = await db.doc(`users/${request.auth.uid}`).get();
      if (!actorSnap.exists || actorSnap.get("active") === false)
        throw new HttpsError("permission-denied", "Conta ativa obrigatória.");
      const eventId = id(request.data?.eventId, "Evento");
      const term = request.data?.term;
      if (typeof term !== "string" || term.trim().length < 2 || term.length > 120)
        throw new HttpsError("invalid-argument", "Digite ao menos 2 caracteres.");
      stage = "event";
      const eventSnap = await db.doc(`events/${eventId}`).get();
      if (!eventSnap.exists)
        throw new HttpsError("not-found", "Evento não encontrado.");
      const actor = { uid: request.auth.uid, ...actorSnap.data() };
      stage = "transfer-permission";
      let permitted;
      try {
        permitted = await canTransferEvent(db, actor, eventSnap.data());
      } catch (error) {
        logger.error("Recipient search permission check failed", {
          stage,
          uid: request.auth.uid,
          eventId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new HttpsError("internal", "Não foi possível validar a permissão de transferência.", { stage });
      }
      if (!permitted)
        throw new HttpsError("permission-denied", "Sem permissão para transferir este evento.");

      const normalized = term.trim().toLowerCase();
      const field = normalized.includes("@") ? "email" : "name";
      // Page through ordered profiles and compare normalized values. This handles
      // mixed casing and does not silently miss matches after the first page.
      stage = "recipient-search";
      const recipients = [];
      let cursor;
      while (recipients.length < 8) {
        let query = db.collection("users").orderBy(field).limit(100);
        if (cursor) query = query.startAfter(cursor);
        let page;
        try {
          page = await query.get();
        } catch (error) {
          logger.error("Recipient profile query failed", {
            stage,
            field,
            uid: request.auth.uid,
            error: error instanceof Error ? error.message : String(error),
          });
          throw new HttpsError(
            "internal",
            `Falha ao consultar perfis pelo campo “${field}”. Verifique os logs da função no Firebase Console.`,
            { stage, field },
          );
        }
        if (page.empty) break;
        for (const candidate of page.docs) {
          cursor = candidate;
          const value = candidate.get(field);
          if (candidate.id === request.auth.uid || candidate.get("active") === false ||
              typeof value !== "string" || !value.trim().toLowerCase().startsWith(normalized))
            continue;
          recipients.push({
            id: candidate.id,
            name: typeof candidate.get("name") === "string" ? candidate.get("name") : "",
            email: typeof candidate.get("email") === "string" ? candidate.get("email") : "",
          });
          if (recipients.length === 8) break;
        }
        if (page.size < 100) break;
      }
      return { recipients };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error("Recipient search failed", {
        stage,
        uid: request.auth.uid,
        eventId: typeof request.data?.eventId === "string" ? request.data.eventId : undefined,
        queryLength: typeof request.data?.term === "string" ? request.data.term.trim().length : undefined,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new HttpsError(
        "internal",
        `A busca de destinatários falhou na etapa “${stage}”. Verifique os logs da função no Firebase Console.`,
        { stage },
      );
    }
  },
);

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
