import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MCP_ORIGIN, SERVER_VERSION, TOOLS } from "../src/mcp/server";

const ROOT = "plugins/atlas-explain";
const json = (p: string) => JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
const TOOL_NAMES = new Set(TOOLS.map((t) => t.name));

describe("the Claude plugin (connector plus skills)", () => {
  it("is listed by the repo's marketplace and points at the live connector", () => {
    const market = json(".claude-plugin/marketplace.json") as { plugins: { name: string; source: string }[] };
    expect(market.plugins).toEqual([expect.objectContaining({ name: "atlas-explain", source: `./${ROOT}` })]);
    const manifest = json(`${ROOT}/.claude-plugin/plugin.json`);
    expect(manifest.name).toBe("atlas-explain");
    expect(manifest.version).toBe(SERVER_VERSION);
    expect(manifest.license).toBe("Apache-2.0");
    expect(existsSync(`${ROOT}/${String(manifest.icon).replace("./", "")}`)).toBe(true);
    for (const k of ["homepage", "documentationUrl", "supportUrl", "privacyPolicyUrl", "termsOfServiceUrl"]) expect(String(manifest[k]), k).toMatch(/^https:\/\/atlas-explain\.web\.app\//);
    const mcp = json(`${ROOT}/.mcp.json`) as { mcpServers: Record<string, { type: string; url: string }> };
    expect(mcp.mcpServers["atlas-explain"]).toEqual({ type: "http", url: `${MCP_ORIGIN}/mcp` });
  });

  it("has four skills, each with a name matching its folder, a when-to-use description, and only real tools", () => {
    const skills = readdirSync(`${ROOT}/skills`);
    expect(skills.sort()).toEqual(["explain-a-move", "learn-a-term", "market-brief", "trading-costs"]);
    for (const dir of skills) {
      const md = readFileSync(`${ROOT}/skills/${dir}/SKILL.md`, "utf8");
      const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md)![1]!;
      expect(front, dir).toMatch(new RegExp(`^name: ${dir}$`, "m"));
      const description = /^description: (.+)$/m.exec(front)![1]!;
      expect(description, dir).toMatch(/Use when /);
      expect(description.length, dir).toBeLessThanOrEqual(1024);
      // Every tool a skill names in backticks is one the connector really has.
      for (const [, name] of md.matchAll(/`([a-z_]+)`/g)) expect(TOOL_NAMES.has(name!) || !name!.includes("_"), `${dir}: ${name}`).toBe(true);
      expect(md, dir).toMatch(/Never (forecast|claim|say|suggest)|never forecast/);
    }
  });
});
