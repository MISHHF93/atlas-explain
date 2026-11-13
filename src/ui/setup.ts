import type { PublicEnvConfig } from "../platform/web/env";
import { h } from "./dom";

export function mountSetup(root: HTMLElement, env: PublicEnvConfig, startupError?: string): void {
  root.replaceChildren();
  const missing = env.missing.map((item) => h("li", { text: item }));

  root.append(
    h("header", { className: "top" }, brand(), disclaimer()),
    h(
      "main",
      { className: "wrap", attrs: { id: "main" } },
      h("section", { className: "panel setup" },
        h("h2", { text: "Connect a Firebase project" }),
        h(
          "p",
          {
            text: "ATLAS Explain is installed, and it will not call a model until Firebase is configured. Add a web app config and a reCAPTCHA Enterprise site key, then reload.",
          },
        ),
        startupError ? h("p", { className: "alert", attrs: { role: "alert" }, text: startupError }) : "",
        missing.length
          ? h("div", {}, h("p", { text: "Still needed:" }), h("ul", {}, ...missing))
          : h("p", { text: "The required keys are present, but Firebase did not start." }),
        h("ol", { className: "steps" },
          h("li", { text: "Create a Firebase project and register a Web app." }),
          h("li", { text: "Open AI Services → AI Logic and finish the Gemini Developer API setup. Leave App Check enforced." }),
          h("li", { text: "Copy the web config into .env.local using the names in .env.example." }),
          h("li", { text: "Create a score-based reCAPTCHA Enterprise site key and register it with App Check. For localhost, set VITE_APPCHECK_DEBUG_TOKEN=true and register the token the console prints. Do not add localhost to a production key." }),
          h("li", { text: "Enable Anonymous Authentication, create a Firestore database, and publish firestore.rules." }),
          h("li", { text: "In Remote Config, publish remoteconfig.template.json (or rely on the in-app defaults)." }),
          h("li", { text: "Run npm run dev and reload this page." }),
        ),
        h(
          "p",
          {
            className: "fine",
            text: "The full click-path is in README.md. No market-data license is required. Explanations are educational and are not financial advice.",
          },
        ),
      ),
    ),
  );
}

function brand(): HTMLElement {
  return h("div", { className: "brand" },
    h("p", { className: "mark", text: "ATLAS" }),
    h("div", {},
      h("h1", { text: "Explain" }),
      h("p", { className: "tag", text: "Why a dip can look like an opportunity to one desk and a warning to another." }),
    ),
  );
}

function disclaimer(): HTMLElement {
  return h(
    "p",
    {
      className: "disclaimer",
      attrs: { role: "note" },
      text: "Educational explanations only. Not financial advice, not a recommendation, and not an offer to buy or sell any security. Nothing here is a prediction.",
    },
  );
}

export { brand, disclaimer };
