import React from "react";
import { APP_NAME } from "../../../appConfig";

interface AnvilWordmarkProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Sharp, flat, text-only SVG wordmark matching VS Code Dark+ aesthetic (no gradients).
 */
export const AnvilWordmark: React.FC<AnvilWordmarkProps> = ({ size = "md", className = "" }) => {
  const dims =
    size === "sm"
      ? { width: 64, height: 18, fontSize: 13 }
      : size === "lg"
      ? { width: 132, height: 34, fontSize: 26 }
      : { width: 88, height: 22, fontSize: 16 };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={dims.width}
      height={dims.height}
      viewBox={`0 0 ${dims.width} ${dims.height}`}
      role="img"
      aria-label={APP_NAME}
      className={`inline-block shrink-0 ${className}`}
    >
      <rect x="0" y={dims.height - 2} width={dims.width} height="2" fill="#007acc" />
      <text
        x="0"
        y={dims.height - 6}
        fill="#cccccc"
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        fontSize={dims.fontSize}
        fontWeight="700"
        letterSpacing="0.06em"
      >
        {APP_NAME.toUpperCase()}
      </text>
    </svg>
  );
};
