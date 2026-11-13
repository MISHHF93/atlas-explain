import { describe, expect, it } from "vitest";
import { readPublicEnv } from "../src/platform/web/env";

const complete = {
  VITE_FIREBASE_API_KEY: "key",
  VITE_FIREBASE_AUTH_DOMAIN: "app.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "atlas-explain",
  VITE_FIREBASE_APP_ID: "1:1:web:abc",
  VITE_RECAPTCHA_ENTERPRISE_SITE_KEY: "site-key",
};

describe("readPublicEnv", () => {
  it("is not ready when the config is missing", () => {
    const env = readPublicEnv({});
    expect(env.ready).toBe(false);
    expect(env.firebase).toBeNull();
    expect(env.missing.length).toBeGreaterThan(0);
  });

  it("treats blank strings as missing", () => {
    const env = readPublicEnv({ ...complete, VITE_FIREBASE_API_KEY: "  " });
    expect(env.ready).toBe(false);
    expect(env.missing).toContain("Firebase apiKey");
  });

  it("is ready with the required keys and keeps debug tokens out of production", () => {
    const dev = readPublicEnv(
      { ...complete, VITE_APPCHECK_DEBUG_TOKEN: "true" },
      { allowDebugToken: true },
    );
    expect(dev.ready).toBe(true);
    expect(dev.appCheckDebugToken).toBe(true);
    expect(dev.firebase?.projectId).toBe("atlas-explain");

    const prod = readPublicEnv(
      { ...complete, VITE_APPCHECK_DEBUG_TOKEN: "true" },
      { allowDebugToken: false },
    );
    expect(prod.appCheckDebugToken).toBeNull();
  });
});
