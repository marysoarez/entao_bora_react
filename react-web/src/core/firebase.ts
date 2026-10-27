import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export const firebaseWritesEnabled =
  import.meta.env.VITE_FIREBASE_WRITES_ENABLED === "true";
export const expectedFirebaseProjectId = "entaobora";
const hasRequiredConfiguration = !!(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.messagingSenderId &&
  firebaseConfig.appId
);
export const configured =
  hasRequiredConfiguration &&
  firebaseConfig.projectId === expectedFirebaseProjectId;
export const firebaseConfigurationError = !hasRequiredConfiguration
  ? "Preencha a configuração Web do Firebase."
  : firebaseConfig.projectId !== expectedFirebaseProjectId
    ? `Projeto Firebase inesperado: ${firebaseConfig.projectId}. Esperado: ${expectedFirebaseProjectId}.`
    : null;
export const firebaseApp = configured
  ? (getApps()[0] ?? initializeApp(firebaseConfig))
  : null;
export const auth = firebaseApp ? getAuth(firebaseApp) : null;
export const db = firebaseApp ? getFirestore(firebaseApp) : null;
export const functions = firebaseApp ? getFunctions(firebaseApp, "southamerica-east1") : null;
export function database() {
  if (!db) throw Error("Configure o Firebase para acessar os dados.");
  return db;
}

export function assertProductWritesEnabled(operation: string) {
  if (!firebaseWritesEnabled) {
    throw Error(
      `${operation} está temporariamente bloqueada no modo conservador de produção.`,
    );
  }
}
