import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// `npm run data:capture` runs under plain Node, which only resolves relative imports that name the file
// exactly (`./sec.ts`, not `./sec`). Vite, Wrangler and Vitest accept both, so only this test notices.
function extensionless(entry: string): string[] {
  const seen = new Set<string>();
  const bad: string[] = [];
  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/^(?:import|export)(?!\s+type\b)[^;]*?\sfrom\s+"(\.{1,2}\/[^"]+)"/gm)) {
      const spec = m[1]!;
      if (/\.(ts|js|json)$/.test(spec)) {
        if (spec.endsWith(".ts")) walk(resolve(dirname(file), spec));
      } else {
        bad.push(`${relative(process.cwd(), file)} imports ${spec}`);
        if (existsSync(resolve(dirname(file), `${spec}.ts`))) walk(resolve(dirname(file), `${spec}.ts`));
      }
    }
  };
  walk(resolve(entry));
  return bad;
}

describe("the data capture script runs under plain Node", () => {
  it("names every relative import's file exactly, all the way down", () => {
    expect(extensionless("scripts/data/build-data.ts")).toEqual([]);
  });
});
