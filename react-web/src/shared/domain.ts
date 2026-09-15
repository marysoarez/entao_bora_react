import {
  genres,
  type Address,
  type Event,
  type Place,
  type User,
  type Genre,
} from "./models";
type Data = Record<string, any>;
export const normalizeSlug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
export const referenceId = (v: unknown): string =>
  typeof v === "string"
    ? v
    : v && typeof v === "object" && "id" in v
      ? String(v.id)
      : "";
const date = (v: any): Date =>
  v instanceof Date ? v : (v?.toDate?.() ?? new Date(0));
const music = (v: unknown): Genre[] =>
  Array.isArray(v) ? v.map((x) => (x in genres ? x : "other")) : [];
export function parseUser(id: string, d: Data): User {
  const rawLocation = d.lastKnownLocation;
  return {
    id,
    name: d.name ?? "",
    email: d.email ?? null,
    photoUrl: d.photoUrl ?? null,
    partnerId: d.partnerId ?? null,
    role: ["user", "partner", "admin"].includes(d.role) ? d.role : "user",
    active: d.active ?? true,
    isAnonymous: d.isAnonymous ?? false,
    notificationsEnabled: d.notificationsEnabled ?? false,
    locationSharingEnabled: d.locationSharingEnabled ?? false,
    lastKnownLocation:
      rawLocation &&
      typeof rawLocation.latitude === "number" &&
      typeof rawLocation.longitude === "number"
        ? {
            latitude: rawLocation.latitude,
            longitude: rawLocation.longitude,
          }
        : null,
  };
}
export function parsePlace(id: string, d: Data): Place {
  return {
    ...d,
    id,
    slug: d.slug ?? "",
    name: d.name ?? "",
    description: d.description ?? "",
    address: d.address ?? { displayName: "", latitude: 0, longitude: 0 },
    type: d.type ?? "other",
    phone: d.phone ?? "",
    instagram: d.instagram ?? "",
    website: d.website ?? "",
    photos: d.photos ?? [],
    ownerId: referenceId(d.ownerId),
    musicGenres: music(d.musicGenres),
    openingHours: d.openingHours ?? [],
    menuItems: (d.menuItems ?? []).map((x: Data) => ({
      ...x,
      price: Number(x.price) || 0,
      category: x.category || "Geral",
    })),
    menuCategories: d.menuCategories ?? [],
  } as Place;
}
export function parseEvent(id: string, d: Data): Event {
  return {
    ...d,
    id,
    slug: d.slug ?? "",
    title: d.title ?? "",
    description: d.description ?? "",
    placeId: d.placeId ?? null,
    locationName: d.locationName ?? "",
    address: d.address ?? { displayName: "", latitude: 0, longitude: 0 },
    startDate: date(d.startDate),
    endDate: date(d.endDate),
    createdAt: date(d.createdAt),
    updatedAt: date(d.updatedAt),
    coverImage: d.coverImage ?? "",
    gallery: d.gallery ?? [],
    musicGenres: music(d.musicGenres),
    attractions: d.attractions ?? [],
    ticket: d.ticket ?? { type: "free", ticketUrl: null },
    instagram: d.instagram ?? null,
    createdBy: referenceId(d.createdBy),
    status: ["draft", "published", "cancelled", "finished", "hidden"].includes(
      d.status,
    )
      ? d.status
      : "draft",
    boraCount: d.boraCount ?? 0,
    checkinCount: d.checkinCount ?? 0,
    views: d.views ?? 0,
    shares: d.shares ?? 0,
  } as Event;
}
export function distanceInMeters(
  a: Pick<Address, "latitude" | "longitude">,
  b: Pick<Address, "latitude" | "longitude">,
) {
  const r = Math.PI / 180;
  const h =
    Math.sin(((b.latitude - a.latitude) * r) / 2) ** 2 +
    Math.cos(a.latitude * r) *
      Math.cos(b.latitude * r) *
      Math.sin(((b.longitude - a.longitude) * r) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export function canCheckIn(
  event: Event,
  position: Pick<Address, "latitude" | "longitude">,
  now = new Date(),
) {
  return (
    event.status === "published" &&
    now >= event.startDate &&
    now <= event.endDate &&
    distanceInMeters(position, event.address) <= 100
  );
}
export const isPartner = (u: User | null) =>
  !!u?.active && u.role === "partner";
export const canManage = (u: User | null, owner: string) =>
  !!u?.active &&
  (owner === u.id || (isPartner(u) && !!u.partnerId && owner === u.partnerId));
export const imageSource = (s: string) =>
  !s
    ? ""
    : /^(https?:\/\/|data:image\/)/.test(s)
      ? s
      : `data:image/jpeg;base64,${s}`;
export const safeUrl = (s: string | null | undefined) => {
  try {
    const u = new URL(s ?? "");
    return ["http:", "https:"].includes(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
};
export const currency = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const formatDate = (d: Date) =>
  d.toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" });
export const locate = () =>
  new Promise<GeolocationCoordinates>((resolve, reject) =>
    navigator.geolocation
      ? navigator.geolocation.getCurrentPosition(
          (p) => resolve(p.coords),
          () =>
            reject(
              new Error(
                "Não foi possível obter sua localização. Confira a permissão do navegador.",
              ),
            ),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
        )
      : reject(new Error("Localização indisponível.")),
  );
export function validateEvent(e: Event) {
  if (
    !e.title.trim() ||
    !e.description.trim() ||
    !e.coverImage ||
    !e.address.displayName ||
    !e.slug
  )
    throw Error("Preencha título, descrição, capa, endereço e slug.");
  if (
    !Number.isFinite(+e.startDate) ||
    !Number.isFinite(+e.endDate) ||
    e.endDate <= e.startDate
  )
    throw Error("O término deve ser posterior ao início.");
  if (e.ticket.type === "external" && !safeUrl(e.ticket.ticketUrl))
    throw Error("Informe um link HTTP ou HTTPS para o ingresso.");
}
