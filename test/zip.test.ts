import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { crc32, createZip } from "../scripts/zip.mjs";

describe("extension zip writer", () => {
  it("matches the standard CRC-32 check value", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });

  it("writes a readable archive without a zip binary", () => {
    const manifest = Buffer.from(JSON.stringify({ manifest_version: 3, name: "ATLAS Explain" }).repeat(20));
    const zip: Buffer = createZip([
      { name: "manifest.json", data: manifest },
      { name: "icons/icon-16.png", data: Buffer.from([1, 2, 3]) },
    ]);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    const end = zip.length - 22;
    expect(zip.readUInt32LE(end)).toBe(0x06054b50);
    expect(zip.readUInt16LE(end + 10)).toBe(2);
    const nameLength = zip.readUInt16LE(26);
    expect(zip.subarray(30, 30 + nameLength).toString()).toBe("manifest.json");
    const compressed = zip.readUInt32LE(18);
    const body = zip.subarray(30 + nameLength, 30 + nameLength + compressed);
    expect(inflateRawSync(body).equals(manifest)).toBe(true);
  });
});
