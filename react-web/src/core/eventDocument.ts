import { Timestamp } from "firebase/firestore";
import { normalizeSlug, referenceId } from "../shared/domain";
import type { Event } from "../shared/models";

// Explicit fields keep legacy/user-interaction properties out of Firestore writes.
export function eventDocument(
  e: Event,
  userId: string,
  old?: Record<string, any>,
) {
  const now = Timestamp.now();
  const a = e.address;
  return {
    title: e.title.trim(),
    slug: old?.slug || normalizeSlug(e.title),
    description: e.description.trim(),
    placeId: e.placeId || null,
    locationName: e.placeId ? e.locationName : a.displayName,
    address: {
      displayName: a.displayName,
      latitude: a.latitude,
      longitude: a.longitude,
      street: a.street ?? null,
      number: a.number?.trim() || null,
      complement: a.complement?.trim() || null,
      neighborhood: a.neighborhood ?? null,
      city: a.city ?? null,
      state: a.state ?? null,
      country: a.country ?? null,
      postalCode: a.postalCode ?? null,
    },
    startDate: Timestamp.fromDate(e.startDate),
    endDate: Timestamp.fromDate(e.endDate),
    coverImage: e.coverImage.replace(/^data:image\/[^;]+;base64,/, ""),
    gallery: old ? e.gallery : [],
    musicGenres: e.musicGenres,
    attractions: old
      ? e.attractions.map((a) => ({
          id: a.id,
          name: a.name,
          instagram: a.instagram ?? null,
          image: a.image ?? null,
          isHeadliner: a.isHeadliner,
        }))
      : [],
    ticket: {
      type: e.ticket.type,
      ticketUrl: e.ticket.type === "free" ? null : e.ticket.ticketUrl,
    },
    instagram: e.instagram?.trim() || null,
    createdBy: old ? referenceId(old.createdBy) : userId,
    createdAt: old ? old.createdAt : now,
    updatedAt: now,
    status: old ? (old.status ?? "draft") : "published",
    boraCount: old?.boraCount ?? 0,
    checkinCount: old?.checkinCount ?? 0,
    views: old?.views ?? 0,
    shares: old?.shares ?? 0,
    featured: e.featured === true,
  };
}
