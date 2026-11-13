import { describe, expect, it } from "vitest";
import { renderPopupHtml } from "../src/core/popup-render";
import { mapSignal } from "../src/core/signal";

describe("popup render", () => {
  it("renders the grey connect state without a trade instruction", () => {
    const html = renderPopupHtml({
      theme: "light",
      signal: mapSignal({ connected: false }),
    });
    expect(html).toContain('data-colour="grey"');
    expect(html).toContain("connect ATLAS");
    expect(html).toContain("Why this colour?");
    expect(html).toContain("Educational information, not investment advice");
    expect(html).toContain("Free during beta");
    expect(html).not.toMatch(/\b(buy|sell)\b/i);
    expect(html).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it("renders green and red only from an explicit cleared-gate model", () => {
    const green = renderPopupHtml({
      theme: "dark",
      signal: mapSignal({
        connected: true,
        modelsClearGate: true,
        signal: { lean: "up", hitRate: 0.62, sampleSize: 240 },
      }),
    });
    const red = renderPopupHtml({
      theme: "light",
      signal: mapSignal({
        connected: true,
        modelsClearGate: true,
        signal: { lean: "down", hitRate: 0.61, sampleSize: 240 },
      }),
    });
    expect(green).toContain('data-colour="green"');
    expect(green).toContain("model leans up");
    expect(red).toContain('data-colour="red"');
    expect(red).toContain("model leans down");
    expect(green + red).not.toMatch(/\b(buy|sell)\b/i);
  });
});
