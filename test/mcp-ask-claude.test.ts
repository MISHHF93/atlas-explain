import { describe, expect, it } from "vitest";
import { MCP_APPS, PROMPTS, TOOLS, completePromptArgument } from "../src/mcp/server";

describe("helping people use the connector at its best (docs/NEXT_LEVEL.md round 2)", () => {
  it("every view offers at most two Ask Claude questions, sent only on a click, never trade prompts", () => {
    for (const app of MCP_APPS) {
      expect(app.html, app.uri).toContain('<div class="asks" id="asks"></div>');
      expect(app.html, app.uri).toContain('request("ui/message", { role: "user", content: [{ type: "text"');
      expect(app.html, app.uri).toContain("items.slice(0, 2)");
      expect(app.html, app.uri).toContain('b.addEventListener("click", () => askClaude(it.prompt, status))');
      expect(app.html, app.uri).toContain('askButtons($("asks")');
      expect(app.html, app.uri).not.toMatch(/\b(buy|sell)\b/i);
      // Nothing is sent to Claude on load or on a timer.
      expect(app.html, app.uri).not.toMatch(/setInterval|setTimeout\([^)]*askClaude/);
    }
  });

  it("tells Claude what's on screen only when the user changes it, and never repeats itself", () => {
    const html = Object.fromEntries(MCP_APPS.map((a) => [a.name, a.html]));
    for (const name of ["price-chart", "crypto-board", "economy", "official-figures"]) {
      expect(html[name], name).toContain("tellClaude(");
      expect(html[name], name).toContain('request("ui/update-model-context"');
    }
    expect(html["price-chart"]).toContain("text === lastContext");
    // The first card and a single coin open quietly; only the user's own picks are reported.
    expect(html["economy"]).toContain("choose(current[0].id, false)");
    expect(html["crypto-board"]).toContain('choose(d.coins[0].symbol, "7d", false)');
  });

  it("each tool's first sentence says what it returns and when to use it, within the 200 characters Claude sees first", () => {
    for (const t of TOOLS) {
      const first = t.description.split(/(?<=\.)\s/)[0]!;
      expect(first.length, t.name).toBeLessThanOrEqual(200);
      expect(t.description.slice(0, 200), t.name).not.toMatch(/\b(buy|sell)\b/i);
    }
    for (const name of ["asset_details", "official_figures", "crypto_prices", "price_history", "todays_headlines", "economy_snapshot", "economic_calendar", "market_depth", "evidence_brief"]) {
      const t = TOOLS.find((x) => x.name === name)!;
      expect(t.description.slice(0, 260), name).toContain("Use it ");
    }
  });

  it("offers ready-made starters for the brief, the economy and a quiz, with suggestions while typing", () => {
    expect(PROMPTS.map((p) => p.name)).toEqual(expect.arrayContaining(["brief_on_asset", "economy_today", "quiz_me"]));
    const brief = PROMPTS.find((p) => p.name === "brief_on_asset")!;
    expect(brief.text({ asset: "Ethereum" })).toContain("evidence brief on Ethereum (evidence_brief)");
    expect(PROMPTS.find((p) => p.name === "quiz_me")!.text({ topic: "rates" })).toContain('quiz me on the "rates" topic');
    expect(completePromptArgument("brief_on_asset", "asset", "Bit")).toContain("Bitcoin");
    expect(completePromptArgument("quiz_me", "topic", "").length).toBeGreaterThan(0);
  });
});
