import { mountDesk } from "./ui/desk";
import { mountLegal } from "./ui/legal";
import { mountSetup } from "./ui/setup";
import { readPublicEnv } from "./platform/web/env";
import type { WebBackend } from "./platform/web/backend";
import "./style.css";

const queried = document.querySelector("#app");
if (!(queried instanceof HTMLElement)) {
  throw new Error("Missing #app");
}
const root: HTMLElement = queried;

const dev = import.meta.env.DEV;
const env = readPublicEnv(
  {
    VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
    VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
    VITE_FIREBASE_MEASUREMENT_ID: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
    VITE_RECAPTCHA_ENTERPRISE_SITE_KEY: import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY,
    VITE_APPCHECK_DEBUG_TOKEN: dev ? import.meta.env.VITE_APPCHECK_DEBUG_TOKEN : undefined,
  },
  { allowDebugToken: dev },
);

let backend: WebBackend | null = null;

async function show(): Promise<void> {
  if (location.hash === "#/terms" || location.hash === "#/privacy") {
    mountLegal(root, location.hash === "#/terms" ? "terms" : "privacy");
    return;
  }
  if (!env.ready) {
    mountSetup(root, env);
    return;
  }
  try {
    if (!backend) {
      const { startWebBackend } = await import("./platform/web/backend");
      backend = startWebBackend(env);
    }
    mountDesk(root, backend);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Firebase did not start.";
    mountSetup(root, env, message);
  }
}

window.addEventListener("hashchange", () => {
  void show();
});
void show();
