import { readPublicEnv } from "./platform/web/env";
import { mountWebWallet } from "./web/app";
import { installErrorBoundary } from "./wallet/error-boundary";
import { addMonitorSink, consoleSink } from "./core/monitor";
import "./app/app.css";

// Monitoring hook: swap or add a real sink (Analytics, Sentry, a log endpoint) at launch.
addMonitorSink(consoleSink);

const queried = document.querySelector("#app");
if (!(queried instanceof HTMLElement)) {
  throw new Error("Missing #app");
}

const boundary = installErrorBoundary(queried);
const dev = import.meta.env.DEV;
void boundary.mount(() => {
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

  mountWebWallet(queried, {
    env,
    async startBackend() {
      const { startWebBackend } = await import("./platform/web/backend");
      return startWebBackend(env);
    },
  });
});
