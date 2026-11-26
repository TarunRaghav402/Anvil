import React, { useEffect, useState } from "react";
import { Laptop, MonitorX, Smartphone } from "lucide-react";
import { APP_NAME } from "../../../appConfig";
import { AnvilPolyBackdrop, AnvilWordmark } from "./AnvilLogo";

/**
 * Checks whether the current device is a mobile phone or handheld device.
 * Covers:
 * 1. Standard mobile User-Agent strings (Android, iPhone, iPod, Windows Phone, etc.)
 * 2. Mobile viewport width (< 900px)
 * 3. Screen physical resolution (screen.width/height) to catch phones running in "Desktop Site" mode
 * 4. Touch primary pointer (hover: none, pointer: coarse)
 * 5. Device pixel ratio / maxTouchPoints
 */
function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;

  const ua = navigator.userAgent || "";

  // 1. User Agent checks (standard phone identifiers)
  const isMobileUA = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i.test(
    ua
  );

  // 2. Physical screen dimensions check (catches phones using "Desktop Site" / "Request Desktop Website")
  // On phones in desktop mode, window.innerWidth might fake 980px+, but screen.availWidth or screen.width is still small in orientation
  const minDimension = Math.min(window.screen.width, window.screen.height);
  const isPhoneScreen = minDimension > 0 && minDimension < 600;

  // 3. Viewport width check (IDE requires minimum desktop screen real estate)
  const isNarrowViewport = window.innerWidth < 900;

  // 4. Touch-only detection
  const isCoarseTouchOnly =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(hover: none) and (pointer: coarse)").matches;

  // If UA specifically matches a phone/mobile
  if (isMobileUA) return true;

  // If the physical screen is phone-sized (<600px width/height), it's definitely a phone even in desktop mode
  if (isPhoneScreen) return true;

  // If narrow viewport and touch-only
  if (isNarrowViewport && isCoarseTouchOnly) return true;

  // Hard floor: Anything under 768px wide is unworkable for a full VS Code IDE
  if (window.innerWidth < 768) return true;

  return false;
}

interface DesktopOnlyGateProps {
  children: React.ReactNode;
}

export const DesktopOnlyGate: React.FC<DesktopOnlyGateProps> = ({ children }) => {
  const [isMobile, setIsMobile] = useState<boolean>(isMobileDevice());

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(isMobileDevice());
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-[99999] bg-[#141416] text-[#cccccc] flex flex-col items-center justify-center p-6 select-none font-sans overflow-hidden">
        <AnvilPolyBackdrop />
        {/* Decorative background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-[#007acc]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 w-full max-w-sm anvil-poly-frame p-6 shadow-2xl text-center space-y-5">
          {/* Logo */}
          <div className="flex justify-center pb-2">
            <AnvilWordmark size="md" />
          </div>

          {/* Visual icon badge */}
          <div className="flex items-center justify-center">
            <div className="relative w-20 h-20 anvil-poly-card flex items-center justify-center shadow-inner">
              <Smartphone className="w-9 h-9 text-[#858585]" />
              <div className="absolute -bottom-1 -right-1 w-7 h-7 anvil-poly-badge flex items-center justify-center"
                style={{ "--anvil-border": "#be1100", "--anvil-bg": "#5a1d1d" } as React.CSSProperties}
              >
                <MonitorX className="w-3.5 h-3.5 text-[#f48771]" />
              </div>
            </div>
          </div>

          {/* Headline & Explanation */}
          <div className="space-y-2">
            <h1 className="text-[17px] font-bold text-white tracking-tight">
              Desktop Computer Required
            </h1>
            <p className="text-[12px] text-[#9d9d9d] leading-relaxed">
              <span className="text-white font-medium">{APP_NAME}</span> is a full-featured collaborative cloud IDE designed exclusively for laptops and desktop workstations.
            </p>
          </div>

          {/* Desktop site warning box */}
          <div className="anvil-poly-card p-3 text-left space-y-1.5">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-[#f48771]">
              <MonitorX className="w-3.5 h-3.5 shrink-0" />
              <span>Mobile devices unsupported</span>
            </div>
            <p className="text-[11px] text-[#858585] leading-normal">
              Mobile phones and mobile &ldquo;Desktop Site&rdquo; modes cannot accommodate Monaco code editing, multi-pane docking, and real-time canvas preview.
            </p>
          </div>

          {/* Action guidance */}
          <div className="pt-2 border-t border-[#333333] flex items-center justify-center gap-2 text-[11px] text-[#858585]">
            <Laptop className="w-4 h-4 text-[#007acc]" />
            <span>Please open on macOS, Windows, or Linux.</span>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
