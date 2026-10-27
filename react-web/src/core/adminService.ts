import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { database, functions } from "./firebase";
import { parsePlace, parseUser } from "../shared/domain";
import { parseMembership } from "./placeMembershipService";
import {
  parsePlaceEntitlements,
  type EntitlementStatus,
  type PaidFeature,
  type PlaceEntitlements,
} from "../shared/placeEntitlements";
import { parsePlaceModules, type PlaceModules } from "../shared/placeModules";
import type { Place, User, UserRole } from "../shared/models";
import type { PlaceMembership } from "../shared/partnerPermissions";

export interface AdminPlace extends Place {
  active: boolean;
  entitlementExists: boolean;
  members: PlaceMembership[];
  entitlements: PlaceEntitlements;
  modules: PlaceModules;
}

function callable<TInput, TOutput>(name: string) {
  if (!functions)
    throw Error("Configure o Firebase para usar a administração.");
  return httpsCallable<TInput, TOutput>(functions, name);
}

export const AdminService = {
  async listUsers(): Promise<User[]> {
    const result = await getDocs(collection(database(), "users"));
    return result.docs.map((item) => parseUser(item.id, item.data()));
  },
  async listPlaces(): Promise<AdminPlace[]> {
    const db = database();
    const result = await getDocs(collection(db, "places"));
    return Promise.all(
      result.docs.map(async (item) => {
        const place = parsePlace(item.id, item.data());
        const [members, entitlement, modules] = await Promise.all([
          getDocs(collection(db, "places", item.id, "members")),
          getDoc(doc(db, "places", item.id, "settings", "entitlements")),
          getDoc(doc(db, "places", item.id, "settings", "modules")),
        ]);
        return {
          ...place,
          active: item.data().active !== false,
          entitlementExists: entitlement.exists(),
          members: members.docs.map((member) =>
            parseMembership(item.id, member.id, member.data()),
          ),
          entitlements: parsePlaceEntitlements(
            entitlement.exists() ? entitlement.data() : undefined,
          ),
          modules: parsePlaceModules(
            modules.exists() ? modules.data() : undefined,
          ),
        };
      }),
    );
  },
  async updateEntitlements(
    placeId: string,
    value: {
      planKey: string;
      status: EntitlementStatus;
      validUntil: string | null;
      features: Record<PaidFeature, boolean>;
    },
  ) {
    await callable<typeof value & { placeId: string }, unknown>(
      "adminUpdatePlaceEntitlements",
    )({ placeId, ...value });
  },
  async updateUser(
    uid: string,
    active: boolean,
    role: UserRole,
    confirmation: string,
  ) {
    await callable<
      { uid: string; active: boolean; role: UserRole; confirmation: string },
      unknown
    >("adminUpdateUser")({ uid, active, role, confirmation });
  },
};
