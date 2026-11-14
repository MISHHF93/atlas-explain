import type { FirebaseApp } from "firebase/app";
import type { HybridExplainer } from "../../core/types";

/**
 * Firebase AI Logic is the biggest part of the web bundle. It is only
 * needed when someone asks for an explanation, so it loads on first use.
 */
export function lazyExplainer(app: FirebaseApp): HybridExplainer {
  let ready: Promise<HybridExplainer> | null = null;
  return {
    async explain(request, hooks) {
      ready ??= import("./explainer").then((mod) => mod.createFirebaseExplainer(app));
      const explainer = await ready;
      return explainer.explain(request, hooks);
    },
  };
}

