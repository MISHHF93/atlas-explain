import { accountView, type AccountView } from "../../src/core/account";
import { parseRemoteSettings } from "../../src/core/settings";
import type { AppSettings } from "../../src/core/types";
import { askBridge } from "./bridge-client";

export interface CloudAnswer {
  text: string;
  blocked: boolean;
}

/**
 * Cloud fallback for the extension. reCAPTCHA Enterprise cannot attest extension
 * pages, so calls go through the ATLAS Explain web app's bridge page, which passes
 * App Check on atlas-explain.web.app and uses the fixed extension prompt.
 */
export async function loadExtensionSettings(): Promise<AppSettings> {
  try {
    const values = await askBridge({ type: "settings" }, 8_000);
    return parseRemoteSettings(values && typeof values === "object" ? (values as Record<string, string>) : {}).settings;
  } catch {
    // Built-in defaults keep billing off.
    return parseRemoteSettings({}).settings;
  }
}

export async function explainInCloud(prompt: string): Promise<CloudAnswer> {
  const data = await askBridge({ type: "explain", prompt }, 60_000);
  const r = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const text = typeof r.text === "string" ? r.text : "";
  if (!text) throw new Error("The cloud model returned an empty answer.");
  return { blocked: r.blocked === true, text };
}

/** The account signed in on atlas-explain.web.app in this Chrome profile, read through the bridge. */
export async function readAccount(): Promise<AccountView | null> {
  const data = await askBridge({ type: "account" }, 8_000);
  if (!data || typeof data !== "object") return null;
  const r = data as Record<string, unknown>;
  if (typeof r.uid !== "string") return null;
  // Re-derive the view from plain fields; never trust a shape we did not build.
  return accountView({
    uid: r.uid,
    isAnonymous: r.signedIn !== true,
    displayName: typeof r.label === "string" ? r.label : null,
    email: typeof r.email === "string" ? r.email : null,
    providerData: r.provider === "google" ? [{ providerId: "google.com" }] : r.provider === "email" ? [{ providerId: "password" }] : [],
  });
}
