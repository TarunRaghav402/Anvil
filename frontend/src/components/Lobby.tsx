import React, { useEffect, useState } from "react";
import { FolderPlus, KeyRound, LogOut, FolderOpen, Radio, AlertCircle } from "lucide-react";
import { APP_NAME, PROJECT_ROLES, ROLE_LABELS, type ProjectRole } from "../../../appConfig";
import { api } from "../services/api";
import type { AnvilProject, AnvilUser } from "../types/anvil";
import { AnvilWordmark } from "./AnvilLogo";

interface LobbyProps {
  user: AnvilUser;
  initialInviteCode: string | null;
  bannerNotice: string | null;
  onClearNotice: () => void;
  onOpenProject: (projectId: string, role: ProjectRole) => void;
  onSignOut: () => Promise<void>;
}

export const Lobby: React.FC<LobbyProps> = ({
  user,
  initialInviteCode,
  bannerNotice,
  onClearNotice,
  onOpenProject,
  onSignOut,
}) => {
  const [projects, setProjects] = useState<AnvilProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newProjectName, setNewProjectName] = useState("");
  const [newTemplate, setNewTemplate] = useState<"canvas-game" | "blank">("canvas-game");
  const [creating, setCreating] = useState(false);

  const [sessionCode, setSessionCode] = useState(initialInviteCode ?? "");
  const [joinRole, setJoinRole] = useState<ProjectRole>("coder");
  const [joining, setJoining] = useState(false);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const res = await api.listProjects();
      setProjects(res.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProjects();
  }, []);

  useEffect(() => {
    if (initialInviteCode) {
      setSessionCode(initialInviteCode.toUpperCase());
    }
  }, [initialInviteCode]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    setError(null);
    setCreating(true);
    try {
      const { project } = await api.createProject({
        name: newProjectName.trim(),
        template: newTemplate,
      });
      setNewProjectName("");
      onOpenProject(project.id, "coder");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create project.");
    } finally {
      setCreating(false);
    }
  };

  const handleJoinSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = sessionCode.trim().toUpperCase();
    if (!code) return;
    setError(null);
    setJoining(true);
    try {
      const res = await api.joinSession(code, joinRole);
      onOpenProject(res.projectId, res.role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join session.");
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="h-screen w-screen bg-[#1e1e1e] text-[#cccccc] flex flex-col">
      <header className="h-9 bg-[#333333] border-b border-[#3c3c3c] px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <AnvilWordmark size="sm" />
          <span className="text-[12px] text-[#858585]">Cloud Workspace Lobby</span>
        </div>
        <div className="flex items-center gap-4 text-[12px]">
          <span className="text-[#cccccc] font-mono">{user.username}</span>
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="flex items-center gap-1.5 text-[#9d9d9d] hover:text-white cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 max-w-5xl w-full mx-auto">
        {bannerNotice && (
          <div className="mb-4 bg-[#3a2d1b] border border-[#cca700] text-[#ffd466] px-4 py-2.5 flex items-center justify-between text-[12px]">
            <span>{bannerNotice}</span>
            <button
              type="button"
              onClick={onClearNotice}
              className="text-xs underline ml-4 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {error && (
          <div className="mb-4 bg-[#5a1d1d] border border-[#be1100] text-[#f48771] px-4 py-2.5 flex items-center gap-2 text-[12px]">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Join Active Session */}
          <section className="bg-[#252526] border border-[#3c3c3c] p-5">
            <div className="flex items-center gap-2 mb-3">
              <KeyRound className="w-4 h-4 text-[#007acc]" />
              <h2 className="text-[14px] font-semibold text-white">Join Live Session</h2>
            </div>
            <p className="text-[12px] text-[#9d9d9d] mb-4">
              Enter a 6-character session code from your host and select your collaboration role tag.
            </p>
            <form onSubmit={handleJoinSession} className="space-y-3">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[#9d9d9d] mb-1">
                  Session Code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  required
                  value={sessionCode}
                  onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
                  placeholder="e.g. K7M9P2"
                  className="w-full bg-[#3c3c3c] border border-[#3c3c3c] focus:border-[#007acc] focus:outline-none px-3 py-2 text-[14px] font-mono tracking-widest uppercase text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[#9d9d9d] mb-1">
                  Your Role Tag
                </label>
                <select
                  value={joinRole}
                  onChange={(e) => setJoinRole(e.target.value as ProjectRole)}
                  className="w-full bg-[#3c3c3c] border border-[#3c3c3c] focus:border-[#007acc] focus:outline-none px-3 py-2 text-[13px] text-white"
                >
                  {PROJECT_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={joining || sessionCode.trim().length !== 6}
                className="w-full bg-[#007acc] hover:bg-[#1f8ad2] disabled:opacity-50 text-white py-2 px-4 text-[13px] font-medium cursor-pointer"
              >
                {joining ? "Joining..." : "Join Session"}
              </button>
            </form>
          </section>

          {/* Create Cloud Project */}
          <section className="bg-[#252526] border border-[#3c3c3c] p-5">
            <div className="flex items-center gap-2 mb-3">
              <FolderPlus className="w-4 h-4 text-[#007acc]" />
              <h2 className="text-[14px] font-semibold text-white">New Cloud Project</h2>
            </div>
            <p className="text-[12px] text-[#9d9d9d] mb-4">
              Projects are stored entirely in {APP_NAME}&apos;s cloud SQL &amp; asset storage.
            </p>
            <form onSubmit={handleCreateProject} className="space-y-3">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[#9d9d9d] mb-1">
                  Project Name
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="e.g. Pixel Platformer"
                  className="w-full bg-[#3c3c3c] border border-[#3c3c3c] focus:border-[#007acc] focus:outline-none px-3 py-2 text-[13px] text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[#9d9d9d] mb-1">
                  Starter Files
                </label>
                <select
                  value={newTemplate}
                  onChange={(e) => setNewTemplate(e.target.value as "canvas-game" | "blank")}
                  className="w-full bg-[#3c3c3c] border border-[#3c3c3c] focus:border-[#007acc] focus:outline-none px-3 py-2 text-[13px] text-white"
                >
                  <option value="canvas-game">HTML5 Canvas Starter (index.html, style.css, main.js)</option>
                  <option value="blank">Empty Cloud Project</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={creating || !newProjectName.trim()}
                className="w-full bg-[#007acc] hover:bg-[#1f8ad2] disabled:opacity-50 text-white py-2 px-4 text-[13px] font-medium cursor-pointer"
              >
                {creating ? "Creating..." : "Create & Open Project"}
              </button>
            </form>
          </section>
        </div>

        {/* Existing Cloud Projects */}
        <section className="bg-[#252526] border border-[#3c3c3c]">
          <div className="px-4 py-2.5 border-b border-[#3c3c3c] flex items-center justify-between">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-[#cccccc]">
              Your Cloud Projects
            </span>
            <button
              type="button"
              onClick={() => void loadProjects()}
              className="text-[11px] text-[#9d9d9d] hover:text-white cursor-pointer"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="p-6 text-[12px] text-[#858585]">Loading projects...</div>
          ) : projects.length === 0 ? (
            <div className="p-6 text-[12px] text-[#858585]">
              No projects yet. Create one above or join an active session with a 6-character code.
            </div>
          ) : (
            <div className="divide-y divide-[#3c3c3c]">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className="px-4 py-3 flex items-center justify-between hover:bg-[#2a2d2e]"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-white">{p.name}</span>
                      {p.ownerId === user.id ? (
                        <span className="text-[10px] px-1.5 py-0.5 bg-[#333333] border border-[#3c3c3c] text-[#9cdcfe]">
                          Owner
                        </span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 bg-[#333333] border border-[#3c3c3c] text-[#cccccc]">
                          Member
                        </span>
                      )}
                      {p.activeSession?.status === "active" && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-[#1b3a2b] border border-[#2ea043] text-[#89d185] font-mono">
                          <Radio className="w-3 h-3" />
                          LIVE {p.activeSession.sessionCode}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#858585] mt-0.5 font-mono">
                      Branch: {p.defaultBranch} · Entry: {p.entryFile}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenProject(p.id, "coder")}
                    className="bg-[#007acc] hover:bg-[#1f8ad2] text-white px-3 py-1.5 text-[12px] flex items-center gap-1.5 cursor-pointer"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    Open Workspace
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
