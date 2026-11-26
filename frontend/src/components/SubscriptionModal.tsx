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
      <div className="w-full max-w-2xl bg-[#252526] border border-[#3c3c3c] shadow-2xl rounded-sm overflow-hidden flex flex-col">
        {/* Header */}
        <div className="h-11 bg-[#2d2d2d] border-b border-[#3c3c3c] px-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-[#a855f7]" />
            <span className="text-[13px] font-semibold text-white tracking-wide">
              Anvil Subscription & Plans
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#858585] hover:text-white p-1 hover:bg-[#3c3c3c] rounded transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Messages */}
          {success && (
            <div className="flex items-center gap-2 bg-[#1b3a2b] border border-[#2ea043] text-[#89d185] px-3.5 py-2.5 text-[12px] rounded-xs animate-in fade-in">
              <Check className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-[#5a1d1d] border border-[#be1100] text-[#f48771] px-3.5 py-2.5 text-[12px] rounded-xs animate-in fade-in">
              <Shield className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Admin Notice */}
          {currentTier === "admin" && (
            <div className="p-3.5 bg-gradient-to-r from-[#d97706]/15 via-[#f59e0b]/10 to-transparent border border-[#f59e0b]/40 rounded-xs flex items-center gap-3 text-[12px]">
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
              className={`p-5 rounded-xs border flex flex-col justify-between transition-all ${
                currentTier === "free"
                  ? "bg-[#1f2428] border-[#007acc] ring-1 ring-[#007acc]/40 shadow-md"
                  : "bg-[#1e1e1e] border-[#333333] hover:border-[#444444]"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[14px] font-bold text-white font-mono">Free Plan</h3>
                  {currentTier === "free" && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#007acc]/20 text-[#38bdf8] border border-[#007acc]/40">
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
                    className="w-full py-2 px-3 text-[12px] font-medium rounded-xs bg-[#2a2d2e] border border-[#3c3c3c] text-[#858585] cursor-default text-center"
                  >
                    Current Plan
                  </button>
                ) : currentTier === "admin" ? (
                  <button
                    type="button"
                    disabled
                    className="w-full py-2 px-3 text-[12px] font-medium rounded-xs bg-[#2a2d2e] border border-[#3c3c3c] text-[#858585] cursor-default text-center"
                  >
                    Included in Admin
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSubscribe("free")}
                    disabled={loadingTier !== null}
                    className="w-full py-2 px-3 text-[12px] font-medium rounded-xs bg-[#2d2d2d] hover:bg-[#3c3c3c] text-[#cccccc] hover:text-white border border-[#3c3c3c] transition-colors cursor-pointer"
                  >
                    {loadingTier === "free" ? "Switching..." : "Switch to Free"}
                  </button>
                )}
              </div>
            </div>

            {/* Pro Plan Card */}
            <div
              className={`p-5 rounded-xs border relative flex flex-col justify-between transition-all ${
                currentTier === "pro"
                  ? "bg-[#251e33] border-[#a855f7] ring-1 ring-[#a855f7]/50 shadow-lg"
                  : "bg-gradient-to-b from-[#201d2a] to-[#1e1e1e] border-[#5b21b6]/60 hover:border-[#a855f7]"
              }`}
            >
              {/* Popular badge */}
              <div className="absolute -top-2.5 right-4 bg-gradient-to-r from-[#7c3aed] to-[#a855f7] text-white text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-md">
                RECOMMENDED
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-[#c084fc]" />
                    <h3 className="text-[14px] font-bold text-white font-mono">Pro Plan</h3>
                  </div>
                  {currentTier === "pro" && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#a855f7]/20 text-[#c084fc] border border-[#a855f7]/40">
                      Active
                    </span>
                  )}
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
                  <div className="flex items-center justify-between bg-[#3b235d] border border-[#7c3aed] text-[#e9d5ff] py-2 px-3 rounded-xs text-[12px] font-medium">
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
                    className="w-full py-2 px-3 text-[12px] font-medium rounded-xs bg-[#2a2d2e] border border-[#3c3c3c] text-[#858585] cursor-default text-center"
                  >
                    Included with Admin Tier
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSubscribe("pro")}
                    disabled={loadingTier !== null}
                    className="w-full py-2.5 px-4 text-[13px] font-semibold rounded-xs bg-gradient-to-r from-[#7c3aed] to-[#9333ea] hover:from-[#6d28d9] hover:to-[#7e22ce] text-white shadow-md hover:shadow-lg transition-all duration-150 cursor-pointer flex items-center justify-center gap-2 group active:scale-98"
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
            className="bg-[#2d2d2d] hover:bg-[#3c3c3c] text-white px-4 py-1.5 text-[12px] font-medium rounded transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
