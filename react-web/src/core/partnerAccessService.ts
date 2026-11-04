import {
  collection,
  getDocs,
  type Transaction,
} from "firebase/firestore";
import { database } from "./firebase";
import { PlaceMembershipService } from "./placeMembershipService";
import { parsePlace } from "../shared/domain";
import {
  allowsEvent,
  allowsPlace,
  isPlatformAdmin,
  type PartnerPermission,
  type PlaceMembership,
} from "../shared/partnerPermissions";
import type { Event, Place, User } from "../shared/models";

export interface PlaceAccess {
  place: Place;
  membership: PlaceMembership | null;
}
export const PartnerAccessService = {
  async list(user: User): Promise<PlaceAccess[]> {
    if (!user.active) return [];
    // Places are already public. Direct self-membership reads avoid a new collection-group schema/index.
    const result = await getDocs(collection(database(), "places"));
    const access = await Promise.all(
      result.docs.map(async (snap) => ({
        place: parsePlace(snap.id, snap.data()),
        membership: isPlatformAdmin(user)
          ? null
          : await PlaceMembershipService.get(snap.id, user.id),
      })),
    );
    return access.filter((a) =>
      allowsPlace(user, a.place, a.membership, "view"),
    );
  },
  async canPlace(
    user: User,
    place: Place,
    permission: PartnerPermission,
    tx?: Transaction,
  ) {
    if (!user.active) return false;
    if (isPlatformAdmin(user)) return true;
    return allowsPlace(
      user,
      place,
      await PlaceMembershipService.get(place.id, user.id, tx),
      permission,
    );
  },
  async canEvent(
    user: User,
    event: Event,
  ) {
    return allowsEvent(user, event);
  },
};
