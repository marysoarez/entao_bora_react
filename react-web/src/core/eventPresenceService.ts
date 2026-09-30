import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { database } from "./firebase";
import { checkInSources, type CheckIn } from "../shared/checkIn";
import { parseEvent } from "../shared/domain";
import { eventPresenceContexts, type EventPresenceContext } from "../shared/eventPresence";

/** Uses existing access rules: own presence or authorized place staff, never public lists. */
export async function getEventPresenceContexts(
  placeId: string, userId: string, now = new Date(),
): Promise<EventPresenceContext[]> {
  if (!placeId || !userId || placeId.includes("/") || userId.includes("/"))
    throw Error("Estabelecimento e usuário são obrigatórios.");
  const db = database();
  const snapshot = await getDoc(doc(db, "places", placeId, "checkins", userId));
  if (!snapshot.exists()) return [];
  const data = snapshot.data();
  const checkedInAt = data.checkedInAt?.toDate?.();
  if (data.userId !== userId || data.placeId !== placeId || data.checkedOutAt !== null ||
      !(checkedInAt instanceof Date) || !Number.isFinite(checkedInAt.getTime()) ||
      checkedInAt > now || !checkInSources.includes(data.source)) return [];
  // Single-field query needs no new composite index. No Event documents are written.
  const events = await getDocs(query(collection(db, "events"), where("placeId", "==", placeId)));
  return eventPresenceContexts({ ...data, checkedInAt } as CheckIn,
    events.docs.map(event => parseEvent(event.id, event.data())), now);
}
