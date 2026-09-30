import {
  collection,
  doc,
  getDoc,
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
    permission: "manageEvents" | "transferEvents" = "manageEvents",
    tx?: Transaction,
  ) {
    if (!user.active) return false;
    if (isPlatformAdmin(user)) return true;
    let place: Place | null = null;
    let membership: PlaceMembership | null = null;
    if (event.placeId) {
      const ref = doc(database(), "places", event.placeId);
      const snap = await (tx ? tx.get(ref) : getDoc(ref));
      place = snap.exists() ? parsePlace(snap.id, snap.data()) : null;
      membership = await PlaceMembershipService.get(event.placeId, user.id, tx);
    }
    return allowsEvent(user, event, place, membership, permission);
  },
  async assertLink(user: User, placeId: string, tx: Transaction) {
    const snap = await tx.get(doc(database(), "places", placeId));
    if (
      !snap.exists() ||
      !(await this.canPlace(
        user,
        parsePlace(snap.id, snap.data()),
        "manageEvents",
        tx,
      ))
    )
      throw Error(
        "Sem permissão para vincular eventos a este estabelecimento.",
      );
  },
};
