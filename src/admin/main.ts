/**
 * The owner dashboard at /admin (docs/ADMIN.md): connector usage, data freshness, partner keys and service
 * settings, from the connector's owner-only /admin/overview. Its own page, apart from the user app; it shares
 * the app's Firebase sign-in (same site, same Firebase app), so an owner already signed in goes straight in.
 * The connector decides who is the owner; this page never names them.
 */
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, onIdTokenChanged, signInWithPopup, signInWithRedirect, signOut, type User } from "firebase/auth";
import { MCP_ORIGIN } from "../core/links";
import type { Overview } from "../mcp/admin";
import { readPublicEnv } from "../platform/web/env";
import { renderOverview } from "./view";
import "./admin.css";

const root = document.querySelector<HTMLElement>("#admin")!;
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

function frame(...body: Node[]): void {
  const head = h("header", "ad-head");
  const brand = h("a", "ad-brand", "ATLAS Explain");
  brand.href = "/";
  head.append(brand, h("span", "ad-tag", "Owner dashboard"));
  const main = h("main", "ad-main");
  main.append(...body);
  root.replaceChildren(head, main);
}

function message(title: string, text: string, ...actions: HTMLElement[]): void {
  const box = h("section", "ad-card ad-message");
  box.append(h("h1", "ad-title", title), h("p", "ad-fine", text));
  if (actions.length) {
    const row = h("div", "ad-actions");
    row.append(...actions);
    box.append(row);
  }
  frame(box);
}

function button(label: string, run: () => void, primary = false): HTMLButtonElement {
  const b = h("button", primary ? "ad-btn ad-btn-primary" : "ad-btn", label);
  b.type = "button";
  b.addEventListener("click", run);
  return b;
}

const env = readPublicEnv({
  VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
  VITE_FIREBASE_MEASUREMENT_ID: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  VITE_RECAPTCHA_ENTERPRISE_SITE_KEY: import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY,
});

let days = 30;

if (!env.firebaseOptions) {
  message("Sign-in isn't available", "This copy of the site has no Firebase settings, so the dashboard can't check who you are.");
} else {
  const auth = getAuth(initializeApp(env.firebaseOptions));

  const signIn = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") await signInWithRedirect(auth, new GoogleAuthProvider());
      else if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") message("Sign-in didn't finish", "Try again. If it keeps failing, allow pop-ups for this site.", button("Sign in with Google", () => void signIn(), true));
    }
  };
  const switchAccount = async () => {
    await signOut(auth);
    await signIn();
  };

  async function load(user: User): Promise<void> {
    frame(h("p", "ad-fine ad-loading", "Loading the dashboard…"));
    let r: Response;
    try {
      r = await fetch(`${MCP_ORIGIN}/admin/overview?days=${days}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
    } catch {
      return message("The connector didn't answer", "Check your connection and try again.", button("Try again", () => void load(user), true));
    }
    const body = (await r.json().catch(() => ({}))) as Partial<Overview> & { error?: string; setup?: boolean };
    if (r.status === 403 && body.setup === false) {
      return message(
        "No owner account is set up yet",
        `You're signed in as ${user.email ?? "this account"}. To make it the owner, run "npx wrangler@4 secret put ADMIN_EMAILS" in the project folder and enter this email, then reload.`,
        button("Reload", () => location.reload(), true),
      );
    }
    if (r.status === 403) return message("This account isn't the owner's", `You're signed in as ${user.email ?? "this account"}. Sign in with the owner's Google account to see the dashboard.`, button("Use another account", () => void switchAccount(), true), linkButton("Go to the app", "/app"));
    if (r.status === 401) return message("Sign in again", "Your sign-in has expired.", button("Sign in with Google", () => void signIn(), true));
    if (!r.ok || !body.data) return message("The dashboard couldn't load", body.error ?? `The connector answered ${r.status}.`, button("Try again", () => void load(user), true));
    frame(
      renderOverview(body as Overview, {
        days,
        onDays: (d) => {
          days = d;
          void load(user);
        },
        onRefresh: () => void load(user),
        onSignOut: () => void signOut(auth),
      }),
    );
  }

  function linkButton(label: string, href: string): HTMLAnchorElement {
    const a = h("a", "ad-btn", label);
    a.href = href;
    return a;
  }

  frame(h("p", "ad-fine ad-loading", "Checking your sign-in…"));
  onIdTokenChanged(auth, (user) => {
    if (!user || user.isAnonymous) {
      message("Owner dashboard", "Sign in with the owner's Google account to see how the connector is used.", button("Sign in with Google", () => void signIn(), true), linkButton("Back to the website", "/"));
      return;
    }
    void load(user);
  });
}
