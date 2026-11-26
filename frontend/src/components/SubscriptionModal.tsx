import React, { useState } from "react";
import { Check, Crown, Sparkles, X, Zap, Shield, ArrowRight } from "lucide-react";
import type { AnvilUser } from "../types/anvil";
import { resolveUserPlanTier } from "../../../appConfig";
import { api } from "../services/api";

interface SubscriptionModalProps {
  user: AnvilUser;
  isOpen: boolean;
  onClose: () => void;
  onUserUpdated?: (updated: AnvilUser) => void;
}

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({
  user,
  isOpen,
  onClose,
  onUserUpdated,
}) => {
  const [loadingTier, setLoadingTier] = useState<"pro" | "free" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentTier = resolveUserPlanTier(
    { username: user.username, email: user.email },
    user.planTier
  );

  const handleSubscribe = async (tier: "pro" | "free") => {
    setError(null);
    setSuccess(null);
    setLoadingTier(tier);

    try {
      const res = await api.subscribe(tier);
      if (res.user) {
        onUserUpdated?.(res.user);
      }
      setSuccess(
        tier === "pro"
          ? "🎉 Upgraded to Pro Plan ($19/mo)! Full Pro features are now unlocked."
          : "Switched to Free Plan."
      );
      setTimeout(() => {
        setSuccess(null);
      }, 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update subscription.");
    } finally {
      setLoadingTier(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-2xl anvil-poly-frame shadow-2xl flex flex-col">
        {/* Header */}
        <div className="h-11 bg-[#2c2d31]/90 border-b border-[#3c3c3c] px-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-[#a855f7]" />
            <span className="text-[13px] font-semibold text-white tracking-wide">
              Anvil Subscription & Plans
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="anvil-btn anvil-btn-ghost text-[#858585] hover:text-white p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Messages */}
          {success && (
            <div className="flex items-center gap-2 anvil-poly-card anvil-poly-card-success text-[#89d185] px-3.5 py-2.5 text-[12px] animate-in fade-in">
              <Check className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 anvil-poly-card anvil-poly-card-danger text-[#f48771] px-3.5 py-2.5 text-[12px] animate-in fade-in">
              <Shield className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Admin Notice */}
          {currentTier === "admin" && (
            <div className="p-3.5 anvil-poly-card anvil-poly-card-gold flex items-center gap-3 text-[12px]">
              <Crown className="w-5 h-5 text-[#fbbf24] shrink-0" />
              <div>
                <span className="font-semibold text-[#fbbf24]">Master Admin Account: </span>
                <span className="text-[#d4d4d4]">
                  Your account ({user.email}) has permanent administrator privileges and unlimited access across all Anvil features.
                </span>
              </div>
            </div>
          )}

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Free Plan Card */}
            <div
              className={`p-5 anvil-poly-card flex flex-col justify-between ${
                currentTier === "free" ? "anvil-poly-card-cobalt shadow-md" : ""
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[14px] font-bold text-white font-mono">Free Plan</h3>
                  {currentTier === "free" && (
                    <span
                      className="anvil-poly-badge text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 text-[#38bdf8]"
                      style={
                        {
                          "--anvil-border": "rgba(0, 122, 204, 0.55)",
                          "--anvil-bg": "rgba(0, 122, 204, 0.2)",
                        } as React.CSSProperties
                      }
                    >
                      Active
                    </span>
                  )}
                </div>

                <div className="flex items-baseline gap-1 my-3">
                  <span className="text-3xl font-extrabold text-white font-mono">$0</span>
                  <span className="text-[12px] text-[#858585]">/ forever</span>
                </div>

                <p className="text-[12px] text-[#858585] mb-4">
                  Essential cloud editor tools for personal side projects and exploration.
                </p>

                <ul className="space-y-2 text-[12px] text-[#cccccc] mb-6">
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#89d185] shrink-0" />
                    <span>Basic cloud workspace creation</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#89d185] shrink-0" />
                    <span>Live multi-file editor</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#89d185] shrink-0" />
                    <span>In-browser HTML5 live preview</span>
                  </li>
                  <li className="flex items-center gap-2 text-[#777777]">
                    <span className="w-3.5 text-center text-xs">―</span>
                    <span>Community support</span>
                  </li>
                </ul>
              </div>

              <div>
                {currentTier === "free" ? (
                  <button
                    type="button"
                    disabled
                    className="w-full anvil-btn anvil-btn-secondary opacity-75 py-2 px-3 text-[12px] font-medium text-[#858585] cursor-default text-center"
                  >
                    Current Plan
                  </button>
                ) : currentTier === "admin" ? (
                  <button
                    type="button"
                    disabled
                    className="w-full anvil-btn anvil-btn-secondary opacity-75 py-2 px-3 text-[12px] font-medium text-[#858585] cursor-default text-center"
                  >
                    Included in Admin
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSubscribe("free")}
                    disabled={loadingTier !== null}
                    className="w-full anvil-btn anvil-btn-secondary py-2 px-3 text-[12px] font-medium text-[#cccccc] hover:text-white cursor-pointer"
                  >
                    {loadingTier === "free" ? "Switching..." : "Switch to Free"}
                  </button>
                )}
              </div>
            </div>

            {/* Pro Plan Card */}
            <div
              className={`p-5 anvil-poly-card relative flex flex-col justify-between ${
                currentTier === "pro"
                  ? "anvil-poly-card-pro shadow-lg"
                  : "anvil-poly-card-pro-idle"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-[#c084fc]" />
                    <h3 className="text-[14px] font-bold text-white font-mono">Pro Plan</h3>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {currentTier === "pro" ? (
                      <span
                        className="anvil-poly-badge text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 text-[#c084fc]"
                        style={
                          {
                            "--anvil-border": "rgba(168, 85, 247, 0.55)",
                            "--anvil-bg": "rgba(168, 85, 247, 0.2)",
                          } as React.CSSProperties
                        }
                      >
                        Active
                      </span>
                    ) : (
                      <span
                        className="anvil-poly-badge text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 text-white"
                        style={
                          {
                            "--anvil-border": "#c084fc",
                            "--anvil-bg": "linear-gradient(135deg, #7c3aed, #a855f7)",
                          } as React.CSSProperties
                        }
                      >
                        Recommended
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-baseline gap-1 my-3">
                  <span className="text-3xl font-extrabold text-white font-mono">$19</span>
                  <span className="text-[12px] text-[#858585]">/ month</span>
                </div>

                <p className="text-[12px] text-[#b4a0d8] mb-4">
                  Full power collaborative cloud coding suite for ambitious developers.
                </p>

                <ul className="space-y-2 text-[12px] text-[#e2d8f2] mb-6">
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#c084fc] shrink-0" />
                    <span>Unlimited private cloud projects</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#c084fc] shrink-0" />
                    <span>Real-time multi-peer live collaboration</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#c084fc] shrink-0" />
                    <span>Instant Git branch & commit tracking</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#c084fc] shrink-0" />
                    <span>Interactive console & live canvas runner</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#c084fc] shrink-0" />
                    <span>Dedicated Pro badge & premium cloud quota</span>
                  </li>
                </ul>
              </div>

              <div>
                {currentTier === "pro" ? (
                  <div
                    className="anvil-poly-card flex items-center justify-between text-[#e9d5ff] py-2 px-3 text-[12px] font-medium"
                    style={
                      {
                        "--anvil-c": "5px",
                        "--anvil-border": "#7c3aed",
                        "--anvil-bg": "#3b235d",
                      } as React.CSSProperties
                    }
                  >
                    <span className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-[#a855f7]" />
                      Active Pro Subscription
                    </span>
                    <span className="text-[11px] text-[#c084fc]">$19/mo</span>
                  </div>
                ) : currentTier === "admin" ? (
                  <button
                    type="button"
                    disabled
                    className="w-full anvil-btn anvil-btn-secondary opacity-75 py-2 px-3 text-[12px] font-medium text-[#858585] cursor-default text-center"
                  >
                    Included with Admin Tier
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSubscribe("pro")}
                    disabled={loadingTier !== null}
                    className="w-full anvil-btn anvil-btn-pro py-2.5 px-4 text-[13px] font-semibold text-white cursor-pointer flex items-center justify-center gap-2 group"
                  >
                    <Zap className="w-4 h-4 fill-white" />
                    <span>
                      {loadingTier === "pro" ? "Activating Pro..." : "Upgrade to Pro ($19)"}
                    </span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-[#1e1e1e] border-t border-[#3c3c3c] px-6 py-3 flex items-center justify-between text-[11px] text-[#858585]">
          <span>Cancel or switch plans anytime. Billed monthly.</span>
          <button
            type="button"
            onClick={onClose}
            className="anvil-btn anvil-btn-sm anvil-btn-secondary text-white px-4 py-1.5 text-[12px] font-medium cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
