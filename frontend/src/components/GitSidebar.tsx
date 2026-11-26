import React, { useEffect, useState } from "react";
import { GitBranch, UploadCloud, ShieldAlert, CheckCircle2, AlertCircle } from "lucide-react";
import { api } from "../services/api";
import type { AnvilProject } from "../types/anvil";

interface GitSidebarProps {
  project: AnvilProject;
  pushing: boolean;
  onPushed: (branch: string, originUrl: string) => void;
  onOpenOutput: () => void;
}

export const GitSidebar: React.FC<GitSidebarProps> = ({
  project,
  pushing,
  onPushed,
  onOpenOutput,
}) => {
  const [originUrl, setOriginUrl] = useState(project.githubOriginUrl ?? "");
  const [branch, setBranch] = useState(project.defaultBranch || "main");
  // PAT is kept strictly in component runtime memory only — never persisted
  const [pat, setPat] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [localBusy, setLocalBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setOriginUrl(project.githubOriginUrl ?? "");
    setBranch(project.defaultBranch || "main");
  }, [project.id, project.githubOriginUrl, project.defaultBranch]);

  const busy = pushing || localBusy;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    onOpenOutput();
    setLocalBusy(true);
    try {
      const res = await api.commitAndPush(project.id, {
        originUrl: originUrl.trim(),
        branch: branch.trim() || "main",
        pat: pat.trim(),
        commitMessage: commitMessage.trim(),
      });
      setSuccess(res.message);
      setCommitMessage("");
      onPushed(res.branch, res.originUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Commit & Push failed.");
    } finally {
      setLocalBusy(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#252526]">
      <div className="h-[35px] px-3 flex items-center justify-between border-b border-[#3c3c3c] shrink-0">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#bbbbbb]">
          Source Control · GitHub
        </span>
        <GitBranch className="w-3.5 h-3.5 text-[#858585]" />
      </div>

      <form onSubmit={handleSubmit} className="p-3 space-y-3 overflow-y-auto flex-1">
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-[#9d9d9d] mb-1">
            GitHub Origin URL
          </label>
          <input
            type="url"
            required
            value={originUrl}
            onChange={(e) => setOriginUrl(e.target.value)}
            placeholder="https://github.com/org/repo.git"
            className="w-full bg-[#3c3c3c] border border-[#3c3c3c] focus:border-[#007acc] focus:outline-none px-2.5 py-1.5 text-[12px] text-white font-mono"
          />
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-wider text-[#9d9d9d] mb-1">
            Branch
          </label>
          <input
            type="text"
            required
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="main"
            className="w-full bg-[#3c3c3c] border border-[#3c3c3c] focus:border-[#007acc] focus:outline-none px-2.5 py-1.5 text-[12px] text-white font-mono"
          />
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-wider text-[#9d9d9d] mb-1">
            Personal Access Token (PAT)
          </label>
          <input
            type="password"
            required
            autoComplete="off"
            value={pat}
            onChange={(e) => setPat(e.target.value)}
            placeholder="ghp_... or github_pat_..."
            className="w-full bg-[#3c3c3c] border border-[#3c3c3c] focus:border-[#007acc] focus:outline-none px-2.5 py-1.5 text-[12px] text-white font-mono"
          />
          <p className="mt-1 text-[10px] text-[#858585] flex items-start gap-1 leading-snug">
            <ShieldAlert className="w-3 h-3 shrink-0 mt-0.5 text-[#cca700]" />
            <span>
              Kept in browser memory only for this push. Never saved to SQL, disk, or logs.
            </span>
          </p>
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-wider text-[#9d9d9d] mb-1">
            Commit Message
          </label>
          <textarea
            required
            rows={3}
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Describe your team's changes..."
            className="w-full bg-[#3c3c3c] border border-[#3c3c3c] focus:border-[#007acc] focus:outline-none px-2.5 py-1.5 text-[12px] text-white resize-y"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-[#5a1d1d] border border-[#be1100] text-[#f48771] px-2.5 py-2 text-[11px] leading-snug">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-start gap-2 bg-[#1b3a2b] border border-[#2ea043] text-[#89d185] px-2.5 py-2 text-[11px] leading-snug">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !originUrl.trim() || !pat.trim() || !commitMessage.trim()}
          className="w-full anvil-btn anvil-btn-primary disabled:opacity-50 text-white py-2 px-3 text-[12px] font-medium flex items-center justify-center gap-2 cursor-pointer"
        >
          <UploadCloud className="w-4 h-4" />
          {busy ? "Pushing to GitHub..." : "Commit & Push"}
        </button>
      </form>
    </div>
  );
};
