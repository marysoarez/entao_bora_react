import {
  count,
  resolvePublicEntity,
  saveEntity,
  toggleBora,
  checkIn,
  watchInteractions,
} from "../../../core/repository";
import type { Event, User } from "../../../shared/models";

export const getEvent = (idOrSlug: string) =>
  resolvePublicEntity("events", idOrSlug);
export const saveEvent = (event: Event, user: User) =>
  saveEntity("events", event, user);
export const toggleEventBora = toggleBora;
export const checkIntoEvent = checkIn;
export const incrementEventMetric = count;
export const subscribeToEventInteractions = watchInteractions;
export { getEventPresenceContexts } from "../../../core/eventPresenceService";
