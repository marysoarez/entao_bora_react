import type { Event, User } from "./models";

// Event authorship is independent of platform roles and place memberships.
// User.id is the Firebase UID; parseEvent normalizes legacy createdBy.id values.
export function canEditEvent(
  user: User | null,
  event: Pick<Event, "createdBy">,
) {
  return !!user?.id && event.createdBy === user.id;
}
