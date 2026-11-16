import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLOUD_PER_MINUTE, RATE_KEY } from "../src/core/rate-limit";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import type { HybridExplainRequest } from "../src/core/types";

const usage = vi.hoisted(() => ({
  readCloudCallsToday: vi.fn(),
  readPlan: vi.fn(),
  incrementCloudCalls: vi.fn(),
}));

vi.mock("../src/platform/web/usage", () => usage);
vi.mock("firebase/app", () => ({ initializeApp: vi.fn() }));
vi.mock("firebase/app-check", () => ({ initializeAppCheck: vi.fn(), ReCaptchaEnterpriseProvider: vi.fn() }));
vi.mock("firebase/auth", () => ({ getAuth: vi.fn(), signInAnonymously: vi.fn() }));
vi.mock("firebase/remote-config", () => ({ fetchAndActivate: vi.fn(), getRemoteConfig: vi.fn(), getValue: vi.fn() }));

import { createExplainService, createUserId } from "../src/platform/web/explain-service";
import { signInAnonymously } from "firebase/auth";

const billingOn = { ...DEFAULT_SETTINGS, billingEnabled: true, freeCloudDailyLimit: 10, proCloudDailyLimit: 100 };

function setup(source: "in_cloud" | "on_device" = "in_cloud") {
  const requests: HybridExplainRequest[] = [];
  const service = createExplainService({
    explainer: {
      async explain(request) {
        requests.push(request);
        return { rawText: "{}", inferenceSource: source };
      },
    },
    db: async () => ({}) as never,
    userId: async () => "Uid1",
  });
  return { service, requests };
}

describe("the one explain service", () => {
  let stored: Map<string, string>;

  beforeEach(() => {
    stored = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
    });
    for (const mock of Object.values(usage)) mock.mockReset();
    usage.readCloudCallsToday.mockResolvedValue(0);
    usage.readPlan.mockResolvedValue("free");
    usage.incrementCloudCalls.mockResolvedValue(undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lets every cloud answer through while billing is off, without touching the account", async () => {
    const { service } = setup();
    const gate = await service.cloudGate(DEFAULT_SETTINGS);
    expect(gate).toMatchObject({ allowed: true, allowByPlan: true, uid: null });
    expect(usage.readPlan).not.toHaveBeenCalled();
    await service.answerText(DEFAULT_SETTINGS, { prompt: "p", mode: "only_in_cloud", gate });
    expect(usage.incrementCloudCalls).not.toHaveBeenCalled();
  });

  it("stops at the plan's daily limit once billing is on, and gives Pro the higher limit", async () => {
    const { service } = setup();
    usage.readCloudCallsToday.mockResolvedValue(10);
    const free = await service.cloudGate(billingOn);
    expect(free).toMatchObject({ allowed: false, allowByPlan: false, plan: "free", uid: "Uid1" });
    expect(service.blockedMessage(free)).toMatch(/used today's cloud explanations/);
    usage.readPlan.mockResolvedValue("pro");
    expect(await service.cloudGate(billingOn)).toMatchObject({ allowed: true, plan: "pro" });
    usage.readCloudCallsToday.mockResolvedValue(100);
    expect((await service.cloudGate(billingOn)).allowed).toBe(false);
  });

  it("blocks when billing is on but no account id can be had", async () => {
    const service = createExplainService({ explainer: { explain: vi.fn() }, db: async () => ({}) as never, userId: async () => null });
    expect(await service.cloudGate(billingOn)).toMatchObject({ allowed: false, allowByPlan: false });
  });

  it("applies the per-browser safety limit to both surfaces and says why", async () => {
    const { service } = setup();
    const now = Date.now();
    stored.set(RATE_KEY, JSON.stringify(Array.from({ length: CLOUD_PER_MINUTE }, (_, i) => now - i)));
    const gate = await service.cloudGate(DEFAULT_SETTINGS);
    expect(gate).toMatchObject({ allowed: false, allowByPlan: true });
    expect(service.blockedMessage(gate)).toBe(gate.rate.ok ? "" : gate.rate.reason);
  });

  it("counts a cloud answer once, and never counts an on-device answer", async () => {
    const cloud = setup("in_cloud");
    const gate = await cloud.service.cloudGate(billingOn);
    await cloud.service.answerText(billingOn, { prompt: "p", mode: "prefer_on_device", gate });
    expect(usage.incrementCloudCalls).toHaveBeenCalledTimes(1);
    expect(JSON.parse(stored.get(RATE_KEY) ?? "[]")).toHaveLength(1);

    usage.incrementCloudCalls.mockClear();
    stored.clear();
    const device = setup("on_device");
    await device.service.answerText(billingOn, { prompt: "p", mode: "prefer_on_device", gate });
    expect(usage.incrementCloudCalls).not.toHaveBeenCalled();
    expect(stored.has(RATE_KEY)).toBe(false);
  });

  it("always sends the fixed education-only system prompt and the two-sided shape", async () => {
    const { service, requests } = setup();
    const gate = await service.cloudGate(DEFAULT_SETTINGS);
    await service.answerText(DEFAULT_SETTINGS, { prompt: "What is a pip?", mode: "only_in_cloud", gate });
    expect(requests[0]).toMatchObject({ prompt: "What is a pip?", mode: "only_in_cloud", shape: "two_sided", cloudModel: DEFAULT_SETTINGS.cloudModel });
    expect(requests[0]?.systemInstruction).toMatch(/educat/i);
  });

  it("never replaces a signed-in account with an anonymous one, and shares one sign-in", async () => {
    const signedIn = { authStateReady: async () => undefined, currentUser: { uid: "Real1" } };
    expect(await createUserId(signedIn as never)()).toBe("Real1");
    expect(signInAnonymously).not.toHaveBeenCalled();

    vi.mocked(signInAnonymously).mockResolvedValue({ user: { uid: "Anon1" } } as never);
    const signedOut = createUserId({ authStateReady: async () => undefined, currentUser: null } as never);
    expect(await Promise.all([signedOut(), signedOut()])).toEqual(["Anon1", "Anon1"]);
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
  });
});

describe("one back end, used by both surfaces", () => {
  const backend = readFileSync("src/platform/web/backend.ts", "utf8");

  it("has the web app start Firebase and ask for answers in the same place", () => {
    for (const file of [backend]) {
      expect(file).toContain("startFirebase(env");
      expect(file).toContain("createExplainService({");
      expect(file).toContain("service.cloudGate(settings)");
      expect(file).toContain("service.answerText(settings, {");
      expect(file).toContain("readRemoteValues(remoteConfig)");
    }
  });

  it("leaves no second copy of the model call, the limit check or the Firebase set-up", () => {
    for (const file of [backend]) {
      expect(file).not.toMatch(/getGenerativeModel|initializeAppCheck|initializeApp\(|allowCloudCall\(|takeCloudSlot|peekCloudSlot|incrementCloudCalls|fetchAndActivate/);
    }
  });
});
