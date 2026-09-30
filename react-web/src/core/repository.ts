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
import { PartnerAccessService } from "./partnerAccessService";
import { PlaceModulesService } from "./placeModulesService";
import { membershipRef } from "./placeMembershipService";
import { canCreatePlace, isPlatformAdmin } from "../shared/partnerPermissions";
import { eventDocument } from "./eventDocument";
import { validAutoCheckinSettings } from "../shared/checkIn";
import {
  canCheckIn,
  parseEvent,
  parsePlace,
  validateEvent,
  normalizeSlug,
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
      userId: user.id,
      placeId: e.data().placeId ?? null,
      source: "manual",
      sources: ["manual"],
      checkedOutAt: null,
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
  if (!u.active) return [];
  const access = await PartnerAccessService.list(u);
  if (kind === "places") return access.map((a) => a.place);
  const db = database();
  if (isPlatformAdmin(u)) {
    const result = await getDocs(collection(db, "events"));
    return result.docs.map((d) => parseEvent(d.id, d.data()));
  }
  const ids = [
    ...new Set([
      u.id,
      ...(canCreatePlace(u) && u.partnerId ? [u.partnerId] : []),
    ]),
  ];
  const results = await Promise.all([
    ...ids.flatMap((id) =>
      ["createdBy", "createdBy.id"].map((field) =>
        getDocs(query(collection(db, "events"), where(field, "==", id))),
      ),
    ),
    ...access.map((a) =>
      getDocs(
        query(collection(db, "events"), where("placeId", "==", a.place.id)),
      ),
    ),
  ]);
  const docs = new Map(results.flatMap((s) => s.docs).map((d) => [d.id, d]));
  return [...docs.values()].map((d) => parseEvent(d.id, d.data()));
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
  if (!user.active || (kind === "places" && !value.id && !canCreatePlace(user)))
    throw Error("Sem permissão para salvar.");
  if (kind === "events") {
    value = {
      ...value,
      slug:
        value.id && value.slug
          ? value.slug
          : normalizeSlug((value as Event).title),
    };
    validateEvent(value as Event);
  } else {
    const p = value as Place;
    if (
      p.autoCheckinSettings !== undefined &&
      !validAutoCheckinSettings(p.autoCheckinSettings)
    )
      throw Error("Configuração de check-in automático inválida.");
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
    throw Error(
      kind === "events"
        ? "Já existe um evento com esse título."
        : "Este slug já está em uso.",
    );
  const ref = value.id ? doc(db, kind, value.id) : doc(collection(db, kind));
  await runTransaction(db, async (tx) => {
    const old = await tx.get(ref);
    if (value.id && !old.exists()) throw Error("Registro não encontrado.");
    if (old.exists()) {
      const allowed =
        kind === "events"
          ? await PartnerAccessService.canEvent(
              user,
              parseEvent(old.id, old.data()),
              "manageEvents",
              tx,
            )
          : await PartnerAccessService.canPlace(
              user,
              parsePlace(old.id, old.data()),
              "editPlace",
              tx,
            );
      if (!allowed) throw Error("Você não pode editar este registro.");
    }
    if (kind === "events") {
      const next = value as Event;
      const previousPlace = old.exists()
        ? parseEvent(old.id, old.data()).placeId
        : null;
      if (next.placeId && next.placeId !== previousPlace)
        await PartnerAccessService.assertLink(user, next.placeId, tx);
    }
    const { id, ...payload } = value;
    void id;
    let data: Record<string, unknown> = { ...payload };
    if (kind === "events") {
      data = eventDocument(
        value as Event,
        user.id,
        old.exists() ? old.data() : undefined,
      );
    } else {
      data.id = ref.id;
      data.ownerId = old.exists()
        ? parsePlace(old.id, old.data()).ownerId
        : user.id;
      if (old.exists()) {
        data.menuSchemaVersion = old.data().menuSchemaVersion ?? 1;
        data.menuItems = old.data().menuItems ?? [];
        data.menuCategories = old.data().menuCategories ?? [];
      }
    }
    if (new TextEncoder().encode(JSON.stringify(data)).length > 950000)
      throw Error(
        "O conjunto de imagens e informações é muito grande. Reduza a capa ou o texto.",
      );
    if (old.exists()) tx.update(ref, data);
    else {
      tx.set(ref, data);
      if (kind === "places")
        tx.set(membershipRef(ref.id, user.id), {
          role: "owner",
          active: true,
          createdAt: serverTimestamp(),
        });
    }
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
    if (snap.data().menuSchemaVersion === 2)
      throw Error("Use o novo editor de cardapio.");
    const p = parsePlace(snap.id, snap.data());
    if (!(await PartnerAccessService.canPlace(user, p, "editMenu", tx)))
      throw Error("Sem permissão.");
    await PlaceModulesService.assertAvailable(placeId, "menu", tx);
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
      !(await PartnerAccessService.canEvent(
        user,
        parseEvent(e.id, e.data()),
        "transferEvents",
        tx,
      ))
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
    notificationPreferences: user.notificationPreferences,
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
