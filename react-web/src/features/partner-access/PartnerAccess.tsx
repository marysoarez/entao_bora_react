import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { database } from "../../core/firebase";
import {
  membershipRef,
  parseMembership,
} from "../../core/placeMembershipService";
import type { PlaceAccess } from "../../core/partnerAccessService";
import { parsePlace } from "../../shared/domain";
import {
  allowsEvent,
  allowsPlace,
  canCreatePlace,
  isPlatformAdmin,
  type PartnerPermission,
} from "../../shared/partnerPermissions";
import type { Event } from "../../shared/models";
import { useSession } from "../session";

const Context = createContext({
  loading: true,
  error: "",
  canEnter: false,
  canCreate: false,
  places: [] as PlaceAccess[],
  can: (_placeId: string, _permission: PartnerPermission): boolean => false,
  canEvent: (
    _event: Event,
    _permission?: "manageEvents" | "transferEvents",
  ): boolean => false,
});
export const usePartnerAccess = () => useContext(Context);
export function PartnerAccessProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const [state, setState] = useState<{
    user: typeof user;
    entries: PlaceAccess[];
    loading: boolean;
    error: string;
  }>({ user: null, entries: [], loading: true, error: "" });
  useEffect(() => {
    if (!user?.active) return;
    let generation = 0;
    let stops: (() => void)[] = [];
    const stop = onSnapshot(
      collection(database(), "places"),
      (snapshot) => {
        const current = ++generation;
        stops.forEach((unsubscribe) => unsubscribe());
        const entries = snapshot.docs.map(
          (s) =>
            ({
              place: parsePlace(s.id, s.data()),
              membership: null,
            }) as PlaceAccess,
        );
        const pending = new Set(entries.map((e) => e.place.id));
        const publish = () => {
          if (current === generation && !pending.size)
            setState({
              user,
              entries: [...entries],
              loading: false,
              error: "",
            });
        };
        setState({ user, entries: [], loading: true, error: "" });
        if (isPlatformAdmin(user)) {
          pending.clear();
          publish();
          return;
        }
        stops = entries.map((entry, index) =>
          onSnapshot(
            membershipRef(entry.place.id, user.id),
            (snap) => {
              entries[index] = {
                ...entry,
                membership: snap.exists()
                  ? parseMembership(entry.place.id, user.id, snap.data())
                  : null,
              };
              pending.delete(entry.place.id);
              publish();
            },
            (cause) => {
              if (current === generation) {
                ++generation;
                setState({
                  user,
                  entries: [],
                  loading: false,
                  error: cause.message,
                });
              }
            },
          ),
        );
        publish();
      },
      (cause) => {
        ++generation;
        setState({ user, entries: [], loading: false, error: cause.message });
      },
    );
    return () => {
      ++generation;
      stop();
      stops.forEach((unsubscribe) => unsubscribe());
    };
  }, [user]);
  const current = state.user === user && !!user?.active;
  const entries = current ? state.entries : [];
  const loading = !!user?.active && (!current || state.loading);
  const error = current ? state.error : "";
  const places = entries.filter((e) =>
    allowsPlace(user, e.place, e.membership, "view"),
  );
  const ready = !loading && !error;
  return (
    <Context.Provider
      value={{
        loading,
        error,
        places,
        canCreate: canCreatePlace(user),
        canEnter:
          ready &&
          !!user?.active &&
          (canCreatePlace(user) || places.length > 0),
        can: (id, permission) => {
          const entry = entries.find((e) => e.place.id === id);
          return (
            ready &&
            !!entry &&
            allowsPlace(user, entry.place, entry.membership, permission)
          );
        },
        canEvent: (event, permission = "manageEvents") => {
          const entry = entries.find((e) => e.place.id === event.placeId);
          return (
            ready &&
            allowsEvent(
              user,
              event,
              entry?.place ?? null,
              entry?.membership ?? null,
              permission,
            )
          );
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
