// Renders public/app-icon.svg (full-bleed, logo in the central safe zone) into the web app's install icons:
// public/icons/icon-192.png, icon-512.png (also used as "maskable", since the mark sits in the safe zone),
// apple-touch-icon.png (180) and public/favicon.ico (a 48 px PNG inside an ICO wrapper, which every
// browser that asks for /favicon.ico reads).
//   node scripts/write-web-icons.mjs      (needs Chrome; rerun when the logo changes)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChrome } from "../store/src/cdp.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(root, "public", "app-icon.svg"), "utf8");
const page = (size) =>
  `data:text/html;base64,${Buffer.from(`<!doctype html><html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}" width="${size}" height="${size}" style="display:block"></body></html>`).toString("base64")}`;

const sizes = [512, 192, 180, 48];
const png = {};
const chrome = await launchChrome(9336);
try {
  for (const size of sizes) {
    const tab = await chrome.open(size, size, 1);
    await tab.goto(page(size), 600);
    png[size] = await tab.png();
    await tab.close();
  }
} finally {
  await chrome.close();
}

const dir = join(root, "public", "icons");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "icon-512.png"), png[512]);
writeFileSync(join(dir, "icon-192.png"), png[192]);
writeFileSync(join(dir, "apple-touch-icon.png"), png[180]);

// ICO with one PNG image: 6-byte header, one 16-byte directory entry, then the PNG.
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry.writeUInt8(48, 0);
entry.writeUInt8(48, 1);
entry.writeUInt8(0, 2);
entry.writeUInt8(0, 3);
entry.writeUInt16LE(1, 4);
entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(png[48].length, 8);
entry.writeUInt32LE(22, 12);
writeFileSync(join(root, "public", "favicon.ico"), Buffer.concat([header, entry, png[48]]));
console.log("icons:", Object.fromEntries(sizes.map((s) => [s, png[s].length])));
