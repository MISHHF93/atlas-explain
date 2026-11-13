import { engineCopy, lastRunLine, readEngineState, type EngineState } from "../core/hybrid-engine";
import { el } from "./dom";
import { icon } from "./icons";

export interface EngineStripHandle {
  node: HTMLElement;
  /** Re-reads Prompt API availability (on open, and when the network changes). */
  refresh(): Promise<void>;
  /** Forces a state, used by preview pages that have no Chrome APIs. */
  set(state: EngineState): void;
  /** Marks the route the last answer actually took. */
  markRun(source: "on_device" | "in_cloud" | "unknown"): void;
}

/**
 * "On-device ⇄ Cloud" strip at the top of Explain. It shows which route the next answer
 * will take before anything is sent, so the hybrid design is visible, not just claimed.
 */
export function engineStrip(options: { compact?: boolean } = {}): EngineStripHandle {
  const node = el("section", "engine");
  // Compact: one quiet line under the composer (minimal Explain screen). The route
  // diagram is hidden; the label and "How this works" stay.
  node.dataset.compact = options.compact ? "true" : "false";
  node.setAttribute("aria-label", "Where answers run");
  node.dataset.state = "checking";
  node.dataset.route = "none";

  const device = el("span", "engine-node engine-device");
  device.append(icon("chip", 14), el("span", undefined, "On-device"));
  const link = el("span", "engine-link");
  link.setAttribute("aria-hidden", "true");
  link.append(el("span", "engine-pulse"));
  const cloud = el("span", "engine-node engine-cloud");
  cloud.append(icon("cloud", 14), el("span", undefined, "Cloud"));
  const route = el("div", "engine-route");
  route.append(device, link, cloud);

  const label = el("p", "engine-label");
  const last = el("p", "engine-last");
  last.hidden = true;
  const detail = el("p", "engine-detail");
  const more = el("details", "engine-more");
  const summary = el("summary");
  summary.append(el("span", undefined, "How this works"), icon("chevron", 12));
  more.append(summary, detail);
  const text = el("div", "engine-text");
  text.append(label, last, more);
  const live = el("span", "sr-only");
  live.setAttribute("role", "status");

  node.append(route, text, live);

  function set(state: EngineState): void {
    const copy = engineCopy(state);
    node.dataset.state = state;
    node.dataset.route = copy.route;
    label.textContent = copy.label;
    detail.textContent = copy.detail;
    device.setAttribute("aria-current", copy.route === "device" ? "true" : "false");
    cloud.setAttribute("aria-current", copy.route === "cloud" ? "true" : "false");
    if (state !== "checking") live.textContent = `Answers: ${copy.label}.`;
  }

  set("checking");
  return {
    node,
    set,
    async refresh() {
      set(await readEngineState());
    },
    markRun(source) {
      last.hidden = false;
      last.textContent = lastRunLine(source);
      node.dataset.last = source;
    },
  };
}
