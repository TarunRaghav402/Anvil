import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Copy,
  Crown,
  CreditCard,
  Edit2,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  Save,
  Shield,
  Sparkles,
  User,
  Zap,
  X,
} from "lucide-react";
import type { AnvilUser } from "../types/anvil";
import { resolveUserPlanTier } from "../../../appConfig";
import { api } from "../services/api";
import { SubscriptionModal } from "./SubscriptionModal";

interface UserProfileMenuProps {
  user: AnvilUser;
  onSignOut: () => Promise<void>;
  onUserUpdated?: (updated: AnvilUser) => void;
  compact?: boolean;
}

export const UserProfileMenu: React.FC<UserProfileMenuProps> = ({
  user,
  onSignOut,
  onUserUpdated,
  compact = false,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Edit Mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editUsername, setEditUsername] = useState(user.username);
  const [editRole, setEditRole] = useState(user.role || "Developer");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);

  // Sync edit fields if user prop changes
  useEffect(() => {
    setEditUsername(user.username);
    setEditRole(user.role || "Developer");
  }, [user.username, user.role]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownOpen]);

  const copyUserId = () => {
    void navigator.clipboard.writeText(user.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);
    setEditSuccess(null);

    const cleanUser = editUsername.trim();
    const cleanRole = editRole.trim();

    if (!cleanUser) {
      setEditError("Username cannot be empty.");
      return;
    }
    if (cleanUser.length < 3 || cleanUser.length > 30) {
      setEditError("Username must be between 3 and 30 characters.");
      return;
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(cleanUser)) {
      setEditError("Username can only contain letters, numbers, underscores, and hyphens.");
      return;
    }

    if (cleanUser === user.username && cleanRole === (user.role || "Developer")) {
      setIsEditing(false);
      return;
    }

    setSaving(true);
    try {
      const res = await api.updateProfile({ username: cleanUser, role: cleanRole });
      if (res.user) {
        onUserUpdated?.(res.user);
      }
      setEditSuccess("Profile saved and updated in Firebase!");
      setIsEditing(false);
      setTimeout(() => setEditSuccess(null), 3000);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  const initials = user.username.slice(0, 2).toUpperCase() || "AN";
  const tier = resolveUserPlanTier({ username: user.username, email: user.email }, user.planTier);

  const renderTierBadge = (size: "sm" | "md" = "sm") => {
    if (tier === "admin") {
      return (
        <span
          className={`anvil-poly-badge inline-flex items-center gap-1 font-bold uppercase tracking-wider text-[#fbbf24] ${
            size === "sm" ? "text-[9px] px-2 py-0.5" : "text-[10px] px-2.5 py-0.5"
          }`}
          style={
            {
              "--anvil-border": "rgba(245, 158, 11, 0.55)",
              "--anvil-bg": "linear-gradient(135deg, rgba(217, 119, 6, 0.25), rgba(245, 158, 11, 0.14))",
            } as React.CSSProperties
          }
          title="Admin - Full Unlimited Workspace Access"
        >
          <Crown className={size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3"} />
          Admin
        </span>
      );
    }
    if (tier === "pro") {
      return (
        <span
          className={`anvil-poly-badge inline-flex items-center gap-1 font-bold uppercase tracking-wider text-[#c084fc] ${
            size === "sm" ? "text-[9px] px-2 py-0.5" : "text-[10px] px-2.5 py-0.5"
          }`}
          style={
            {
              "--anvil-border": "rgba(168, 85, 247, 0.55)",
              "--anvil-bg": "linear-gradient(135deg, rgba(124, 58, 237, 0.25), rgba(168, 85, 247, 0.14))",
            } as React.CSSProperties
          }
          title="Pro Member"
        >
          <Zap className={size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3"} />
          Pro
        </span>
      );
    }
    return (
      <span
        className={`anvil-poly-badge inline-flex items-center gap-1 font-medium uppercase tracking-wider text-[#a3a3a3] ${
          size === "sm" ? "text-[9px] px-2 py-0.5" : "text-[10px] px-2.5 py-0.5"
        }`}
        title="Basic Plan"
      >
        Free
      </span>
    );
  };

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen((prev) => !prev)}
          className={`anvil-btn anvil-btn-sm flex items-center gap-2 px-2.5 py-1 cursor-pointer ${
            dropdownOpen
              ? "anvil-btn-active text-white"
              : "anvil-btn-ghost text-[#cccccc] hover:text-white"
          }`}
          title="Account & Profile"
        >
          {/* Faceted Avatar Icon */}
          <div
            className="w-5 h-5 anvil-poly-badge text-white font-mono text-[10px] font-bold flex items-center justify-center"
            style={
              {
                "--anvil-c": "4px",
                "--anvil-border": "#4fc1ff",
                "--anvil-bg": "linear-gradient(135deg, #279ff0 0%, #007acc 55%, #005b99 100%)",
              } as React.CSSProperties
            }
          >
            {initials}
          </div>

          {!compact && (
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-mono tracking-tight font-medium max-w-[120px] truncate">
                {user.username}
              </span>
              {renderTierBadge("sm")}
            </div>
          )}

          <ChevronDown
            className={`w-3 h-3 text-[#858585] transition-transform duration-200 ${
              dropdownOpen ? "rotate-180 text-white" : ""
            }`}
          />
        </button>

        {/* Dropdown Menu */}
        {dropdownOpen && (
          <div
            className="absolute right-0 mt-1.5 w-60 anvil-poly-frame shadow-2xl py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
            style={{ "--anvil-c": "8px" } as React.CSSProperties}
          >
            {/* Header snippet */}
            <div className="px-3.5 py-2.5 border-b border-[#333333] flex items-center gap-2.5 bg-[#2a2d2e]/40">
              <div
                className="w-8 h-8 anvil-poly-badge text-white font-mono text-xs font-bold flex items-center justify-center shrink-0"
                style={
                  {
                    "--anvil-c": "5px",
                    "--anvil-border": "#4fc1ff",
                    "--anvil-bg": "linear-gradient(135deg, #279ff0 0%, #007acc 55%, #005b99 100%)",
                  } as React.CSSProperties
                }
              >
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="text-[13px] font-semibold text-white truncate font-mono">
                    {user.username}
                  </div>
                  {renderTierBadge("sm")}
                </div>
                <div className="text-[11px] text-[#858585] truncate font-sans">
                  {user.email}
                </div>
              </div>
            </div>

            {/* Menu Items */}
            <div className="py-1">
              <button
                type="button"
                onClick={() => {
                  setDropdownOpen(false);
                  setIsEditing(false);
                  setEditError(null);
                  setModalOpen(true);
                }}
                className="w-full px-3.5 py-1.5 text-left text-[12px] text-[#cccccc] hover:text-white hover:bg-[#094771] flex items-center gap-2.5 transition-colors cursor-pointer group"
              >
                <User className="w-3.5 h-3.5 text-[#007acc] group-hover:text-white transition-colors" />
                <span>Profile Details</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setDropdownOpen(false);
                  setIsEditing(true);
                  setEditError(null);
                  setModalOpen(true);
                }}
                className="w-full px-3.5 py-1.5 text-left text-[12px] text-[#cccccc] hover:text-white hover:bg-[#094771] flex items-center gap-2.5 transition-colors cursor-pointer group"
              >
                <Edit2 className="w-3.5 h-3.5 text-[#9cdcfe] group-hover:text-white transition-colors" />
                <span>Edit Profile</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setDropdownOpen(false);
                  setSubscriptionOpen(true);
                }}
                className="w-full px-3.5 py-1.5 text-left text-[12px] text-[#cccccc] hover:text-white hover:bg-[#094771] flex items-center justify-between transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <CreditCard className="w-3.5 h-3.5 text-[#c084fc] group-hover:text-white transition-colors" />
                  <span>Subscription & Plans</span>
                </div>
                {tier === "free" && (
                  <span
                    className="anvil-poly-badge text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 text-[#c084fc]"
                    style={
                      {
                        "--anvil-border": "rgba(168, 85, 247, 0.45)",
                        "--anvil-bg": "rgba(124, 58, 237, 0.22)",
                      } as React.CSSProperties
                    }
                  >
                    $19/mo
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={copyUserId}
                className="w-full px-3.5 py-1.5 text-left text-[12px] text-[#cccccc] hover:text-white hover:bg-[#094771] flex items-center justify-between transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <KeyRound className="w-3.5 h-3.5 text-[#858585] group-hover:text-white transition-colors" />
                  <span>Copy User ID</span>
                </div>
                {copiedId ? (
                  <Check className="w-3.5 h-3.5 text-[#89d185]" />
                ) : (
                  <Copy className="w-3 h-3 text-[#666666] group-hover:text-white transition-colors" />
                )}
              </button>
            </div>

            <div className="border-t border-[#333333] my-1" />

            {/* Sign out */}
            <button
              type="button"
              onClick={async () => {
                setDropdownOpen(false);
                await onSignOut();
              }}
              className="w-full px-3.5 py-2 text-left text-[12px] text-[#f48771] hover:text-white hover:bg-[#722020] flex items-center gap-2.5 transition-colors cursor-pointer group"
            >
              <LogOut className="w-3.5 h-3.5 text-[#f48771] group-hover:text-white transition-colors" />
              <span>Sign Out</span>
            </button>
          </div>
        )}
      </div>

      {/* Profile Details & Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md anvil-poly-frame shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="h-10 bg-[#2d2e32]/90 border-b border-[#3c3c3c] px-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#007acc]" />
                <span className="text-[13px] font-semibold text-white tracking-wide">
                  {isEditing ? "Edit Profile Details" : "Account & Profile"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  setIsEditing(false);
                }}
                className="anvil-btn anvil-btn-ghost text-[#858585] hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {editSuccess && (
                <div className="flex items-center gap-2 anvil-poly-card anvil-poly-card-success text-[#89d185] px-3 py-2 text-[12px] animate-in fade-in">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{editSuccess}</span>
                </div>
              )}

              {editError && (
                <div className="flex items-start gap-2 anvil-poly-card anvil-poly-card-danger text-[#f48771] px-3 py-2 text-[12px] animate-in fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{editError}</span>
                </div>
              )}

              {/* Profile Card Header */}
              <div className="flex items-center gap-4 p-3.5 anvil-poly-card">
                <div
                  className="w-14 h-14 anvil-poly-badge text-white font-mono text-xl font-bold flex items-center justify-center shadow-lg shrink-0"
                  style={
                    {
                      "--anvil-c": "8px",
                      "--anvil-border": "#4fc1ff",
                      "--anvil-bg": "linear-gradient(135deg, #279ff0 0%, #007acc 55%, #005b99 100%)",
                    } as React.CSSProperties
                  }
                >
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[16px] font-bold text-white font-mono truncate">
                      {user.username}
                    </span>
                    {renderTierBadge("md")}
                  </div>
                  <div className="flex items-center gap-1.5 text-[12px] text-[#858585] mt-1 truncate">
                    <Mail className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </div>
                </div>
              </div>

              {/* Edit Form or View Form */}
              {isEditing ? (
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider font-semibold text-[#858585] mb-1">
                      Username (Editable)
                    </label>
                    <input
                      type="text"
                      required
                      minLength={3}
                      maxLength={30}
                      value={editUsername}
                      onChange={(e) => setEditUsername(e.target.value)}
                      placeholder="Enter new username"
                      className="w-full bg-[#1e1e1e] border border-[#3c3c3c] focus:border-[#007acc] focus:ring-1 focus:ring-[#007acc] focus:outline-none px-3.5 py-2 text-[13px] text-white font-mono transition-colors"
                    />
                    <span className="text-[10px] text-[#858585] mt-1 block">
                      Syncs across Firebase Authentication and PostgreSQL database.
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] uppercase tracking-wider font-semibold text-[#858585]">
                        Email Address (Read-Only)
                      </label>
                      <span className="text-[10px] text-[#e5a50a] flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Cannot be changed
                      </span>
                    </div>
                    <input
                      type="email"
                      readOnly
                      disabled
                      value={user.email}
                      className="w-full bg-[#2a2a2a]/60 border border-[#333333] px-3.5 py-2 text-[13px] text-[#888888] font-mono cursor-not-allowed select-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase tracking-wider font-semibold text-[#858585] mb-1">
                      Workspace Role (Editable)
                    </label>
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value)}
                      className="w-full bg-[#1e1e1e] border border-[#3c3c3c] focus:border-[#007acc] focus:ring-1 focus:ring-[#007acc] focus:outline-none px-3.5 py-2 text-[13px] text-white font-sans transition-colors cursor-pointer"
                    >
                      <option value="Lead Developer">Lead Developer</option>
                      <option value="Developer">Developer</option>
                      <option value="Designer">Designer</option>
                      <option value="Product Architect">Product Architect</option>
                      <option value="Game Engineer">Game Engineer</option>
                      <option value="Animator">Animator</option>
                      <option value="QA / Tester">QA / Tester</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase tracking-wider font-semibold text-[#858585] mb-1">
                      Account Tier / Status
                    </label>
                    <div className="p-2.5 anvil-poly-card flex items-center justify-between text-[12px]">
                      <span className="text-[#cccccc]">{tier === "admin" ? "Master Admin" : tier === "pro" ? "Pro Member ($19/mo)" : "Free Member"}</span>
                      <div className="flex items-center gap-2">
                        {renderTierBadge("sm")}
                        <button
                          type="button"
                          onClick={() => {
                            setModalOpen(false);
                            setSubscriptionOpen(true);
                          }}
                          className="text-[11px] text-[#c084fc] hover:underline cursor-pointer ml-1"
                        >
                          Change Plan
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Buttons */}
                  <div className="pt-2 flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-1 anvil-btn anvil-btn-primary disabled:opacity-50 text-white py-2 px-3 text-[13px] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {saving ? "Saving to Firebase..." : "Save Changes"}
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setIsEditing(false);
                        setEditUsername(user.username);
                        setEditError(null);
                      }}
                      className="anvil-btn anvil-btn-secondary text-[#cccccc] hover:text-white py-2 px-3.5 text-[13px] cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  {/* Account Details Grid */}
                  <div className="space-y-3 anvil-poly-card p-3.5 text-[12px]">
                    <div className="flex items-center justify-between py-1 border-b border-[#2d2d2d]">
                      <span className="text-[#858585]">Unique UID</span>
                      <div className="flex items-center gap-1.5 font-mono text-[#cccccc]">
                        <span className="text-[11px] truncate max-w-[180px]">{user.id}</span>
                        <button
                          type="button"
                          onClick={copyUserId}
                          className="anvil-btn anvil-btn-ghost p-1 text-[#858585] hover:text-white cursor-pointer"
                          title="Copy UID"
                        >
                          {copiedId ? (
                            <Check className="w-3.5 h-3.5 text-[#89d185]" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-1 border-b border-[#2d2d2d]">
                      <span className="text-[#858585]">Email</span>
                      <span className="text-[#cccccc] font-mono flex items-center gap-1" title="Protected / Cannot be changed">
                        {user.email}
                        <Lock className="w-3 h-3 text-[#666666]" />
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1 border-b border-[#2d2d2d]">
                      <span className="text-[#858585]">Member Since</span>
                      <span className="text-[#cccccc]">
                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "Active Member"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1 border-b border-[#2d2d2d]">
                      <span className="text-[#858585]">Subscription Plan</span>
                      <div className="flex items-center gap-2">
                        {renderTierBadge("sm")}
                        <button
                          type="button"
                          onClick={() => {
                            setModalOpen(false);
                            setSubscriptionOpen(true);
                          }}
                          className="text-[11px] text-[#c084fc] hover:text-[#e9d5ff] hover:underline cursor-pointer"
                        >
                          Manage Plan
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-1">
                      <span className="text-[#858585]">Workspace Role</span>
                      <span className="text-[#4fc1ff] font-medium flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        {user.role || "Developer"}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(true);
                      setEditError(null);
                    }}
                    className="w-full anvil-btn anvil-btn-secondary text-white py-2 px-3 text-[12px] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-[#007acc]" />
                    Edit Profile Details
                  </button>
                </div>
              )}

              {/* Status Note */}
              <div className="text-[11px] text-[#858585] anvil-poly-card anvil-poly-card-cobalt p-2.5 flex items-center gap-2">
                <div className="w-2 h-2 rotate-45 bg-[#89d185] animate-pulse shrink-0" />
                <span>
                  Persistent Firebase Authentication session active on this device.
                </span>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-[#1e1e1e] border-t border-[#3c3c3c] px-6 py-3 flex items-center justify-between">
              <button
                type="button"
                onClick={async () => {
                  setModalOpen(false);
                  await onSignOut();
                }}
                className="anvil-btn anvil-btn-sm anvil-btn-danger flex items-center gap-1.5 text-[12px] text-[#f48771] hover:text-white px-3 py-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>

              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  setIsEditing(false);
                }}
                className="anvil-btn anvil-btn-sm anvil-btn-secondary text-white px-4 py-1.5 text-[12px] font-medium cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subscription Plans Modal */}
      <SubscriptionModal
        user={user}
        isOpen={subscriptionOpen}
        onClose={() => setSubscriptionOpen(false)}
        onUserUpdated={onUserUpdated}
      />
    </>
  );
};
