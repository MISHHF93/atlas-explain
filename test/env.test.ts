import { describe, expect, it } from "vitest";
import { PUBLIC_FIREBASE_CONFIG, PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY } from "../src/platform/web/firebaseConfig";
import { readPublicEnv } from "../src/platform/web/env";

const complete = {
  VITE_FIREBASE_API_KEY: "key",
  VITE_FIREBASE_AUTH_DOMAIN: "app.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "atlas-explain",
  VITE_FIREBASE_APP_ID: "1:1:web:abc",
  VITE_RECAPTCHA_ENTERPRISE_SITE_KEY: "site-key",
};

describe("readPublicEnv", () => {
  it("uses the committed public project when Vite vars are unset", () => {
    const env = readPublicEnv({}, { allowDebugToken: true });
    expect(env.ready).toBe(true);
    expect(env.missing).toEqual([]);
    expect(env.firebase).toEqual(PUBLIC_FIREBASE_CONFIG);
    expect(env.recaptchaEnterpriseSiteKey).toBe(PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY);
    expect(env.appCheckDebugToken).toBe(true);
  });

  it("does not enable the App Check debug token in production", () => {
    const env = readPublicEnv({ VITE_APPCHECK_DEBUG_TOKEN: "true" }, { allowDebugToken: false });
    expect(env.ready).toBe(true);
    expect(env.firebase?.projectId).toBe("atlas-explain");
    expect(env.appCheckDebugToken).toBeNull();
  });

  it("treats a blank override of a required key as missing", () => {
    const env = readPublicEnv({ ...complete, VITE_FIREBASE_API_KEY: "  " });
    expect(env.ready).toBe(false);
    expect(env.missing).toContain("Firebase apiKey");
  });

  it("is ready with the required keys and keeps debug tokens out of production", () => {
    const dev = readPublicEnv(
      { ...complete, VITE_APPCHECK_DEBUG_TOKEN: "already-registered" },
      { allowDebugToken: true },
    );
    expect(dev.ready).toBe(true);
    expect(dev.appCheckDebugToken).toBe("already-registered");
    expect(dev.firebase?.projectId).toBe("atlas-explain");
    expect(dev.firebase?.apiKey).toBe("key");

    const prod = readPublicEnv(
      { ...complete, VITE_APPCHECK_DEBUG_TOKEN: "true" },
      { allowDebugToken: false },
    );
    expect(prod.appCheckDebugToken).toBeNull();
  });
});
