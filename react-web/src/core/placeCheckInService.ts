import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { assertProductWritesEnabled, database } from "./firebase";
import { mergeCheckInSources, type CheckInSource } from "../shared/checkIn";

/** Presence only. No event attendance, table, order or service session is created. */
export async function checkIntoPlace(placeId: string, userId: string, source: CheckInSource) {
  assertProductWritesEnabled("Check-in");
  if (!placeId || !userId || placeId.includes("/") || userId.includes("/"))
    throw Error("Estabelecimento e usuário são obrigatórios.");
  mergeCheckInSources([], source);
  if (source === "geofence") throw Error("Check-in automático aguarda implementação mobile autorizada.");
  const db = database();
  const ref = doc(db, "places", placeId, "checkins", userId);
  return runTransaction(db, async tx => {
    const [place, snapshot] = await Promise.all([
      tx.get(doc(db, "places", placeId)), tx.get(ref),
    ]);
    if (!place.exists()) throw Error("Estabelecimento não encontrado.");
    if (snapshot.exists()) {
      const current = snapshot.data();
      // Closing/reopening and history belong to the future checkout lifecycle.
      if (current.checkedOutAt !== null) throw Error("Reabertura de presença ainda não disponível.");
      if (current.userId !== userId || current.placeId !== placeId) throw Error("Check-in inconsistente.");
      const sources = mergeCheckInSources(current.sources ?? [current.source], source);
      if (sources.length !== (current.sources ?? [current.source]).length)
        tx.update(ref, { sources });
      return { id: ref.id, reused: true };
    }
    tx.set(ref, {
      userId, placeId, source, sources: [source],
      checkedInAt: serverTimestamp(), checkedOutAt: null,
    });
    return { id: ref.id, reused: false };
  });
}
