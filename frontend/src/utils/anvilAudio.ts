/**
 * Synthesizes a realistic blacksmith anvil strike using the browser Web Audio API.
 * Gracefully degrades when AudioContext is unavailable or blocked by autoplay policy.
 */

export const ANVIL_RING_PARTIALS = [
  { ratio: 1.0, gain: 0.28, decaySec: 1.35, type: "sine" as OscillatorType, detuneHz: 0 },
  { ratio: 1.58, gain: 0.22, decaySec: 1.15, type: "sine" as OscillatorType, detuneHz: 1.4 },
  { ratio: 2.24, gain: 0.18, decaySec: 0.92, type: "triangle" as OscillatorType, detuneHz: -1.6 },
  { ratio: 2.93, gain: 0.14, decaySec: 0.68, type: "sine" as OscillatorType, detuneHz: 1.8 },
  { ratio: 3.81, gain: 0.09, decaySec: 0.48, type: "sine" as OscillatorType, detuneHz: -1.2 },
  { ratio: 4.74, gain: 0.055, decaySec: 0.3, type: "sine" as OscillatorType, detuneHz: 0.9 },
] as const;

interface WebKitWindow {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

/**
 * Generates an in-memory 16-bit PCM WAV data URI for a metallic anvil strike fallback.
 */
export function buildAnvilStrikeWavDataUri(baseFreqHz = 660, durationSec = 1.1): string {
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) {
      view.setUint8(offset + i, s.charCodeAt(i));
    }
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Fast initial transient + pitch-dropping body + inharmonic metallic ring
    const noiseEnv = t < 0.03 ? Math.exp(-t / 0.008) * Math.sin(2 * Math.PI * 4100 * t) * 0.28 : 0;
    const body = Math.exp(-t / 0.032) * Math.sin(2 * Math.PI * (60 + 120 * Math.exp(-t / 0.02)) * t) * 0.35;
    let ring = 0;
    for (const p of ANVIL_RING_PARTIALS) {
      ring += Math.exp(-t / (p.decaySec * 0.5)) * Math.sin(2 * Math.PI * (baseFreqHz * p.ratio + p.detuneHz) * t) * p.gain;
    }
    const sample = Math.max(-1, Math.min(1, (noiseEnv + body + ring) * 0.72));
    view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
  }

  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  if (typeof btoa === "function") {
    return `data:audio/wav;base64,${btoa(binary)}`;
  }
  return `data:audio/wav;base64,${Buffer.from(bytes).toString("base64")}`;
}

class AnvilSoundEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private wavCache = new Map<number, string>();

  private getAudioContextClass(): typeof AudioContext | null {
    if (typeof window === "undefined") return null;
    const w = window as unknown as WebKitWindow;
    return w.AudioContext ?? w.webkitAudioContext ?? null;
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx && this.ctx.state !== "closed") {
      return this.ctx;
    }
    const Ctx = this.getAudioContextClass();
    if (!Ctx) return null;
    try {
      this.ctx = new Ctx();
      return this.ctx;
    } catch {
      return null;
    }
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const length = Math.floor(ctx.sampleRate * 0.06);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      channel[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  public isRunning(): boolean {
    return this.ctx?.state === "running";
  }

  public async unlock(timeoutMs = 25): Promise<boolean> {
    const ctx = this.ensureContext();
    if (!ctx) return false;
    if (ctx.state === "running") return true;
    if (ctx.state === "suspended") {
      let timerId: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          ctx.resume(),
          new Promise<void>((resolve) => {
            timerId = setTimeout(resolve, timeoutMs);
          }),
        ]);
      } catch {
        return false;
      } finally {
        if (timerId !== undefined) clearTimeout(timerId);
      }
    }
    return (ctx.state as AudioContextState) === "running";
  }

  private async playHtmlAudioFallback(baseFreqHz: number, intensity: number): Promise<boolean> {
    if (typeof Audio === "undefined") return false;
    try {
      let src = this.wavCache.get(baseFreqHz);
      if (!src) {
        src = buildAnvilStrikeWavDataUri(baseFreqHz);
        this.wavCache.set(baseFreqHz, src);
      }
      const audio = new Audio(src);
      audio.volume = Math.min(1, Math.max(0.15, 0.75 * intensity));
      await audio.play();
      return true;
    } catch {
      return false;
    }
  }

  public async playStrike(options?: { intensity?: number; baseFreqHz?: number }): Promise<boolean> {
    const intensity = Math.min(1.2, Math.max(0.2, options?.intensity ?? 1.0));
    const baseFreq = options?.baseFreqHz ?? 660;

    const ready = await this.unlock(25);
    const ctx = this.ctx;
    if (!ready || !ctx || (ctx.state as AudioContextState) !== "running") {
      return this.playHtmlAudioFallback(baseFreq, intensity);
    }

    const now = ctx.currentTime;

    // Dynamics compressor prevents harsh clipping while preserving crisp attack
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-10, now);
    compressor.knee.setValueAtTime(12, now);
    compressor.ratio.setValueAtTime(6, now);
    compressor.attack.setValueAtTime(0.001, now);
    compressor.release.setValueAtTime(0.18, now);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.75 * intensity, now);
    compressor.connect(masterGain);
    masterGain.connect(ctx.destination);

    // 1. Sharp steel-on-steel impact transient (filtered white noise)
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = this.getNoiseBuffer(ctx);
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.setValueAtTime(4200, now);
    noiseFilter.Q.setValueAtTime(4.2, now);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, now);
    noiseGain.gain.linearRampToValueAtTime(0.65, now + 0.0015);
    noiseGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.038);
    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(compressor);
    noiseSrc.start(now);
    noiseSrc.stop(now + 0.05);

    // 2. Heavy iron hammer mass thud (pitch-dropping low sine)
    const bodyOsc = ctx.createOscillator();
    bodyOsc.type = "sine";
    bodyOsc.frequency.setValueAtTime(185, now);
    bodyOsc.frequency.exponentialRampToValueAtTime(56, now + 0.075);
    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.001, now);
    bodyGain.gain.linearRampToValueAtTime(0.55, now + 0.002);
    bodyGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.12);
    bodyOsc.connect(bodyGain);
    bodyGain.connect(compressor);
    bodyOsc.start(now);
    bodyOsc.stop(now + 0.14);

    // 3. Inharmonic forged anvil resonance partials
    for (const partial of ANVIL_RING_PARTIALS) {
      const osc = ctx.createOscillator();
      osc.type = partial.type;
      osc.frequency.setValueAtTime(baseFreq * partial.ratio + partial.detuneHz, now);

      const pGain = ctx.createGain();
      pGain.gain.setValueAtTime(0.0008, now);
      pGain.gain.linearRampToValueAtTime(partial.gain, now + 0.0025);
      pGain.gain.exponentialRampToValueAtTime(0.0008, now + partial.decaySec);

      osc.connect(pGain);
      pGain.connect(compressor);
      osc.start(now);
      osc.stop(now + partial.decaySec + 0.05);
    }

    return true;
  }
}

export const anvilSound = new AnvilSoundEngine();
