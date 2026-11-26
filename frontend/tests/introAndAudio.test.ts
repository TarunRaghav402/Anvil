import { afterEach, describe, expect, it } from "vitest";
import { ANVIL_RING_PARTIALS, anvilSound, buildAnvilStrikeWavDataUri } from "../src/utils/anvilAudio";

describe("Anvil intro strike audio synthesizer", () => {
  const originalWindow = (globalThis as Record<string, unknown>).window;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      (globalThis as Record<string, unknown>).window = originalWindow;
    }
  });

  it("defines ascending inharmonic metallic ring partials", () => {
    expect(ANVIL_RING_PARTIALS.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < ANVIL_RING_PARTIALS.length; i++) {
      expect(ANVIL_RING_PARTIALS[i]!.ratio).toBeGreaterThan(ANVIL_RING_PARTIALS[i - 1]!.ratio);
      expect(ANVIL_RING_PARTIALS[i]!.decaySec).toBeGreaterThan(0);
    }
  });

  it("degrades gracefully without throwing when Web Audio API is unavailable", async () => {
    expect(anvilSound.isRunning()).toBe(false);
    await expect(anvilSound.unlock()).resolves.toBe(false);
    await expect(anvilSound.playStrike({ intensity: 1.0, baseFreqHz: 660 })).resolves.toBe(false);
  });

  it("does not hang on suspended AudioContext.resume() when autoplay is blocked", async () => {
    class MockBlockedAudioContext {
      state = "suspended";
      resume() {
        // Simulates Chromium keeping resume() pending until a user gesture occurs
        return new Promise<void>(() => {});
      }
    }
    (globalThis as Record<string, unknown>).window = {
      AudioContext: MockBlockedAudioContext,
    };

    const result = await anvilSound.playStrike({ intensity: 1.0, baseFreqHz: 660 });
    expect(result).toBe(false);
  });

  it("encodes valid RIFF WAVE PCM fallback data URI", () => {
    const uri = buildAnvilStrikeWavDataUri(660, 0.2);
    expect(uri.startsWith("data:audio/wav;base64,")).toBe(true);
    const bytes = Buffer.from(uri.slice("data:audio/wav;base64,".length), "base64");
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString("ascii")).toBe("WAVE");
  });
});
