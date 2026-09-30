import type { CheckIn } from "./checkIn";
import type { Event } from "./models";

export interface EventPresenceContext {
  userId: string;
  placeId: string;
  eventId: string;
  checkedInAt: Date;
  source: CheckIn["source"];
  /** Local and time correlation is not proof of event participation. */
  participation: "unconfirmed";
}

/** Conservative current context: old open visits cannot roll into later events. */
export function eventPresenceContexts(
  checkIn: CheckIn,
  events: readonly Event[],
  now = new Date(),
): EventPresenceContext[] {
  const arrival = checkIn.checkedInAt.getTime();
  const time = now.getTime();
  if (!checkIn.userId || !checkIn.placeId || checkIn.checkedOutAt !== null ||
      !Number.isFinite(arrival) || !Number.isFinite(time) || arrival > time) return [];
  const seen = new Set<string>();
  return events.filter(event => {
    const start = event.startDate.getTime();
    const end = event.endDate.getTime();
    if (!event.id || seen.has(event.id) || event.placeId !== checkIn.placeId ||
        event.status !== "published" || !Number.isFinite(start) || !Number.isFinite(end) ||
        start >= end || arrival < start || time >= end) return false;
    seen.add(event.id);
    return true;
  }).map(event => ({
    userId: checkIn.userId, placeId: checkIn.placeId, eventId: event.id,
    checkedInAt: checkIn.checkedInAt, source: checkIn.source, participation: "unconfirmed",
  }));
}
