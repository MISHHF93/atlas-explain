import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The Firestore emulator is not part of `npm test`.
 * These assertions lock the clauses the emulator would enforce.
 * The real rules engine runs them in `npm run test:rules` (test/rules/firestore.rules.ts).
 */
describe("firestore.rules metering clauses", () => {
  const rules = readFileSync("firestore.rules", "utf8");

  it("lets a user add exactly one to their own daily counter", () => {
    expect(rules).toContain("match /users/{userId}/usage/{dayId}");
    expect(rules).toContain("request.resource.data.cloudCalls == 1");
    expect(rules).toContain("request.resource.data.cloudCalls == resource.data.cloudCalls + 1");
    expect(rules).toContain("affectedKeys().hasOnly([\"cloudCalls\"])");
  });

  it("does not let a client write its own plan", () => {
    expect(rules).toMatch(/match \/users\/\{userId\}\/plan\/\{planDoc\} \{\s*allow read: if signedIn\(userId\);\s*allow write: if false;/);
    expect(rules).not.toContain("customers");
  });
});