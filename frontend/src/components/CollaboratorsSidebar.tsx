import React, { useState } from "react";
import { Copy, Play, Square, UserPlus, Trash2, Users, Check } from "lucide-react";
import { PROJECT_ROLES, ROLE_LABELS, type ProjectRole } from "../../../appConfig";
import type { AnvilProjectMember, AnvilSession, OnlinePresenceEntry } from "../types/anvil";

interface CollaboratorsSidebarProps {
  projectId: string;
  ownerId: string;
  currentUserId: string;
  isOwner: boolean;
  role: ProjectRole;
  activeSession: AnvilSession | null;
  members: AnvilProjectMember[];
  presence: OnlinePresenceEntry[];
  onChangeRole: (role: ProjectRole) => void;
  onStartSession: () => Promise<void>;
  onEndSession: () => Promise<void>;
  onAddMember: (identifier: string) => Promise<void>;
  onRemoveMember: (userId: string) => Promise<void>;
}

export const CollaboratorsSidebar: React.FC<CollaboratorsSidebarProps> = ({
  ownerId,
  currentUserId,
  isOwner,
  role,
  activeSession,
  members,
  presence,
  onChangeRole,
  onStartSession,
  onEndSession,
  onAddMember,
  onRemoveMember,
}) => {
  const [identifier, setIdentifier] = useState("");
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyText = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return;
    setMemberError(null);
    setMemberBusy(true);
    try {
      await onAddMember(identifier.trim());
      setIdentifier("");
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : "Could not add member.");
    } finally {
      setMemberBusy(false);
    }
  };

  const inviteUrl =
    activeSession?.status === "active"
      ? `${window.location.origin}/?session=${activeSession.sessionCode}`
      : "";

  return (
    <div className="h-full flex flex-col bg-[#252526]">
      <div className="h-[35px] px-3 flex items-center justify-between border-b border-[#3c3c3c] shrink-0">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#bbbbbb]">
          Collaborators &amp; Session
        </span>
        <Users className="w-3.5 h-3.5 text-[#858585]" />
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Your Role Tag */}
        <section className="space-y-1.5">
          <label className="block text-[11px] uppercase tracking-wider text-[#9d9d9d]">
            Your Role Tag
          </label>
          <select
            value={role}
            onChange={(e) => onChangeRole(e.target.value as ProjectRole)}
            className="w-full bg-[#3c3c3c] border border-[#3c3c3c] focus:border-[#007acc] focus:outline-none px-2.5 py-1.5 text-[12px] text-white"
          >
            {PROJECT_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </section>

        {/* Session Lifecycle */}
        <section className="anvil-poly-card p-3 space-y-2.5" style={{ "--anvil-c": "6px" } as React.CSSProperties}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-[#9d9d9d]">
              Live Session
            </span>
            {activeSession?.status === "active" ? (
              <span
                className="anvil-poly-badge text-[10px] px-2 py-0.5 text-[#89d185]"
                style={{ "--anvil-border": "#2ea043", "--anvil-bg": "#1b3a2b" } as React.CSSProperties}
              >
                ACTIVE
              </span>
            ) : (
              <span className="anvil-poly-badge text-[10px] px-2 py-0.5 text-[#858585]">
                SOLO
              </span>
            )}
          </div>

          {activeSession?.status === "active" ? (
            <>
              <div className="flex items-center justify-between bg-[#252526] border border-[#3c3c3c] px-2.5 py-1.5">
                <span className="font-mono text-[15px] tracking-widest text-white font-semibold">
                  {activeSession.sessionCode}
                </span>
                <button
                  type="button"
                  onClick={() => void copyText("code", activeSession.sessionCode)}
                  className="anvil-btn anvil-btn-ghost text-[11px] text-[#9cdcfe] hover:text-white px-1.5 py-0.5 flex items-center gap-1 cursor-pointer"
                >
                  {copiedKey === "code" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === "code" ? "Copied" : "Code"}
                </button>
              </div>

              <button
                type="button"
                onClick={() => void copyText("url", inviteUrl)}
                className="w-full anvil-btn anvil-btn-sm anvil-btn-secondary text-[#cccccc] hover:text-white py-1.5 px-2.5 text-[11px] flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {copiedKey === "url" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey === "url" ? "Invite Link Copied" : "Copy Shareable Invite URL"}
              </button>

              {(isOwner || activeSession.hostId === currentUserId) && (
                <button
                  type="button"
                  onClick={() => void onEndSession()}
                  className="w-full anvil-btn anvil-btn-sm anvil-btn-danger text-[#f48771] hover:text-white py-1.5 px-2.5 text-[12px] flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5" />
                  End Session
                </button>
              )}
            </>
          ) : isOwner ? (
            <button
              type="button"
              onClick={() => void onStartSession()}
              className="w-full anvil-btn anvil-btn-sm anvil-btn-primary text-white py-1.5 px-3 text-[12px] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              Start Session
            </button>
          ) : (
            <div className="text-[11px] text-[#858585]">
              Waiting for host to start a live session.
            </div>
          )}
        </section>

        {/* Online Collaborators */}
        <section>
          <div className="text-[11px] uppercase tracking-wider text-[#9d9d9d] mb-2">
            Online Now ({presence.length})
          </div>
          <div className="space-y-1.5">
            {presence.map((p) => (
              <div
                key={p.userId}
                className="bg-[#1e1e1e] border border-[#3c3c3c] px-2.5 py-1.5 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 inline-block shrink-0"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="text-[12px] text-white truncate">
                      {p.username}
                      {p.userId === currentUserId ? " (you)" : ""}
                    </span>
                  </div>
                  <div className="text-[10px] text-[#858585] truncate font-mono mt-0.5">
                    {p.activeFilePath || "Browsing project"}
                  </div>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 bg-[#333333] text-[#9cdcfe] shrink-0">
                  {ROLE_LABELS[p.role]}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Project Group Members */}
        <section>
          <div className="text-[11px] uppercase tracking-wider text-[#9d9d9d] mb-2">
            Project Group ({members.length})
          </div>

          {isOwner && (
            <form onSubmit={handleAddMember} className="mb-2 space-y-1.5">
              <div className="flex gap-1">
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Username or email"
                  className="flex-1 min-w-0 bg-[#3c3c3c] border border-[#3c3c3c] focus:border-[#007acc] focus:outline-none px-2 py-1 text-[12px] text-white"
                />
                <button
                  type="submit"
                  disabled={memberBusy || !identifier.trim()}
                  title="Add Permanent Member"
                  className="anvil-btn anvil-btn-sm anvil-btn-primary disabled:opacity-50 text-white px-2.5 py-1 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                </button>
              </div>
              {memberError && <div className="text-[11px] text-[#f48771]">{memberError}</div>}
            </form>
          )}

          <div className="space-y-1">
            {members.map((m) => (
              <div
                key={m.userId}
                className="flex items-center justify-between px-2 py-1 bg-[#1e1e1e] border border-[#3c3c3c] text-[12px]"
              >
                <div className="min-w-0">
                  <div className="text-[#cccccc] truncate">
                    {m.user?.username ?? m.userId}
                  </div>
                  <div className="text-[10px] text-[#858585]">
                    {m.userId === ownerId
                      ? "Owner"
                      : m.permanent
                      ? "Permanent member"
                      : "Session guest"}
                  </div>
                </div>
                {isOwner && m.userId !== ownerId && (
                  <button
                    type="button"
                    title="Remove member"
                    onClick={() => void onRemoveMember(m.userId)}
                    className="text-[#858585] hover:text-[#f48771] p-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
