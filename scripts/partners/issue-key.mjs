// Issues a partner sandbox key (docs/PARTNER_API.md). The key is printed once and never saved anywhere;
// only its SHA-256 hash goes to the Worker's KV, with the partner's name and daily limit.
//   node scripts/partners/issue-key.mjs --name "Acme Bank" [--limit 1000] [--tier sandbox|pilot]          (shows the command)
//   node scripts/partners/issue-key.mjs --name "Acme Bank" --apply                                         (writes the hash to KV)
//   node scripts/partners/issue-key.mjs --revoke <hash> --apply                                             (turns a key off)
import { createHash, randomInt } from "node:crypto";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const opt = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const apply = args.includes("--apply");
const kvPut = (key, value) => {
  const cmd = ["npx", "wrangler@4", "kv", "key", "put", "--binding", "DATA", key, value, "--remote"];
  if (!apply) {
    console.log(`\nNot written (add --apply to write it):\n  ${cmd.map((c) => (/[\s"{}]/.test(c) ? `'${c}'` : c)).join(" ")}`);
    return;
  }
  const r = spawnSync(cmd[0], cmd.slice(1), { stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

const revoke = opt("revoke");
if (revoke) {
  if (!/^[0-9a-f]{64}$/.test(revoke)) throw new Error("--revoke takes the key's 64-character hash");
  kvPut(`partners/keys/${revoke}`, JSON.stringify({ name: "revoked", tier: "sandbox", dailyLimit: 0, createdAt: new Date().toISOString(), active: false }));
  process.exit(0);
}

const name = opt("name");
if (!name) throw new Error('Give the partner\'s name: --name "Acme Bank"');
const tier = opt("tier", "sandbox");
if (!["sandbox", "pilot"].includes(tier)) throw new Error("--tier is sandbox or pilot");
const dailyLimit = Number(opt("limit", tier === "pilot" ? "10000" : "1000"));
if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 50000) throw new Error("--limit is a whole number from 1 to 50,000");

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const secret = Array.from({ length: 32 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const key = `atlx_${tier === "pilot" ? "live" : "sbx"}_${secret}`;
const hash = createHash("sha256").update(key).digest("hex");
const record = { name: name.slice(0, 80), tier, dailyLimit, createdAt: new Date().toISOString(), active: true };

console.log(`Partner: ${record.name} (${tier}, ${dailyLimit} calls a day)`);
console.log(`Key (shown once; send it to the partner privately, never by public channel):\n  ${key}`);
console.log(`Hash (keep this to revoke the key later):\n  ${hash}`);
kvPut(`partners/keys/${hash}`, JSON.stringify(record));
