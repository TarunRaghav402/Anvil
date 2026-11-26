import { describe, expect, it } from "vitest";
import { ANVIL_RING_PARTIALS, anvilSound } from "../src/utils/anvilAudio";

describe("Anvil intro strike audio synthesizer", () => {
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
});
