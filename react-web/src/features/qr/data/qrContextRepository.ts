import { collection, doc, getDocs, limit, query, runTransaction, serverTimestamp, where } from "firebase/firestore";
import { assertProductWritesEnabled, database } from "../../../core/firebase";
import type { User } from "../../../shared/models";
import type { PlaceTable } from "../../tables/model/table";
import type { QrContext } from "../model/qrContext";

async function resolveTable(placeId: string, number: number): Promise<PlaceTable> {
  const result = await getDocs(query(collection(database(), "places", placeId, "tables"), where("number", "==", number), where("active", "==", true), limit(2)));
  if (result.empty) throw Error(`Mesa ${String(number).padStart(2, "0")} não encontrada ou inativa.`);
  if (result.size > 1) throw Error("Número de mesa duplicado. Peça ajuda à equipe.");
  return { id: result.docs[0].id, ...result.docs[0].data() } as PlaceTable;
}

export async function prepareQrContext(placeId: string, tableNumber: number | null, user: User): Promise<QrContext> {
  assertProductWritesEnabled("Check-in por QR");
  if (!user.active) throw Error("Conta inativa.");
  const db = database();
  const table = tableNumber === null ? null : await resolveTable(placeId, tableNumber);
  const generatedSession = doc(collection(db, "places", placeId, "serviceSessions"));
  return runTransaction(db, async tx => {
    const placeRef = doc(db, "places", placeId);
    const contextRef = doc(db, "places", placeId, "customerContexts", user.id);
    const checkinRef = doc(db, "places", placeId, "checkins", user.id);
    const [place, current, checkin] = await Promise.all([tx.get(placeRef), tx.get(contextRef), tx.get(checkinRef)]);
    if (!place.exists()) throw Error("Estabelecimento não encontrado.");
    if (!checkin.exists() || checkin.data().checkedOutAt !== null)
      throw Error("Faça check-in antes de iniciar o atendimento.");

    let serviceSessionId = "";
    let createSession = false;
    if (current.exists() && current.data().tableId === (table?.id ?? null)) {
      const session = await tx.get(doc(db, "places", placeId, "serviceSessions", current.data().serviceSessionId));
      if (session.exists() && session.data().status === "open") serviceSessionId = session.id;
    }
    if (!serviceSessionId && table) {
      const occupancy = await tx.get(doc(db, "places", placeId, "tableOccupancies", table.id));
      if (occupancy.exists()) {
        const session = await tx.get(doc(db, "places", placeId, "serviceSessions", occupancy.data().sessionId));
        if (!session.exists() || session.data().status !== "open" || session.data().tableId !== table.id)
          throw Error("Ocupação da mesa inconsistente. Peça ajuda à equipe.");
        serviceSessionId = session.id;
      } else {
        serviceSessionId = generatedSession.id;
        createSession = true;
      }
    }
    if (!serviceSessionId) {
      serviceSessionId = generatedSession.id;
      createSession = true;
    }

    const participantRef = doc(db, "places", placeId, "serviceSessions", serviceSessionId, "participants", user.id);
    const participant = await tx.get(participantRef);
    if (createSession) {
      tx.set(generatedSession, sessionDocument(generatedSession.id, placeId, table?.id ?? null, table ? "table" : "counter", user.id));
      if (table) tx.set(doc(db, "places", placeId, "tableOccupancies", table.id), { sessionId: serviceSessionId });
    }
    const context: QrContext = { userId: user.id, placeId, serviceSessionId, tableId: table?.id ?? null, source: "qr" };
    tx.set(contextRef, { ...context, updatedAt: serverTimestamp() });
    if (!participant.exists()) tx.set(participantRef, {
      userId: user.id, placeId, serviceSessionId, source: "customer_qr",
      joinedAt: serverTimestamp(), leftAt: null,
    });
    return context;
  });
}

function sessionDocument(id: string, placeId: string, tableId: string | null, serviceType: "table" | "counter", uid: string) {
  return { id, placeId, tableId, serviceType, status: "open", customerCount: 1,
    openedAt: serverTimestamp(), closedAt: null, openedBy: uid, closedBy: null,
    source: "customer_qr", createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
}
