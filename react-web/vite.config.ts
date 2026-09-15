import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";
import { fileURLToPath, URL } from "node:url";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const config = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
  const worker = config.apiKey
    ? `importScripts('https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js');importScripts('https://www.gstatic.com/firebasejs/12.18.0/firebase-messaging-compat.js');firebase.initializeApp(${JSON.stringify(config)});firebase.messaging();`
    : "// Firebase não configurado neste ambiente.\n";
  return {
    plugins: [
      react(),
      {
        name: "firebase-worker",
        generateBundle() {
          this.emitFile({
            type: "asset",
            fileName: "firebase-messaging-sw.js",
            source: worker,
          });
        },
        configureServer(server) {
          server.middlewares.use("/firebase-messaging-sw.js", (_req, res) => {
            res.setHeader("Content-Type", "application/javascript");
            res.end(worker);
          });
        },
      },
    ],
    resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
    css: { postcss: { plugins: [tailwindcss()] } },
    build: { outDir: "dist" },
  };
});
