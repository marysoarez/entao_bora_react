import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { auth, database, firebaseApp } from "../core/firebase";
import { parseUser } from "../shared/domain";
import type { User } from "../shared/models";
const Context = createContext<{
  user: User | null;
  loading: boolean;
  error: string;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}>({
  user: null,
  loading: true,
  error: "",
  login: async () => {},
  logout: async () => {},
});
export const useSession = () => useContext(Context);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(!!auth),
    [error, setError] = useState("");
  useEffect(() => {
    if (!auth) return;
    let stop = () => {};
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      stop();
      setUser(null);
      setError("");
      setLoading(!!u);
      if (!u) return;
      stop = onSnapshot(
        doc(database(), "users", u.uid),
        (s) => {
          setUser(s.exists() ? parseUser(s.id, s.data()) : null);
          setLoading(false);
        },
        (e) => {
          setError(e.message);
          setLoading(false);
        },
      );
    });
    return () => {
      stop();
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!user || !firebaseApp) return;
    let cancelled = false,
      unsubscribe = () => {};
    import("firebase/messaging")
      .then(async (messaging) => {
        if (!(await messaging.isSupported()) || cancelled) return;
        unsubscribe = messaging.onMessage(
          messaging.getMessaging(firebaseApp!),
          (payload) => {
            window.dispatchEvent(
              new CustomEvent("bora-notification", {
                detail:
                  payload.notification?.title ??
                  "Voc? recebeu uma novidade do Ent?o Bora.",
              }),
            );
          },
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user?.id]);
  async function login() {
    if (!auth)
      throw Error("O login estará disponível após configurar o Firebase.");
    const result = await signInWithPopup(auth, new GoogleAuthProvider());
    const u = result.user,
      ref = doc(database(), "users", u.uid);
    await runTransaction(database(), async (tx) => {
      const snap = await tx.get(ref);
      const profile = {
        id: u.uid,
        name: u.displayName ?? "",
        email: u.email,
        photoUrl: u.photoURL,
        isAnonymous: u.isAnonymous,
        updatedAt: serverTimestamp(),
      };
      if (snap.exists()) tx.update(ref, profile);
      else
        tx.set(ref, {
          ...profile,
          role: "user",
          active: true,
          partnerId: null,
          notificationsEnabled: false,
          locationSharingEnabled: false,
        });
    });
  }
  return (
    <Context.Provider
      value={{
        user,
        loading,
        error,
        login,
        logout: async () => {
          if (auth) await signOut(auth);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
