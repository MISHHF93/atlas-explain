import { legacyRedirect } from "../app/routes";
import { readAccountHint } from "../core/account-hint";
import "./site.css";

/*
 * Public site pages (/, /partners, /privacy, /terms, 404). Static HTML with
 * the shared header and footer filled in at build time (src/site/frame.ts). This tiny script
 * only forwards links made for the old single-page app (desk links, old account links,
 * email sign-in links, preview flags) to their new address under /app.
 */
const target = legacyRedirect(location);
if (target) location.replace(target);

// Copy buttons in Set it up on the home page: copy the text of the element they name, then say so for a moment.
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-copy]")) {
  button.addEventListener("click", () => {
    const text = document.getElementById(button.dataset.copy ?? "")?.textContent?.trim() ?? "";
    const label = button.textContent;
    void navigator.clipboard?.writeText(text).then(
      () => { button.textContent = "Copied"; },
      () => { button.textContent = "Select and copy"; },
    ).finally(() => setTimeout(() => { button.textContent = label; }, 1600));
  });
}

// Signed in on this browser (a hint the app saves): your initials link to your account, and the
// one way in reads "Open ATLAS Explain". The app always checks the real sign-in itself.
const hint = readAccountHint();
const accountLink = document.querySelector<HTMLAnchorElement>("[data-account-link]");
if (hint) {
  for (const cta of document.querySelectorAll<HTMLAnchorElement>("[data-start-cta]")) cta.textContent = "Open ATLAS Explain";
}
if (hint && accountLink) {
  accountLink.hidden = false;
  accountLink.dataset.signedIn = "true";
  accountLink.setAttribute("aria-label", `Your account (${hint.label})`);
  const initials = document.createElement("span");
  initials.className = "site-signin-initials";
  initials.textContent = hint.initials;
  accountLink.replaceChildren(initials, document.createTextNode("Account"));
}

