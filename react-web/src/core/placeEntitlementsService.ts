import { doc, getDoc, onSnapshot, type Transaction } from "firebase/firestore";
import { database } from "./firebase";
import {
  parsePlaceEntitlements,
  type PlaceEntitlements,
} from "../shared/placeEntitlements";

export const entitlementsRef = (placeId: string) =>
  doc(database(), "places", placeId, "settings", "entitlements");

export const PlaceEntitlementsService = {
  async get(placeId: string, tx?: Transaction): Promise<PlaceEntitlements> {
    const ref = entitlementsRef(placeId);
    const snapshot = await (tx ? tx.get(ref) : getDoc(ref));
    return parsePlaceEntitlements(
      snapshot.exists() ? snapshot.data() : undefined,
    );
  },
  watch(
    placeId: string,
    onChange: (value: PlaceEntitlements) => void,
    onError: (error: Error) => void,
  ) {
    return onSnapshot(
      entitlementsRef(placeId),
      (snapshot) => {
        try {
          onChange(
            parsePlaceEntitlements(
              snapshot.exists() ? snapshot.data() : undefined,
            ),
          );
        } catch (cause) {
          onError(cause as Error);
        }
      },
      onError,
    );
  },
};
