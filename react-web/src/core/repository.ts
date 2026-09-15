import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  onSnapshot,
  orderBy,
  runTransaction,
  Timestamp,
  updateDoc,
  increment,
  serverTimestamp,
  GeoPoint,
} from "firebase/firestore";
import { assertProductWritesEnabled, database } from "./firebase";
import {
  canCheckIn,
  canManage,
  isPartner,
  parseEvent,
  parsePlace,
  validateEvent,
} from "../shared/domain";
import type { Event, Place, User, MenuItem } from "../shared/models";
export async function resolvePublicEntity(
  kind: "events",
  value: string,
): Promise<Event | null>;
export async function resolvePublicEntity(
  kind: "places",
  value: string,
): Promise<Place | null>;
export async function resolvePublicEntity(
  kind: "events" | "places",
  value: string,
): Promise<Event | Place | null> {
  const db = database();
  let snap = await getDoc(doc(db, kind, value));
  if (!snap.exists()) {
    const result = await getDocs(
      query(collection(db, kind), where("slug", "==", value), limit(1)),
    );
    if (result.empty) return null;
    snap = result.docs[0];
  }
  return kind === "events"
    ? parseEvent(snap.id, snap.data()!)
    : parsePlace(snap.id, snap.data()!);
}
export function watchPublic(
  onPlaces: (p: Place[]) => void,
  onEvents: (e: Event[]) => void,
  onError: (e: Error) => void,
) {
  const db = database();
  const a = onSnapshot(
    collection(db, "places"),
    (s) => onPlaces(s.docs.map((d) => parsePlace(d.id, d.data()))),
    onError,
  );
  let b = () => {};
  const renew = () => {
    b();
    b = onSnapshot(
      query(
        collection(db, "events"),
        where("status", "==", "published"),
        where("endDate", ">=", Timestamp.now()),
        orderBy("endDate"),
      ),
      (s) => onEvents(s.docs.map((d) => parseEvent(d.id, d.data()))),
      onError,
    );
  };
  renew();
  const timer = setInterval(renew, 60000);
  return () => {
    a();
    b();
    clearInterval(timer);
  };
}
export function watchInteractions(
  id: string,
  u: User,
  onChange: (kind: "bora" | "checkin", value: boolean) => void,
  onError: (e: Error) => void,
) {
  const db = database();
  const a = onSnapshot(
    doc(db, "events", id, "boras", u.id),
    (s) => onChange("bora", s.exists()),
    onError,
  );
  const b = onSnapshot(
    doc(db, "events", id, "checkins", u.id),
    (s) => onChange("checkin", s.exists()),
    onError,
  );
  return () => {
    a();
    b();
  };
}
export async function toggleBora(id: string, user: User) {
  assertProductWritesEnabled("Bora");
  if (!user.active) throw Error("Conta inativa.");
  const db = database(),
    event = doc(db, "events", id),
    ref = doc(event, "boras", user.id);
  return runTransaction(db, async (tx) => {
    const [e, b] = await Promise.all([tx.get(event), tx.get(ref)]);
    if (!e.exists()) throw Error("Evento não encontrado.");
    if (b.exists()) tx.delete(ref);
    else
      tx.set(ref, {
        eventId: id,
        user: userSnapshot(user),
        createdAt: serverTimestamp(),
      });
    tx.update(event, {
      boraCount: Math.max(0, (e.data().boraCount ?? 0) + (b.exists() ? -1 : 1)),
    });
    return !b.exists();
  });
}
export async function checkIn(
  id: string,
  user: User,
  position: { latitude: number; longitude: number },
) {
  assertProductWritesEnabled("Check-in");
  if (!user.active) throw Error("Conta inativa.");
  const db = database(),
    event = doc(db, "events", id),
    ref = doc(event, "checkins", user.id);
  await runTransaction(db, async (tx) => {
    const [e, c] = await Promise.all([tx.get(event), tx.get(ref)]);
    if (c.exists()) return;
    if (!e.exists() || !canCheckIn(parseEvent(id, e.data()), position))
      throw Error("O check-in é permitido durante o evento, a até 100 metros.");
    tx.set(ref, {
      eventId: id,
      user: userSnapshot(user),
      checkedInAt: serverTimestamp(),
      ...position,
    });
    tx.update(event, { checkinCount: increment(1) });
  });
}
export async function count(id: string, field: "views" | "shares") {
  assertProductWritesEnabled(
    field === "views"
      ? "Contagem de visualizações"
      : "Contagem de compartilhamentos",
  );
  await updateDoc(doc(database(), "events", id), { [field]: increment(1) });
}
export async function owned(kind: "events", u: User): Promise<Event[]>;
export async function owned(kind: "places", u: User): Promise<Place[]>;
export async function owned(
  kind: "events" | "places",
  u: User,
): Promise<(Event | Place)[]> {
  const db = database(),
    field = kind === "events" ? "createdBy" : "ownerId";
  const ids = [...new Set([u.id, ...(u.partnerId ? [u.partnerId] : [])])];
  const results = await Promise.all(
    ids.flatMap((id) =>
      [field, `${field}.id`].map((f) =>
        getDocs(query(collection(db, kind), where(f, "==", id))),
      ),
    ),
  );
  const docs = new Map(results.flatMap((s) => s.docs).map((d) => [d.id, d]));
  return [...docs.values()].map((d) =>
    kind === "events" ? parseEvent(d.id, d.data()) : parsePlace(d.id, d.data()),
  );
}
export async function saveEntity(
  kind: "events" | "places",
  value: Event | Place,
  user: User,
) {
  assertProductWritesEnabled(
    kind === "events" ? "Gravação de evento" : "Gravação de estabelecimento",
  );
  const db = database();
  if (!user.active || (kind === "places" && !isPartner(user)))
    throw Error("Sem permissão para salvar.");
  if (kind === "events") validateEvent(value as Event);
  else {
    const p = value as Place;
    if (
      !p.name.trim() ||
      !p.description.trim() ||
      !p.address.displayName ||
      !p.musicGenres.length ||
      !p.slug
    )
      throw Error(
        "Preencha nome, descrição, endereço, slug e ao menos um gênero.",
      );
  }
  const existing = await getDocs(
    query(collection(db, kind), where("slug", "==", value.slug), limit(2)),
  );
  if (existing.docs.some((d) => d.id !== value.id))
    throw Error("Este slug já está em uso.");
  const ref = value.id ? doc(db, kind, value.id) : doc(collection(db, kind));
  await runTransaction(db, async (tx) => {
    const old = await tx.get(ref);
    if (
      old.exists() &&
      !canManage(
        user,
        kind === "events"
          ? parseEvent(old.id, old.data()).createdBy
          : parsePlace(old.id, old.data()).ownerId,
      )
    )
      throw Error("Você não pode editar este registro.");
    const { id, ...payload } = value;
    void id;
    const data: Record<string, unknown> = { ...payload };
    if (kind === "events") {
      const e = value as Event;
      Object.assign(data, {
        startDate: Timestamp.fromDate(e.startDate),
        endDate: Timestamp.fromDate(e.endDate),
        updatedAt: serverTimestamp(),
        createdAt: old.exists() ? old.data().createdAt : serverTimestamp(),
        createdBy: old.exists() ? old.data().createdBy : user.id,
        status: old.exists() ? (old.data().status ?? "draft") : "published",
        ...Object.fromEntries(
          ["views", "shares", "boraCount", "checkinCount"].map((k) => [
            k,
            old.exists() ? (old.data()[k] ?? 0) : 0,
          ]),
        ),
      });
    } else {
      data.id = ref.id;
      data.ownerId = old.exists()
        ? parsePlace(old.id, old.data()).ownerId
        : user.id;
      if (old.exists()) {
        data.menuItems = old.data().menuItems ?? [];
        data.menuCategories = old.data().menuCategories ?? [];
      }
    }
    if (new TextEncoder().encode(JSON.stringify(data)).length > 950000)
      throw Error(
        "O conjunto de imagens e informa??es ? muito grande. Reduza as imagens.",
      );
    tx.set(ref, data);
  });
  return ref.id;
}
export async function editMenu(
  placeId: string,
  user: User,
  change: (
    items: MenuItem[],
    categories: string[],
  ) => { menuItems: MenuItem[]; menuCategories: string[] },
) {
  assertProductWritesEnabled("Atualização de cardápio");
  const db = database(),
    ref = doc(db, "places", placeId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw Error("Local não encontrado.");
    const p = parsePlace(snap.id, snap.data());
    if (!isPartner(user) || !canManage(user, p.ownerId))
      throw Error("Sem permissão.");
    const next = change(p.menuItems, p.menuCategories);
    if (
      new TextEncoder().encode(JSON.stringify({ ...snap.data(), ...next }))
        .length > 950000
    )
      throw Error("Card?pio muito grande. Reduza as imagens.");
    tx.update(ref, next);
  });
}
export async function transferEvent(id: string, targetId: string, user: User) {
  assertProductWritesEnabled("Transferência de evento");
  const db = database(),
    ref = doc(db, "events", id);
  await runTransaction(db, async (tx) => {
    const [e, u] = await Promise.all([
      tx.get(ref),
      tx.get(doc(db, "users", targetId)),
    ]);
    if (
      !e.exists() ||
      !isPartner(user) ||
      !canManage(user, parseEvent(e.id, e.data()).createdBy)
    )
      throw Error("Sem permissão.");
    if (!u.exists()) throw Error("Usuário de destino não encontrado.");
    tx.update(ref, { createdBy: targetId, updatedAt: serverTimestamp() });
  });
}
export async function activity(user: User) {
  const db = database();
  const result = await Promise.all(
    ["boras", "checkins"].map((kind) =>
      getDocs(
        query(collectionGroup(db, kind), where("user.id", "==", user.id)),
      ),
    ),
  );
  const ids = [
    ...new Set(
      result.flatMap((s) => s.docs.map((d) => d.data().eventId as string)),
    ),
  ];
  return (await Promise.all(ids.map((id) => resolvePublicEntity("events", id))))
    .filter((e): e is Event => !!e)
    .sort((a, b) => +b.startDate - +a.startDate);
}

export async function listPlaces(): Promise<Place[]> {
  const result = await getDocs(collection(database(), "places"));
  return result.docs.map((d) => parsePlace(d.id, d.data()));
}

function userSnapshot(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    photoUrl: user.photoUrl,
    isAnonymous: user.isAnonymous,
    role: user.role,
    partnerId: user.partnerId,
    active: user.active,
    notificationsEnabled: user.notificationsEnabled,
    locationSharingEnabled: user.locationSharingEnabled,
    ...(user.lastKnownLocation
      ? {
          lastKnownLocation: new GeoPoint(
            user.lastKnownLocation.latitude,
            user.lastKnownLocation.longitude,
          ),
        }
      : {}),
  };
}
