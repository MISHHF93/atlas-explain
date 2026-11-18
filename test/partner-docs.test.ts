import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENDPOINTS } from "../src/mcp/partner";

const spec = JSON.parse(readFileSync("public/partners/openapi.json", "utf8")) as { openapi: string; servers: { url: string }[]; paths: Record<string, Record<string, unknown>> };
const page = readFileSync("partners.html", "utf8");

describe("the partner page, API spec and samples stay in step with the API", () => {
  it("the OpenAPI spec describes every endpoint the API serves, with the right method", () => {
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.servers[0]!.url).toBe("https://atlas-explain-mcp.atlas-explain.workers.dev/api/v1");
    for (const e of ENDPOINTS) {
      const path = e.path.replace("/api/v1", "").replace(/\?.*$/, "");
      expect(spec.paths[path], path).toBeDefined();
      expect(spec.paths[path]![e.method.toLowerCase()], `${e.method} ${path}`).toBeDefined();
    }
    expect(Object.keys(spec.paths)).toHaveLength(ENDPOINTS.length);
  });

  it("every sample linked from the page exists, is a real answer, and has no crypto prices", () => {
    const links = [...page.matchAll(/href="\/partners\/samples\/([a-zA-Z-]+\.json)"/g)].map((m) => m[1]!);
    expect(links.length).toBe(ENDPOINTS.length);
    for (const name of links) {
      const file = `public/partners/samples/${name}`;
      expect(existsSync(file), file).toBe(true);
      const body = JSON.parse(readFileSync(file, "utf8")) as { data: unknown; meta: { educationOnly: boolean; credit: string[] } };
      expect(body.meta.educationOnly, name).toBe(true);
      expect(body.data, name).toBeTruthy();
      expect(JSON.stringify(body), name).not.toMatch(/kraken|coingecko|crypto_move/i);
    }
  });

  it("the page says it is education only, offers no crypto prices, and never asks for confidential details", () => {
    expect(page).toContain("Education only.");
    expect(page).toContain("Crypto prices</td><td>Not offered");
    expect(page).toContain("Don't post anything confidential");
  });
});
