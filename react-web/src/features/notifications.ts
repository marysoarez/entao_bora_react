import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { doc, serverTimestamp, writeBatch } from "firebase/firestore";
import {
  assertProductWritesEnabled,
  database,
  firebaseApp,
} from "../core/firebase";
import type { User } from "../shared/models";
export const tokenId = (token: string) =>
  btoa(token).replace(/\+/g, "-").replace(/\//g, "_");
export async function setNotifications(user: User, enabled: boolean) {
  assertProductWritesEnabled("Atualização de notificações");
  if (!firebaseApp || !(await isSupported()))
    throw Error("Notificações não são suportadas neste navegador.");
  const vapidKey = import.meta.env.VITE_FCM_WEB_VAPID_KEY;
  if (!vapidKey) throw Error("Notificações ainda não configuradas.");
  if (enabled && (await Notification.requestPermission()) !== "granted")
    throw Error("Permissão de notificações não concedida.");
  const registration = await navigator.serviceWorker.register(
    "/firebase-messaging-sw.js",
  );
  const token =
    Notification.permission === "granted"
      ? await getToken(getMessaging(firebaseApp), {
          vapidKey,
          serviceWorkerRegistration: registration,
        })
      : null;
  const db = database(),
    batch = writeBatch(db);
  batch.update(doc(db, "users", user.id), {
    notificationsEnabled: enabled,
    notificationUpdatedAt: serverTimestamp(),
  });
  if (token)
    batch.set(
      doc(db, "users", user.id, "notification_tokens", tokenId(token)),
      {
        token,
        platform: "web",
        isWeb: true,
        enabled,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  await batch.commit();
}
