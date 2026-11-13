// Education-only guard: fail if shipped copy or built bundles contain trade instructions.
// Neutral explanations ("why some traders buy while others sell") are fine; calls to act are not.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const FORBIDDEN = [
  /\bstrong\s+(buy|sell)\b/i,
  /\b(buy|sell|short)\s+(now|signal|alert|rating|recommendation|today|here)\b/i,
  /\b(you should|we recommend|you must|time to|go ahead and)\s+(buy|sell|short|go long|go short)\b/i,
  /\b(buy|sell)\s+the\s+(dip|rip|news)\b/i,
  /\b(guaranteed|risk-free)\s+(profit|returns?|gains?)\b/i,
];

/** Words inside a regex alternation such as /(buy now|sell now)/ are guard patterns, not copy. */
function insideGuardPattern(text, start, end) {
  return /[(|]/.test(text[start - 1] ?? "") || /[|)]/.test(text[end] ?? "");
}

export function scanText(text) {
  return FORBIDDEN.flatMap((re) =>
    [...text.matchAll(new RegExp(re.source, "gi"))]
      .filter((m) => !insideGuardPattern(text, m.index, m.index + m[0].length))
      .map((m) => m[0]),
  );
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN = ["src", "extension/src", "extension/popup.html", "index.html", "public", "dist", "extension/dist", "README.md"];
const exts = /\.(ts|js|mjs|html|css|json|md|txt)$/;
const walk = (p) => {
  try {
    const s = statSync(p);
    if (!s.isDirectory()) return exts.test(p) ? [p] : [];
    return readdirSync(p).flatMap((n) => walk(join(p, n)));
  } catch {
    return [];
  }
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const hits = [];
  let files = 0;
  for (const target of SCAN) {
    for (const file of walk(join(root, target))) {
      files += 1;
      for (const hit of scanText(readFileSync(file, "utf8"))) hits.push(`${relative(root, file)}: "${hit}"`);
    }
  }
  if (hits.length) {
    for (const h of hits) console.error(`✗ trade instruction wording: ${h}`);
    process.exit(1);
  }
  console.log(`✓ trade-word scan: ${files} files, no buy/sell instructions`);
}
