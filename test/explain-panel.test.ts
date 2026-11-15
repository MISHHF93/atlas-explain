import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addToHistory, makeEntry, parseHistory } from "../src/core/history";

const panel = readFileSync("src/wallet/explain-panel.ts", "utf8");
const app = readFileSync("src/web/app.ts", "utf8");
const popup = readFileSync("extension/src/popup.ts", "utf8");

describe("Explain is built once for both surfaces", () => {
  it("is mounted by the web app and by the popup", () => {
    expect(app).toContain("const panel = explainPanel({");
    expect(popup).toContain("const panel = explainPanel({");
  });

  it("leaves each surface with only its own way of getting an answer", () => {
    expect(app).toContain("ask: askWeb,");
    expect(popup).toContain("ask: askPopup,");
    expect(app).toContain("async function askWeb(request: ExplainRequest): Promise<ExplainOutcome>");
    expect(popup).toContain("async function askPopup(request: ExplainRequest): Promise<ExplainOutcome>");
  });

  it("keeps the answer card, progress, errors and history out of both entry files", () => {
    for (const [name, src] of [["web app", app], ["popup", popup]] as const) {
      expect(src, name).not.toMatch(/function (onExplainText|showTextAnswer|renderTextHistory|showExplanation|keepGoingFor|keepGoing|renderHistory|remember|runCard|loadHistory|historyItem|showResult|setBusy)\(/);
      expect(src, name).not.toContain("historyCard(");
      for (const card of ["explanationCard(", "loadingCard(", "limitCard(", "offlineCard("]) expect(src, `${name} ${card}`).not.toContain(card);
    }
    expect(popup).not.toContain("messageCard(");
  });

  it("answers a market move through the same panel, so it has the same card, follow-ups and Recent", () => {
    expect(app).toContain("await panel.run({ subject: moveSubject(prepared.card), ask: askMove });");
    expect(app).toContain("async function askMove(request: ExplainRequest): Promise<ExplainOutcome>");
    // Follow-ups about a move ask about the card, with their own question.
    expect(app).toContain("const question = request.question || questionInput.value;");
    // A move answer is the shared two-sided shape.
    expect(app).toMatch(/rawText: JSON\.stringify\(\{ summary: ex\.summary, buyerReasons: ex\.buyerReasons, sellerReasons: ex\.sellerReasons, whatWouldChange: ex\.whatWouldChange \}\)/);
  });

  it("says where each answer ran, and always adds the education line", () => {
    expect(panel).toContain("Answered on your device with Gemini Nano. Nothing was sent.");
    expect(panel).toContain("Answered in the cloud with Gemini.");
    expect(panel).toContain("notes: [...(outcome.notes ?? []), WHERE_IT_RAN[outcome.source], ...(carriesDisclaimer ? [] : [EXTENSION_DISCLAIMER])]");
  });

  it("keeps only the first ask in Recent, not each follow-up", () => {
    expect(panel).toContain('show(outcome, outcome.kind === "answer" && !followUp);');
  });

  it("sends typed text the same way from both surfaces", () => {
    // Both pass the typed text as the thing to explain and the follow-up (or nothing) as the question.
    expect(popup).toContain("buildExtensionPrompt({ context, question: request.question })");
    expect(app).toContain("backend.explainText(request.text, request.question,");
  });
});

describe("recent explanations, shared by both surfaces", () => {
  it("accepts an answer whose source the browser did not report", () => {
    const entry = makeEntry({ selection: "pip", text: "{}", source: "unknown", at: 5 });
    expect(parseHistory([entry])).toEqual([entry]);
    expect(parseHistory([{ ...entry, source: "somewhere" }])).toEqual([]);
  });

  it("keeps one entry per subject, newest first", () => {
    const first = makeEntry({ selection: "Pip", text: "a", source: "in_cloud", at: 1 });
    const again = makeEntry({ selection: "pip", text: "b", source: "on_device", at: 2 });
    expect(addToHistory([first], again)).toEqual([again]);
  });
});
