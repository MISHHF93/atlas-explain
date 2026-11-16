import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONNECT_URL, CRYPTO_DATA_URL, DATA_SITE_URL, EDUCATION_LINE, EDUCATION_SHORT, MARKET_DATA_URL, MCP_ORIGIN, MCP_URL, NEWS_DATA_URL } from "../src/core/links";
import { handleHttp } from "../src/mcp/http";
import { completePromptArgument, handle, ICONS, SERVER_VERSION, type Fetcher } from "../src/mcp/server";
import { DATA_ORIGIN } from "../src/mcp/live-data";
import { sitePage } from "./site-page";

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : [join(dir, n).split("\\").join("/")]));

describe("one source for every public address, version and line", () => {
  it("keeps the registry file, the deploy settings and the server in step", () => {
    const manifest = JSON.parse(readFileSync("server.json", "utf8")) as { version: string; websiteUrl: string; remotes: { url: string }[]; icons: { src: string }[] };
    expect(manifest.remotes[0]!.url).toBe(MCP_URL);
    expect(manifest.version).toBe(SERVER_VERSION);
    expect(manifest.websiteUrl).toBe(CONNECT_URL);
    expect(manifest.icons.map((i) => i.src)).toEqual(ICONS.map((i) => i.src));
    for (const icon of ICONS) expect(icon.src.startsWith(`${MCP_ORIGIN}/`)).toBe(true);
    // wrangler deploys the worker under the name the address carries.
    const name = /^name = "([^"]+)"/m.exec(readFileSync("wrangler.toml", "utf8"))![1]!;
    expect(new URL(MCP_ORIGIN).hostname.startsWith(`${name}.`)).toBe(true);
  });

  it("reads all data from the one data site", () => {
    expect(DATA_ORIGIN).toBe(DATA_SITE_URL);
    for (const url of [MARKET_DATA_URL, NEWS_DATA_URL, CRYPTO_DATA_URL]) expect(url.startsWith(`${DATA_SITE_URL}/data/v1/`)).toBe(true);
  });

  it("types no address outside src/core/links.ts (in the connector, the data code and the site frame)", () => {
    const scanned = [...files("src/mcp"), ...files("src/data"), "src/site/frame.ts", "src/core/catalog.ts"].filter((f) => f.endsWith(".ts") && !f.endsWith("icon-data.ts"));
    for (const f of scanned) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/https:\/\/atlas-explain(-data)?\.web\.app|atlas-explain\.workers\.dev/);
    }
  });

  it("ends the site and the connector with the same education line", () => {
    expect(EDUCATION_LINE.startsWith(EDUCATION_SHORT)).toBe(true);
    expect(sitePage("index.html")).toContain(`<p class="foot-edu">${EDUCATION_LINE}</p>`);
    expect(readFileSync("src/mcp/server.ts", "utf8")).not.toContain('"Educational information');
  });
});

describe("handshake extras", () => {
  const never: Fetcher = async () => { throw new Error("no network"); };

  it("suggests coins, catalog names and learning topics while a prompt is filled in", async () => {
    expect(completePromptArgument("explain_asset", "asset", "bi")[0]).toBe("Bitcoin");
    expect(completePromptArgument("learn_next", "topic", "ri")).toContain("risk");
    expect(completePromptArgument("market_brief", "x", "a")).toEqual([]);
    const reply = await handle({ jsonrpc: "2.0", id: 1, method: "completion/complete", params: { ref: { type: "ref/prompt", name: "explain_asset" }, argument: { name: "asset", value: "eth" } } }, never);
    expect((reply?.result as { completion: { values: string[] } }).completion.values).toContain("Ethereum");
  });

  it("lets browser-based clients send an Authorization header, which it ignores", async () => {
    const res = await handleHttp(new Request(`${MCP_ORIGIN}/mcp`, { method: "OPTIONS" }), never);
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
  });
});
