import React from "react";
import { APP_NAME } from "../../../appConfig";

interface AnvilWordmarkProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  showMark?: boolean;
}

/**
 * Compact faceted low-poly Anvil glyph matching the forged anvil hero polygons.
 */
export const AnvilMark: React.FC<{ className?: string }> = ({ className = "w-5 h-4" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 40 24"
    className={`inline-block shrink-0 ${className}`}
    aria-hidden="true"
  >
    {/* Left tapered horn */}
    <polygon points="1,6 13,4.5 13,11.5 6.5,10.5" fill="#9cdcfe" />
    {/* Forged top steel deck */}
    <polygon points="13,4.5 38,4.5 34.5,11.8 13,11.8" fill="#e6edf3" />
    {/* Under-bevel shadow facet */}
    <polygon points="13,11.8 33,11.8 30,14.5 15,14.5" fill="#9ca3af" />
    {/* Tapered throat */}
    <polygon points="16.5,14.5 28.5,14.5 27,18.5 18,18.5" fill="#6e7681" />
    {/* Cobalt base plinth */}
    <polygon points="12,18.5 33,18.5 36.5,22.5 8.5,22.5" fill="#007acc" />
    {/* Plinth top highlight facet */}
    <polygon points="12.5,18.5 32.5,18.5 33.8,20 11.2,20" fill="#38bdf8" />
  </svg>
);

/**
 * Low-poly architectural Anvil wordmark pairing the faceted forge icon
 * with crisp geometric typography and an angled cobalt underline.
 */
export const AnvilWordmark: React.FC<AnvilWordmarkProps> = ({
  size = "md",
  className = "",
  showMark = true,
}) => {
  const iconDims =
    size === "sm"
      ? "w-[22px] h-[13px]"
      : size === "lg"
      ? "w-[40px] h-[24px]"
      : "w-[28px] h-[17px]";

  const textDims =
    size === "sm"
      ? { width: 58, height: 18, fontSize: 12.5 }
      : size === "lg"
      ? { width: 124, height: 34, fontSize: 25 }
      : { width: 78, height: 22, fontSize: 15.5 };

  return (
    <span className={`inline-flex items-center gap-1.5 shrink-0 ${className}`}>
      {showMark && <AnvilMark className={iconDims} />}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={textDims.width}
        height={textDims.height}
        viewBox={`0 0 ${textDims.width} ${textDims.height}`}
        role="img"
        aria-label={APP_NAME}
        className="inline-block shrink-0"
      >
        {/* Chamfered low-poly underline accent */}
        <polygon
          points={`0,${textDims.height - 2} ${textDims.width - 4},${textDims.height - 2} ${textDims.width},${textDims.height} 2,${textDims.height}`}
          fill="#007acc"
        />
        <text
          x="0"
          y={textDims.height - 5.5}
          fill="#e2e5ea"
          fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          fontSize={textDims.fontSize}
          fontWeight="700"
          letterSpacing="0.08em"
        >
          {APP_NAME.toUpperCase()}
        </text>
      </svg>
    </span>
  );
};

/**
 * Restrained ~20% low-poly background geometry backdrop for Auth, Lobby, and Gates.
 * Large, low-contrast matte dark-steel triangular facets with crisp faint seams.
 */
export const AnvilPolyBackdrop: React.FC = () => (
  <div className="pointer-events-none fixed inset-0 overflow-hidden z-0 select-none">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      className="w-full h-full opacity-90"
      aria-hidden="true"
    >
      {/* Subtle low-contrast matte dark-steel polygon planes */}
      <polygon points="0,0 520,0 340,340 0,240" fill="#212226" opacity="0.45" />
      <polygon points="520,0 980,0 740,280 340,340" fill="#1b1c1f" opacity="0.55" />
      <polygon points="980,0 1440,0 1440,310 1120,240 740,280" fill="#22242a" opacity="0.42" />
      <polygon points="0,240 340,340 210,640 0,580" fill="#1a1b1e" opacity="0.5" />
      <polygon points="340,340 740,280 620,610 210,640" fill="#202125" opacity="0.35" />
      <polygon points="740,280 1120,240 1050,590 620,610" fill="#1c1e23" opacity="0.48" />
      <polygon points="1120,240 1440,310 1440,680 1050,590" fill="#212328" opacity="0.38" />
      <polygon points="0,580 210,640 430,900 0,900" fill="#1f2024" opacity="0.42" />
      <polygon points="210,640 620,610 790,900 430,900" fill="#191a1d" opacity="0.52" />
      <polygon points="620,610 1050,590 1180,900 790,900" fill="#212328" opacity="0.36" />
      <polygon points="1050,590 1440,680 1440,900 1180,900" fill="#1b1d21" opacity="0.48" />

      {/* Crisp minimal cobalt structural ridge lines (~12% opacity) */}
      <polyline
        points="0,240 340,340 740,280 1120,240 1440,310"
        fill="none"
        stroke="#007acc"
        strokeWidth="1"
        opacity="0.14"
      />
      <polyline
        points="210,640 620,610 1050,590 1440,680"
        fill="none"
        stroke="#38bdf8"
        strokeWidth="1"
        opacity="0.09"
      />
      <line x1="520" y1="0" x2="340" y2="340" stroke="#ffffff" strokeWidth="1" opacity="0.035" />
      <line x1="740" y1="280" x2="620" y2="610" stroke="#ffffff" strokeWidth="1" opacity="0.035" />
      <line x1="1120" y1="240" x2="1050" y2="590" stroke="#ffffff" strokeWidth="1" opacity="0.035" />
    </svg>
  </div>
);
