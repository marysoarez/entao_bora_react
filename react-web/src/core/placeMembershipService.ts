import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  type Transaction,
} from "firebase/firestore";
import { assertProductWritesEnabled, database } from "./firebase";
import { parsePlace } from "../shared/domain";
import {
  allowsPlace,
  type PlaceMembership,
  type PlaceMemberRole,
} from "../shared/partnerPermissions";
import type { User } from "../shared/models";

export function parseMembership(
  placeId: string,
  uid: string,
  data: Record<string, unknown>,
): PlaceMembership {
  const valid =
    data.role === "owner" ||
    data.role === "manager" ||
    data.role === "employee";
  const timestamp = data.createdAt as { toDate?: () => Date } | undefined;
  return {
    placeId,
    uid,
    role: valid ? (data.role as PlaceMemberRole) : "employee",
    active: valid && data.active === true,
    createdAt: timestamp?.toDate?.() ?? null,
  };
}
export const membershipRef = (placeId: string, uid: string) =>
  doc(database(), "places", placeId, "members", uid);
export const PlaceMembershipService = {
  async get(placeId: string, uid: string, tx?: Transaction) {
    const ref = membershipRef(placeId, uid);
    const snap = await (tx ? tx.get(ref) : getDoc(ref));
    return snap.exists() ? parseMembership(placeId, uid, snap.data()) : null;
  },
  async list(placeId: string, user: User) {
    const place = await getDoc(doc(database(), "places", placeId));
    if (
      !place.exists() ||
      !allowsPlace(
        user,
        parsePlace(place.id, place.data()),
        await this.get(placeId, user.id),
        "manageMembers",
      )
    )
      throw Error("Sem permissão para gerenciar membros.");
    const result = await getDocs(
      collection(database(), "places", placeId, "members"),
    );
    return result.docs.map((s) => parseMembership(placeId, s.id, s.data()));
  },
  async save(
    placeId: string,
    uid: string,
    role: PlaceMemberRole,
    active: boolean,
    user: User,
  ) {
    assertProductWritesEnabled("Gestão de membros");
    if (
      !uid.trim() ||
      uid.includes("/") ||
      !["owner", "manager", "employee"].includes(role) ||
      typeof active !== "boolean"
    )
      throw Error("Membro inválido.");
    const db = database();
    await runTransaction(db, async (tx) => {
      const [place, actor, targetUser, current] = await Promise.all([
        tx.get(doc(db, "places", placeId)),
        this.get(placeId, user.id, tx),
        tx.get(doc(db, "users", uid)),
        tx.get(membershipRef(placeId, uid)),
      ]);
      if (
        !place.exists() ||
        !allowsPlace(
          user,
          parsePlace(place.id, place.data()),
          actor,
          "manageMembers",
        )
      )
        throw Error("Sem permissão para gerenciar membros.");
      if (!targetUser.exists()) throw Error("Usuário não encontrado.");
      // Keep the canonical owner as a recovery anchor; ownership transfer is a separate operation.
      if (
        parsePlace(place.id, place.data()).ownerId === uid &&
        (role !== "owner" || !active)
      )
        throw Error(
          "O proprietário principal deve permanecer ativo como owner.",
        );
      if (uid === user.id && (role !== "owner" || !active))
        throw Error(
          "Não é possível remover seu próprio acesso de administração.",
        );
      tx.set(membershipRef(placeId, uid), {
        role,
        active,
        createdAt: current.exists()
          ? current.data().createdAt
          : serverTimestamp(),
      });
    });
  },
};
