import type { Event, Place, User } from "./models";

export type PlaceMemberRole = "owner" | "manager" | "employee";
export interface PlaceMembership {
  uid: string;
  placeId: string;
  role: PlaceMemberRole;
  active: boolean;
  createdAt: Date | null;
}
export type PartnerPermission =
  | "view"
  | "editPlace"
  | "editMenu"
  | "manageEvents"
  | "transferEvents"
  | "manageModules"
  | "manageServiceSessions"
  | "manageOrders"
  | "manageTables"
  | "manageInventory"
  | "managePurchases"
  | "manageCampaigns"
  | "manageMembers";
export const PartnerPermissions: Record<
  PlaceMemberRole,
  readonly PartnerPermission[]
> = {
  owner: [
    "view",
    "editPlace",
    "editMenu",
    "manageEvents",
    "transferEvents",
    "manageModules",
    "manageServiceSessions",
    "manageOrders",
    "manageTables",
    "manageInventory",
    "managePurchases",
    "manageCampaigns",
    "manageMembers",
  ],
  manager: [
    "view",
    "editPlace",
    "editMenu",
    "manageEvents",
    "manageTables",
    "manageInventory",
    "managePurchases",
    "manageServiceSessions",
    "manageOrders",
  ],
  employee: ["view"],
};
export const isPlatformAdmin = (user: User | null) =>
  !!user?.active && user.role === "admin";
export const canCreatePlace = (user: User | null) =>
  !!user?.active && (user.role === "partner" || isPlatformAdmin(user));
export function legacyResponsible(user: User | null, ownerId: string) {
  return (
    !!user?.active &&
    !!ownerId &&
    (ownerId === user.id ||
      (user.role === "partner" &&
        !!user.partnerId &&
        ownerId === user.partnerId))
  );
}
// An explicit inactive/invalid membership must never fall back to legacy ownership.
export function placeRole(
  user: User | null,
  place: Pick<Place, "id" | "ownerId">,
  membership: PlaceMembership | null,
): PlaceMemberRole | null {
  if (!user?.active) return null;
  if (isPlatformAdmin(user)) return "owner";
  if (membership)
    return membership.active &&
      membership.uid === user.id &&
      membership.placeId === place.id
      ? membership.role
      : null;
  return legacyResponsible(user, place.ownerId) ? "owner" : null;
}
export function allowsPlace(
  user: User | null,
  place: Pick<Place, "id" | "ownerId">,
  membership: PlaceMembership | null,
  permission: PartnerPermission,
) {
  const role = placeRole(user, place, membership);
  return !!role && PartnerPermissions[role].includes(permission);
}
export function allowsEvent(
  user: User | null,
  event: Pick<Event, "createdBy" | "placeId">,
  place: Place | null,
  membership: PlaceMembership | null,
  permission: "manageEvents" | "transferEvents" = "manageEvents",
) {
  if (!user?.active) return false;
  if (isPlatformAdmin(user)) return true;
  if (place && allowsPlace(user, place, membership, permission)) return true;
  if (membership) return false;
  return (
    legacyResponsible(user, event.createdBy) &&
    (permission === "manageEvents" || canCreatePlace(user))
  );
}
