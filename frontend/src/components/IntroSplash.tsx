import React, { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { APP_NAME, APP_TAGLINE } from "../../../appConfig";
import { anvilSound } from "../utils/anvilAudio";

interface IntroSplashProps {
  /** Whether background Firebase auth & profile sync has settled */
  authReady: boolean;
  /** Called once the intro fade-out finishes and the overlay can unmount */
  onFinish: () => void;
}

interface SparkSpec {
  id: string;
  tx: number;
  ty: number;
  color: string;
  size: number;
}

const SPARKS_STRIKE_1: SparkSpec[] = [
  { id: "s1-a", tx: -58, ty: -42, color: "#4ec9b0", size: 4 },
  { id: "s1-b", tx: -34, ty: -56, color: "#dcdcaa", size: 3.5 },
  { id: "s1-c", tx: -10, ty: -62, color: "#9cdcfe", size: 3 },
  { id: "s1-d", tx: 22, ty: -54, color: "#4ec9b0", size: 4 },
  { id: "s1-e", tx: 48, ty: -44, color: "#dcdcaa", size: 3.5 },
  { id: "s1-f", tx: 62, ty: -22, color: "#ffffff", size: 2.5 },
  { id: "s1-g", tx: -66, ty: -18, color: "#9cdcfe", size: 3 },
];

const SPARKS_STRIKE_2: SparkSpec[] = [
  { id: "s2-a", tx: -72, ty: -48, color: "#dcdcaa", size: 4.5 },
  { id: "s2-b", tx: -46, ty: -68, color: "#4ec9b0", size: 4 },
  { id: "s2-c", tx: -18, ty: -74, color: "#ffffff", size: 3.5 },
  { id: "s2-d", tx: 16, ty: -70, color: "#4ec9b0", size: 4.5 },
  { id: "s2-e", tx: 46, ty: -58, color: "#9cdcfe", size: 4 },
  { id: "s2-f", tx: 74, ty: -38, color: "#dcdcaa", size: 4 },
  { id: "s2-g", tx: -78, ty: -24, color: "#4ec9b0", size: 3 },
  { id: "s2-h", tx: 68, ty: -14, color: "#ffffff", size: 3 },
];

const STRIKE_1_MS = 765;
const STRIKE_2_MS = 1300;
const INTRO_HOLD_MS = 2250;
const FADE_OUT_MS = 450;

export const IntroSplash: React.FC<IntroSplashProps> = ({ authReady, onFinish }) => {
  const [strikePhase, setStrikePhase] = useState<0 | 1 | 2>(0);
  const [animComplete, setAnimComplete] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const [muted, setMuted] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);

  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const finishedOnceRef = useRef(false);

  const triggerStrikeSound = useCallback((intensity: number, baseFreqHz: number) => {
    if (mutedRef.current) return;
    void anvilSound.playStrike({ intensity, baseFreqHz }).then((played) => {
      if (!played && !mutedRef.current) {
        setAudioBlocked(true);
      } else if (played) {
        setAudioBlocked(false);
      }
    });
  }, []);

  // Attempt Web Audio unlock smoothly on initial mount and on any user gesture
  useEffect(() => {
    void anvilSound.unlock().then((ok) => {
      if (!ok && !mutedRef.current) {
        setAudioBlocked(true);
      }
    });

    const handleUnlockGesture = () => {
      if (mutedRef.current) return;
      void anvilSound.unlock().then((ok) => {
        if (ok) {
          setAudioBlocked(false);
        }
      });
    };

    window.addEventListener("pointerdown", handleUnlockGesture, { once: true });
    window.addEventListener("keydown", handleUnlockGesture, { once: true });
    return () => {
      window.removeEventListener("pointerdown", handleUnlockGesture);
      window.removeEventListener("keydown", handleUnlockGesture);
    };
  }, []);

  // Schedule synchronized strike impacts, sound, and animation end
  useEffect(() => {
    const t1 = window.setTimeout(() => {
      setStrikePhase(1);
      triggerStrikeSound(0.85, 620);
    }, STRIKE_1_MS);

    const t2 = window.setTimeout(() => {
      setStrikePhase(2);
      triggerStrikeSound(1.0, 698);
    }, STRIKE_2_MS);

    const tDone = window.setTimeout(() => {
      setAnimComplete(true);
    }, INTRO_HOLD_MS);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(tDone);
    };
  }, [triggerStrikeSound]);

  // Begin smooth fade-out once BOTH animation completes (or skipped) and auth state is ready
  useEffect(() => {
    if (!animComplete || !authReady) return;
    setFadingOut(true);

    const tFinish = window.setTimeout(() => {
      if (!finishedOnceRef.current) {
        finishedOnceRef.current = true;
        onFinishRef.current();
      }
    }, FADE_OUT_MS);

    return () => {
      window.clearTimeout(tFinish);
    };
  }, [animComplete, authReady]);

  const handleSkip = useCallback(() => {
    setAnimComplete(true);
  }, []);

  // Allow pressing Escape / Enter / Space to skip immediately
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleSkip();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSkip]);

  const handleToggleSound = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (!nextMuted) {
      const unlocked = await anvilSound.unlock(250);
      if (unlocked) {
        setAudioBlocked(false);
        void anvilSound.playStrike({ intensity: 0.75, baseFreqHz: 698 });
      }
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Loading ${APP_NAME}`}
      className={`fixed inset-0 z-[100] bg-[#1e1e1e] text-[#cccccc] flex flex-col items-center justify-center overflow-hidden select-none transition-opacity duration-500 ease-out ${
        fadingOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* Top VS Code Cobalt accent bar */}
      <div className="fixed top-0 left-0 right-0 h-[3px] bg-[#007acc]" />

      {/* Subtle architectural dark grid + cobalt forge glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(to right, #2b2b2e 1px, transparent 1px), linear-gradient(to bottom, #2b2b2e 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="pointer-events-none absolute w-[420px] h-[220px] rounded-full bg-[#007acc]/12 blur-3xl -translate-y-6" />

      {/* Central Animated Stage */}
      <div className="relative flex flex-col items-center anvil-scene-enter px-6">
        <div className="w-[340px] max-w-[86vw]">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 360 220"
            className="w-full h-auto overflow-visible"
            role="img"
            aria-label="Anvil and Hammer Intro Animation"
          >
            {/* Floor pedestal shadow */}
            <ellipse cx="176" cy="186" rx="92" ry="7" fill="#121214" />

            {/* Concentric Shockwave Rings triggered on Beat 1 & Beat 2 */}
            {strikePhase >= 1 && (
              <circle
                key="shock-1"
                cx="178"
                cy="118"
                r="24"
                fill="none"
                stroke="#4ec9b0"
                strokeWidth="2.5"
                className="anvil-shockwave-ring"
              />
            )}
            {strikePhase >= 2 && (
              <circle
                key="shock-2"
                cx="178"
                cy="118"
                r="28"
                fill="none"
                stroke="#007acc"
                strokeWidth="3"
                className="anvil-shockwave-ring"
              />
            )}

            {/* Anvil Group with Impact Recoil */}
            <g className="anvil-body-recoil">
              {/* Left Tapered Horn */}
              <polygon points="74,122 126,118 126,144 96,141" fill="#9cdcfe" />

              {/* Forged Steel Deck */}
              <polygon points="126,118 242,118 225,146 126,146" fill="#e6edf3" />

              {/* Subtle Under-bevel */}
              <polygon points="126,146 218,146 205,154 134,154" fill="#9ca3af" />

              {/* Tapered Throat Column */}
              <polygon points="140,154 198,154 190,170 148,170" fill="#6e7681" />

              {/* Heavy Cobalt Plinth Base */}
              <polygon points="118,170 220,170 236,184 102,184" fill="#007acc" />
              <polygon points="122,170 216,170 221,175 117,175" fill="#38bdf8" />

              {/* Impact Flash Strip on Anvil Deck */}
              {strikePhase === 1 && (
                <rect
                  key="flash-1"
                  x="130"
                  y="117"
                  width="96"
                  height="4"
                  fill="#4ec9b0"
                  className="anvil-impact-flash"
                />
              )}
              {strikePhase === 2 && (
                <rect
                  key="flash-2"
                  x="126"
                  y="117"
                  width="110"
                  height="5"
                  fill="#ffffff"
                  className="anvil-impact-flash"
                />
              )}
            </g>

            {/* Radial Forging Sparks */}
            {strikePhase >= 1 &&
              SPARKS_STRIKE_1.map((s) => (
                <rect
                  key={s.id}
                  x={178 - s.size / 2}
                  y={116 - s.size / 2}
                  width={s.size}
                  height={s.size}
                  fill={s.color}
                  className="anvil-spark"
                  style={
                    {
                      "--tx": `${s.tx}px`,
                      "--ty": `${s.ty}px`,
                    } as React.CSSProperties
                  }
                />
              ))}

            {strikePhase >= 2 &&
              SPARKS_STRIKE_2.map((s) => (
                <rect
                  key={s.id}
                  x={178 - s.size / 2}
                  y={116 - s.size / 2}
                  width={s.size}
                  height={s.size}
                  fill={s.color}
                  className="anvil-spark"
                  style={
                    {
                      "--tx": `${s.tx}px`,
                      "--ty": `${s.ty}px`,
                    } as React.CSSProperties
                  }
                />
              ))}

            {/* Forging Hammer pivoting onto deck center (178, 118) */}
            <g className="anvil-hammer-arm">
              {/* Handle */}
              <rect x="174" y="96" width="124" height="10" rx="2" fill="#ce9178" />
              <rect x="256" y="94.5" width="40" height="13" rx="2" fill="#3c3c3c" />
              {/* Steel Collar */}
              <rect x="170" y="93" width="12" height="16" fill="#858585" />
              {/* Sculpted Hammer Head (bottom face rests cleanly at y=118 on 0deg) */}
              <polygon points="154,72 194,72 198,118 158,118" fill="#e6edf3" />
              {/* Striking Face Cap */}
              <rect x="158" y="112" width="40" height="6" fill="#4ec9b0" />
              {/* Top Chamfer */}
              <polygon points="154,72 194,72 190,79 158,79" fill="#9cdcfe" />
            </g>
          </svg>
        </div>

        {/* Brand Wordmark & Loading Progress */}
        <div className="flex flex-col items-center mt-1 space-y-2.5 text-center">
          <div
            className={`text-[30px] font-extrabold text-white tracking-[0.24em] pl-[0.24em] ${
              strikePhase >= 2 ? "anvil-wordmark-enter" : "opacity-90"
            }`}
          >
            {APP_NAME.toUpperCase()}
          </div>

          <div className="text-[11px] uppercase tracking-[0.22em] text-[#9cdcfe]">
            {APP_TAGLINE}
          </div>

          <div className="w-52 h-[2px] bg-[#2d2d30] overflow-hidden mt-2">
            <div
              className="h-full bg-[#007acc] anvil-progress-bar"
              style={animComplete && !authReady ? { width: "96%" } : undefined}
            />
          </div>

          <div className="h-4 text-[11px] text-[#858585] font-mono">
            {animComplete && !authReady ? "Connecting to workspace..." : "\u00A0"}
          </div>
        </div>
      </div>

      {/* Bottom-right Audio & Skip Controls */}
      <div className="fixed bottom-5 right-5 flex items-center gap-2">
        <button
          type="button"
          onClick={(e) => void handleToggleSound(e)}
          title={muted ? "Unmute strike sound" : audioBlocked ? "Enable forge sound" : "Mute strike sound"}
          className={`anvil-btn anvil-btn-sm px-2.5 py-1.5 text-[11px] flex items-center gap-1.5 cursor-pointer ${
            audioBlocked && !muted
              ? "anvil-btn-active text-[#9cdcfe] hover:text-white"
              : "anvil-btn-secondary text-[#9d9d9d] hover:text-white"
          }`}
        >
          {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          <span>
            {muted ? "Muted" : audioBlocked ? "Tap for Sound" : "Sound On"}
          </span>
        </button>

        <button
          type="button"
          onClick={handleSkip}
          className="anvil-btn anvil-btn-sm anvil-btn-secondary px-3 py-1.5 text-[11px] text-[#cccccc] hover:text-white cursor-pointer"
        >
          Skip
        </button>
      </div>
    </div>
  );
};
