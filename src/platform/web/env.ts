import type { FirebaseOptions } from "firebase/app";

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
}

export interface PublicEnvConfig {
  ready: boolean;
  firebase: FirebaseWebConfig | null;
  firebaseOptions: FirebaseOptions | null;
  recaptchaEnterpriseSiteKey: string | null;
  /** Set only for dev. `true` asks the SDK to print a token. A string is a registered token. */
  appCheckDebugToken: string | boolean | null;
  missing: string[];
}

const REQUIRED: { key: string; label: string }[] = [
  { key: "VITE_FIREBASE_API_KEY", label: "Firebase apiKey" },
  { key: "VITE_FIREBASE_AUTH_DOMAIN", label: "Firebase authDomain" },
  { key: "VITE_FIREBASE_PROJECT_ID", label: "Firebase projectId" },
  { key: "VITE_FIREBASE_APP_ID", label: "Firebase appId" },
  { key: "VITE_RECAPTCHA_ENTERPRISE_SITE_KEY", label: "reCAPTCHA Enterprise site key" },
];

export function readPublicEnv(
  env: Record<string, string | boolean | undefined>,
  options?: { allowDebugToken?: boolean },
): PublicEnvConfig {
  const missing = REQUIRED.filter((item) => !present(env[item.key])).map((item) => item.label);

  const apiKey = present(env.VITE_FIREBASE_API_KEY);
  const authDomain = present(env.VITE_FIREBASE_AUTH_DOMAIN);
  const projectId = present(env.VITE_FIREBASE_PROJECT_ID);
  const appId = present(env.VITE_FIREBASE_APP_ID);
  const recaptcha = present(env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY);

  const firebase =
    apiKey && authDomain && projectId && appId
      ? {
          apiKey,
          authDomain,
          projectId,
          appId,
          ...(present(env.VITE_FIREBASE_STORAGE_BUCKET)
            ? { storageBucket: present(env.VITE_FIREBASE_STORAGE_BUCKET) as string }
            : {}),
          ...(present(env.VITE_FIREBASE_MESSAGING_SENDER_ID)
            ? { messagingSenderId: present(env.VITE_FIREBASE_MESSAGING_SENDER_ID) as string }
            : {}),
          ...(present(env.VITE_FIREBASE_MEASUREMENT_ID)
            ? { measurementId: present(env.VITE_FIREBASE_MEASUREMENT_ID) as string }
            : {}),
        }
      : null;

  let appCheckDebugToken: string | boolean | null = null;
  if (options?.allowDebugToken) {
    const raw = present(env.VITE_APPCHECK_DEBUG_TOKEN);
    if (raw === "true") appCheckDebugToken = true;
    else if (raw) appCheckDebugToken = raw;
  }

  return {
    ready: missing.length === 0 && firebase !== null && recaptcha !== null,
    firebase,
    firebaseOptions: firebase,
    recaptchaEnterpriseSiteKey: recaptcha,
    appCheckDebugToken,
    missing,
  };
}

function present(value: string | boolean | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
