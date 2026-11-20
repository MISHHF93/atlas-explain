import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { PROMPTS, setFeatures, visibleTools } from "../src/mcp/server";

// The tools the live connector lists: the base set plus the v2 tools wrangler.toml switches on.
const v2 = /^V2_TOOLS\s*=\s*"([^"]*)"/m.exec(readFileSync("wrangler.toml", "utf8"))?.[1];

describe("the website describes the connector as it is deployed", () => {
  afterAll(() => setFeatures(undefined));

  it("gives the true number of tools and prompts on the home page and in how it's built", () => {
    setFeatures(v2);
    const tools = visibleTools().length;
    expect(readFileSync("index.html", "utf8")).toContain(`${tools} tools and ${PROMPTS.length} one-click prompts.`);
    expect(readFileSync("how-its-built.html", "utf8")).toContain(`${tools} tools`);
  });

  it("names every ready-made prompt on the connect page", () => {
    const connect = readFileSync("connect.html", "utf8").replace(/&#39;|&rsquo;/g, "'");
    for (const p of PROMPTS) expect(connect).toContain(`<b>${p.title}</b>`);
  });
});
