import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Check,
  Copy,
  Files,
  GitBranch,
  MessageSquare,
  PanelRight,
  Play,
  Radio,
  RefreshCw,
  Search,
  Square,
  Terminal,
  Users,
  X,
} from "lucide-react";
import { APP_NAME, ROLE_LABELS, type ProjectRole } from "../../../appConfig";
import { API_BASE, api, getIdToken } from "../services/api";
import type {
  AnvilComment,
  AnvilProject,
  AnvilProjectMember,
  AnvilProjectNode,
  AnvilSession,
  AnvilUser,
  GitLogEntry,
  OnlinePresenceEntry,
  ProblemEntry,
} from "../types/anvil";
import { AnvilWordmark } from "./AnvilLogo";
import { CollaborativeEditor } from "./CollaborativeEditor";
import { CollaboratorsSidebar } from "./CollaboratorsSidebar";
import { CommentsView } from "./CommentsView";
import { ExplorerSidebar } from "./ExplorerSidebar";
import { GitSidebar } from "./GitSidebar";
import { LivePreviewPane } from "./LivePreviewPane";
import { QuickOpenModal } from "./QuickOpenModal";
import { UserProfileMenu } from "./UserProfileMenu";

interface WorkspaceProps {
  projectId: string;
  initialRole: ProjectRole;
  user: AnvilUser;
  onExitToLobby: (notice?: string) => void;
  onSignOut: () => Promise<void>;
  onUserUpdated?: (updated: AnvilUser) => void;
}

type SidebarTab = "explorer" | "git" | "comments" | "collaborators";
type BottomTab = "output" | "comments" | "problems";

export const Workspace: React.FC<WorkspaceProps> = ({
  projectId,
  initialRole,
  user,
  onExitToLobby,
  onSignOut,
  onUserUpdated,
}) => {
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<AnvilProject | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [members, setMembers] = useState<AnvilProjectMember[]>([]);
  const [activeSession, setActiveSession] = useState<AnvilSession | null>(null);
  const [presence, setPresence] = useState<OnlinePresenceEntry[]>([]);
  const [nodes, setNodes] = useState<AnvilProjectNode[]>([]);
  const [comments, setComments] = useState<AnvilComment[]>([]);
  const [role, setRole] = useState<ProjectRole>(initialRole);

  // Layout state (resizable panes)
  const [activeSidebar, setActiveSidebar] = useState<SidebarTab>("explorer");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [previewWidth, setPreviewWidth] = useState(420);
  const [bottomOpen, setBottomOpen] = useState(true);
  const [bottomHeight, setBottomHeight] = useState(210);
  const [activeBottomTab, setActiveBottomTab] = useState<BottomTab>("output");
  const [resizingMode, setResizingMode] = useState<"sidebar" | "preview" | "bottom" | null>(null);

  // Editor & preview state
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState<{ line: number; col: number }>({ line: 1, col: 1 });
  const [syncState, setSyncState] = useState<"synced" | "syncing" | "offline">("synced");
  const [previewReloadSeq, setPreviewReloadSeq] = useState(0);
  const [assetVersion, setAssetVersion] = useState(0);
  const [quickOpenVisible, setQuickOpenVisible] = useState(false);
  const [jumpRequest, setJumpRequest] = useState<{ nodeId: string; line: number; seq: number } | null>(null);
  const [pendingPinTarget, setPendingPinTarget] = useState<{ nodeId: string; lineNumber: number | null; seq: number } | null>(null);

  // Logs & Problems & Git push state
  const [gitLogs, setGitLogs] = useState<GitLogEntry[]>([]);
  const [gitPushing, setGitPushing] = useState(false);
  const [problemsByNode, setProblemsByNode] = useState<Record<string, ProblemEntry[]>>({});
  const [toast, setToast] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [exportingZip, setExportingZip] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const roleRef = useRef<ProjectRole>(role);
  roleRef.current = role;
  const isOwnerRef = useRef<boolean>(isOwner);
  isOwnerRef.current = isOwner;
  const activeNodeRef = useRef<AnvilProjectNode | null>(null);

  const showToast = useCallback((text: string, kind: "info" | "error" = "info") => {
    setToast({ text, kind });
    setTimeout(() => {
      setToast((curr) => (curr?.text === text ? null : curr));
    }, 3500);
  }, []);

  const appendLog = useCallback((stream: GitLogEntry["stream"], line: string) => {
    setGitLogs((prev) => [
      ...prev.slice(-299),
      {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date().toLocaleTimeString(),
        stream,
        line,
      },
    ]);
  }, []);

  const refreshNodes = useCallback(async () => {
    const res = await api.listNodes(projectId);
    setNodes(res.nodes);
    setAssetVersion((v) => v + 1);
  }, [projectId]);

  const refreshComments = useCallback(async () => {
    const res = await api.listComments(projectId);
    setComments(res.comments);
  }, [projectId]);

  const refreshOverview = useCallback(async () => {
    const overview = await api.getProjectOverview(projectId);
    setProject(overview.project);
    setIsOwner(overview.isOwner);
    setMembers(overview.members);
    setActiveSession(overview.activeSession);
    setPresence(overview.presence);
    setNodes(overview.nodes);
    return overview;
  }, [projectId]);

  // Initial load of workspace data
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [overview, commentsRes] = await Promise.all([
          refreshOverview(),
          api.listComments(projectId),
        ]);
        if (cancelled) return;
        setComments(commentsRes.comments);

        const preferred =
          overview.nodes.find((n) => n.relativePath === overview.project.entryFile) ??
          overview.nodes.find((n) => n.nodeType === "text_file") ??
          null;
        if (preferred) {
          setOpenTabs([preferred.id]);
          setActiveNodeId(preferred.id);
        }
      } catch (err) {
        if (!cancelled) {
          onExitToLobby(err instanceof Error ? err.message : "Unable to access project.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, refreshOverview, onExitToLobby]);

  // Socket.io connection for presence, tree updates, comments, live preview, git log, and session termination
  useEffect(() => {
    let disposed = false;
    let socket: Socket | null = null;

    void (async () => {
      const token = await getIdToken();
      if (disposed) return;

      socket = io(API_BASE || window.location.origin, {
        auth: { token },
        transports: ["websocket", "polling"],
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        socket?.emit(
          "project:join",
          { projectId, role: roleRef.current },
          (ack: { ok: boolean; error?: string; presence?: OnlinePresenceEntry[] }) => {
            if (!ack?.ok) {
              onExitToLobby(ack?.error || "Access denied.");
              return;
            }
            if (ack.presence) setPresence(ack.presence);
            if (activeNodeRef.current) {
              socket?.emit("presence:active-file", {
                nodeId: activeNodeRef.current.id,
                filePath: activeNodeRef.current.relativePath,
              });
            }
          }
        );
      });

      socket.on("presence:updated", (payload: { projectId: string; presence: OnlinePresenceEntry[] }) => {
        if (payload.projectId === projectId) {
          setPresence(payload.presence);
        }
      });

      socket.on("tree:updated", (payload: { projectId: string }) => {
        if (payload.projectId === projectId) {
          void refreshNodes();
        }
      });

      socket.on("members:updated", (payload: { projectId: string }) => {
        if (payload.projectId === projectId) {
          void refreshOverview().catch(() => undefined);
        }
      });

      socket.on("comments:updated", (payload: { projectId: string }) => {
        if (payload.projectId === projectId) {
          void refreshComments().catch(() => undefined);
        }
      });

      socket.on("preview:reload", (payload: { projectId: string }) => {
        if (payload.projectId === projectId) {
          setPreviewReloadSeq((s) => s + 1);
        }
      });

      socket.on("git:log", (payload: { projectId: string; stream: GitLogEntry["stream"]; line: string }) => {
        if (payload.projectId === projectId) {
          appendLog(payload.stream, payload.line);
        }
      });

      socket.on("git:status", (payload: { projectId: string; pushing: boolean }) => {
        if (payload.projectId === projectId) {
          setGitPushing(payload.pushing);
        }
      });

      socket.on("session:started", (payload: { session: AnvilSession }) => {
        if (payload.session.projectId === projectId) {
          setActiveSession(payload.session);
          appendLog("info", `Session ${payload.session.sessionCode} started.`);
        }
      });

      socket.on("session:ended", (payload: { projectId: string; reason: string }) => {
        if (payload.projectId === projectId) {
          setActiveSession(null);
          appendLog("info", payload.reason);
          if (!isOwnerRef.current) {
            onExitToLobby(payload.reason);
          } else {
            showToast(payload.reason, "info");
            void refreshOverview().catch(() => undefined);
          }
        }
      });

      socket.on("access:revoked", (payload: { projectId: string; reason: string }) => {
        if (payload.projectId === projectId) {
          onExitToLobby(payload.reason || "Your access to this project was revoked.");
        }
      });
    })();

    return () => {
      disposed = true;
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [projectId, onExitToLobby, refreshNodes, refreshOverview, refreshComments, appendLog, showToast]);

  const activeNode = useMemo(
    () => nodes.find((n) => n.id === activeNodeId) ?? null,
    [nodes, activeNodeId]
  );
  activeNodeRef.current = activeNode;

  // Report active open file to presence
  useEffect(() => {
    const sock = socketRef.current;
    if (!sock?.connected) return;
    sock.emit("presence:active-file", {
      nodeId: activeNode?.id ?? null,
      filePath: activeNode?.relativePath ?? null,
    });
  }, [activeNode?.id, activeNode?.relativePath]);

  // Remove deleted files from openTabs and prune stale problems
  useEffect(() => {
    const validIds = new Set(nodes.map((n) => n.id));
    setOpenTabs((prev) => {
      const filtered = prev.filter((id) => validIds.has(id));
      setActiveNodeId((curr) => {
        if (!curr || validIds.has(curr)) return curr;
        return filtered[filtered.length - 1] ?? null;
      });
      return filtered.length === prev.length ? prev : filtered;
    });
    setProblemsByNode((prev) => {
      const nextEntries = Object.entries(prev).filter(([id]) => validIds.has(id));
      return nextEntries.length === Object.keys(prev).length ? prev : Object.fromEntries(nextEntries);
    });
  }, [nodes]);

  // Global keyboard shortcuts: Ctrl/Cmd+S, Ctrl/Cmd+P, Ctrl/Cmd+B
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();

      if (key === "s") {
        e.preventDefault();
        setSyncState("syncing");
        void api
          .forceSync(projectId)
          .then(() => {
            setSyncState("synced");
            setPreviewReloadSeq((s) => s + 1);
            showToast("Workspace synced to cloud SQL.");
          })
          .catch((err) => {
            setSyncState("offline");
            showToast(err instanceof Error ? err.message : "Sync failed.", "error");
          });
      } else if (key === "p") {
        e.preventDefault();
        setQuickOpenVisible(true);
      } else if (key === "b") {
        e.preventDefault();
        setSidebarOpen((o) => !o);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [projectId, showToast]);

  // Pane drag resizing
  useEffect(() => {
    if (!resizingMode) return;
    const onMouseMove = (e: MouseEvent) => {
      if (resizingMode === "sidebar") {
        setSidebarWidth(Math.min(500, Math.max(180, e.clientX - 48)));
      } else if (resizingMode === "preview") {
        setPreviewWidth(Math.min(820, Math.max(260, window.innerWidth - e.clientX)));
      } else if (resizingMode === "bottom") {
        setBottomHeight(Math.min(480, Math.max(120, window.innerHeight - 22 - e.clientY)));
      }
    };
    const onMouseUp = () => setResizingMode(null);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [resizingMode]);

  const openNode = (node: AnvilProjectNode) => {
    if (node.nodeType === "folder") return;
    setOpenTabs((prev) => (prev.includes(node.id) ? prev : [...prev, node.id]));
    setActiveNodeId(node.id);
  };

  const closeTab = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenTabs((prev) => {
      const next = prev.filter((id) => id !== nodeId);
      if (activeNodeId === nodeId) {
        setActiveNodeId(next[next.length - 1] ?? null);
      }
      return next;
    });
  };

  const handleToggleActivityIcon = (tab: SidebarTab) => {
    if (sidebarOpen && activeSidebar === tab) {
      setSidebarOpen(false);
    } else {
      setActiveSidebar(tab);
      setSidebarOpen(true);
    }
  };

  const handleRoleChange = async (nextRole: ProjectRole) => {
    setRole(nextRole);
    socketRef.current?.emit("presence:role", { role: nextRole });
    if (activeSession?.status === "active") {
      await api.updateSessionRole(activeSession.id, nextRole).catch(() => undefined);
    }
  };

  const handleStartSession = async () => {
    try {
      const res = await api.startSession(projectId, role);
      setActiveSession(res.session);
      showToast(`Live session started: ${res.session.sessionCode}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to start session.", "error");
    }
  };

  const handleEndSession = async () => {
    if (!activeSession) return;
    try {
      await api.endSession(activeSession.id);
      setActiveSession(null);
      showToast("Session ended.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to end session.", "error");
    }
  };

  const handleExportZip = async () => {
    if (!project) return;
    setExportingZip(true);
    try {
      await api.downloadProjectZip(project.id, project.name);
      showToast("Project exported as .zip");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Zip export failed.", "error");
    } finally {
      setExportingZip(false);
    }
  };

  const handleProblemsChange = useCallback((nodeId: string, _filePath: string, list: ProblemEntry[]) => {
    setProblemsByNode((prev) => ({ ...prev, [nodeId]: list }));
  }, []);

  const allProblems = useMemo(() => Object.values(problemsByNode).flat(), [problemsByNode]);
  const unresolvedCommentsCount = useMemo(
    () => comments.filter((c) => !c.parentCommentId && !c.resolved).length,
    [comments]
  );

  const myUserColor = useMemo(
    () => presence.find((p) => p.userId === user.id)?.color ?? "#4ec9b0",
    [presence, user.id]
  );

  if (loading || !project) {
    return (
      <div className="h-screen w-screen bg-[#1e1e1e] text-[#cccccc] flex items-center justify-center text-[13px]">
        Loading {APP_NAME} workspace...
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[#1e1e1e] text-[#cccccc] overflow-hidden">
      {/* Prevent iframe / Monaco from capturing mouse events during divider drags */}
      {resizingMode && <div className="fixed inset-0 z-40 cursor-col-resize" />}

      {/* VS Code Title Bar */}
      <header className="h-[32px] bg-[#3c3c3c] border-b border-[#252526] px-2.5 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => onExitToLobby()}
            title="Back to Projects Lobby"
            className="p-1 hover:bg-[#4c4c4c] text-[#cccccc] cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <AnvilWordmark size="sm" />
          <span className="text-[12px] text-white font-medium truncate">{project.name}</span>

          <button
            type="button"
            onClick={() => setQuickOpenVisible(true)}
            className="hidden sm:flex items-center gap-1.5 bg-[#2d2d2d] hover:bg-[#333333] border border-[#4a4a4a] px-2.5 py-0.5 text-[11px] text-[#9d9d9d] cursor-pointer ml-2"
          >
            <Search className="w-3 h-3" />
            <span>Quick Open</span>
            <span className="font-mono text-[10px] text-[#858585]">Ctrl/Cmd+P</span>
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Session quick controls */}
          {activeSession?.status === "active" ? (
            <div className="flex items-center gap-1.5 bg-[#252526] border border-[#3c3c3c] px-2 py-0.5 text-[11px]">
              <Radio className="w-3 h-3 text-[#4ec9b0]" />
              <span className="font-mono text-white">{activeSession.sessionCode}</span>
              <button
                type="button"
                title="Copy Invite Link"
                onClick={() => {
                  const link = `${window.location.origin}/?session=${activeSession.sessionCode}`;
                  void navigator.clipboard.writeText(link);
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(false), 1500);
                }}
                className="text-[#9cdcfe] hover:text-white cursor-pointer"
              >
                {copiedCode ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              </button>
              {isOwner && (
                <button
                  type="button"
                  title="End Session"
                  onClick={() => void handleEndSession()}
                  className="text-[#f48771] hover:text-white ml-1 cursor-pointer"
                >
                  <Square className="w-3 h-3" />
                </button>
              )}
            </div>
          ) : (
            isOwner && (
              <button
                type="button"
                onClick={() => void handleStartSession()}
                className="bg-[#007acc] hover:bg-[#1f8ad2] text-white px-2.5 py-0.5 text-[11px] font-medium flex items-center gap-1 cursor-pointer"
              >
                <Play className="w-3 h-3" />
                Start Session
              </button>
            )
          )}

          <button
            type="button"
            disabled={exportingZip}
            onClick={() => void handleExportZip()}
            title="Export project as .zip"
            className="bg-[#2d2d2d] hover:bg-[#3c3c3c] border border-[#3c3c3c] hover:border-[#4c4c4c] text-[#cccccc] hover:text-white px-2.5 py-1 rounded-xs text-[11px] flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
          >
            <Archive className="w-3 h-3 text-[#9cdcfe]" />
            {exportingZip ? "Zipping..." : "Export"}
          </button>

          <button
            type="button"
            onClick={() => setPreviewOpen((p) => !p)}
            title="Toggle Live Preview Pane"
            className={`px-2.5 py-1 rounded-xs text-[11px] flex items-center gap-1.5 border transition-all cursor-pointer shadow-xs active:scale-95 ${
              previewOpen
                ? "bg-[#094771] hover:bg-[#0e5c94] border-[#007acc] text-white"
                : "bg-[#2d2d2d] hover:bg-[#3c3c3c] border-[#3c3c3c] hover:border-[#4c4c4c] text-[#cccccc] hover:text-white"
            }`}
          >
            <PanelRight className="w-3 h-3" />
            Preview
          </button>

          <div className="h-4 w-px bg-[#3c3c3c] mx-1" />

          {/* User Profile Menu */}
          <UserProfileMenu user={user} onSignOut={onSignOut} onUserUpdated={onUserUpdated} compact />
        </div>
      </header>

      {toast && (
        <div
          className={`fixed top-10 right-4 z-50 px-3 py-2 text-[12px] border shadow-lg ${
            toast.kind === "error"
              ? "bg-[#5a1d1d] border-[#be1100] text-[#f48771]"
              : "bg-[#252526] border-[#007acc] text-white"
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Main Workbench */}
      <div className="flex-1 flex min-h-0">
        {/* Far-left Activity Bar */}
        <aside className="w-[48px] bg-[#333333] border-r border-[#252526] flex flex-col items-center py-1 shrink-0">
          {(
            [
              ["explorer", Files, "Explorer", 0],
              ["git", GitBranch, "GitHub Commit & Push", 0],
              ["comments", MessageSquare, "Comments", unresolvedCommentsCount],
              ["collaborators", Users, "Collaborators & Session", presence.length],
            ] as const
          ).map(([id, Icon, title, badge]) => {
            const active = sidebarOpen && activeSidebar === id;
            return (
              <button
                key={id}
                type="button"
                title={title}
                onClick={() => handleToggleActivityIcon(id)}
                className={`relative w-full h-[46px] flex items-center justify-center cursor-pointer ${
                  active
                    ? "text-white border-l-2 border-l-[#007acc]"
                    : "text-[#858585] hover:text-white border-l-2 border-l-transparent"
                }`}
              >
                <Icon className="w-5 h-5" />
                {badge > 0 && (
                  <span className="absolute bottom-1.5 right-1.5 min-w-[15px] h-[15px] px-1 bg-[#007acc] text-white text-[9px] font-bold flex items-center justify-center">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        {/* Side Bar */}
        {sidebarOpen && (
          <>
            <div style={{ width: sidebarWidth }} className="shrink-0 h-full overflow-hidden border-r border-[#3c3c3c]">
              {activeSidebar === "explorer" && (
                <ExplorerSidebar
                  projectId={projectId}
                  nodes={nodes}
                  activeNodeId={activeNodeId}
                  presence={presence}
                  onOpenNode={openNode}
                  onRefresh={refreshNodes}
                  onCreateNode={async (parentId, name, nodeType) => {
                    const res = await api.createNode(projectId, { parentId, name, nodeType });
                    await refreshNodes();
                    if (res.node && res.node.nodeType !== "folder") {
                      openNode(res.node);
                    }
                  }}
                  onRenameNode={async (nodeId, newName) => {
                    await api.renameOrMoveNode(projectId, nodeId, { name: newName });
                    await refreshNodes();
                  }}
                  onDeleteNode={async (nodeId) => {
                    await api.deleteNode(projectId, nodeId);
                    await refreshNodes();
                    await refreshComments();
                  }}
                  onUploadFiles={async (files, parentId) => {
                    try {
                      const res = await api.uploadFiles(projectId, files, parentId, true);
                      await refreshNodes();
                      if (res.uploaded[0]) openNode(res.uploaded[0]);
                      showToast(`Uploaded ${res.uploaded.length} file(s).`);
                    } catch (err) {
                      showToast(err instanceof Error ? err.message : "Upload failed.", "error");
                    }
                  }}
                />
              )}

              {activeSidebar === "git" && (
                <GitSidebar
                  project={project}
                  pushing={gitPushing}
                  onPushed={(branch, originUrl) => {
                    setProject((p) => (p ? { ...p, defaultBranch: branch, githubOriginUrl: originUrl } : p));
                  }}
                  onOpenOutput={() => {
                    setBottomOpen(true);
                    setActiveBottomTab("output");
                  }}
                />
              )}

              {activeSidebar === "comments" && (
                <div className="h-full flex flex-col bg-[#252526]">
                  <div className="h-[35px] px-3 flex items-center justify-between border-b border-[#3c3c3c] shrink-0">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[#bbbbbb]">
                      Comments
                    </span>
                    <MessageSquare className="w-3.5 h-3.5 text-[#858585]" />
                  </div>
                  <div className="flex-1 min-h-0">
                    <CommentsView
                      compact
                      comments={comments}
                      activeNode={activeNode}
                      currentUserId={user.id}
                      isOwner={isOwner}
                      pendingPinTarget={pendingPinTarget}
                      onClearPendingPin={() => setPendingPinTarget(null)}
                      onJumpToComment={(nodeId, lineNumber) => {
                        const target = nodes.find((n) => n.id === nodeId);
                        if (target) {
                          openNode(target);
                          if (lineNumber) {
                            setJumpRequest((prev) => ({
                              nodeId,
                              line: lineNumber,
                              seq: (prev?.seq ?? 0) + 1,
                            }));
                          }
                        }
                      }}
                      onCreateComment={async (input) => {
                        await api.createComment(projectId, input);
                        await refreshComments();
                      }}
                      onToggleResolve={async (commentId, resolved) => {
                        await api.setCommentResolved(projectId, commentId, resolved);
                        await refreshComments();
                      }}
                      onDeleteComment={async (commentId) => {
                        await api.deleteComment(projectId, commentId);
                        await refreshComments();
                      }}
                    />
                  </div>
                </div>
              )}

              {activeSidebar === "collaborators" && (
                <CollaboratorsSidebar
                  projectId={projectId}
                  ownerId={project.ownerId}
                  currentUserId={user.id}
                  isOwner={isOwner}
                  role={role}
                  activeSession={activeSession}
                  members={members}
                  presence={presence}
                  onChangeRole={(r) => void handleRoleChange(r)}
                  onStartSession={handleStartSession}
                  onEndSession={handleEndSession}
                  onAddMember={async (identifier) => {
                    const res = await api.addProjectMember(projectId, identifier);
                    setMembers(res.members);
                    showToast(`Added ${identifier} to project.`);
                  }}
                  onRemoveMember={async (userId) => {
                    await api.removeProjectMember(projectId, userId);
                    await refreshOverview();
                    showToast("Member removed.");
                  }}
                />
              )}
            </div>

            <div
              onMouseDown={() => setResizingMode("sidebar")}
              className="w-[4px] bg-transparent hover:bg-[#007acc] cursor-col-resize shrink-0 -ml-[2px] z-10"
            />
          </>
        )}

        {/* Center Editor + Bottom Panel Column */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Editor Tabs + Editor Area */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Tab Bar */}
            <div className="h-[35px] bg-[#252526] border-b border-[#3c3c3c] flex items-center overflow-x-auto shrink-0">
              {openTabs.map((tabId) => {
                const node = nodes.find((n) => n.id === tabId);
                if (!node) return null;
                const active = activeNodeId === node.id;
                return (
                  <div
                    key={node.id}
                    onClick={() => setActiveNodeId(node.id)}
                    className={`h-full px-3 flex items-center gap-2 border-r border-[#3c3c3c] cursor-pointer text-[12px] shrink-0 ${
                      active
                        ? "bg-[#1e1e1e] text-white border-t-2 border-t-[#007acc]"
                        : "bg-[#2d2d2d] text-[#969696] hover:bg-[#2a2d2e]"
                    }`}
                  >
                    <span className="truncate max-w-[160px]">{node.name}</span>
                    <button
                      type="button"
                      onClick={(e) => closeTab(node.id, e)}
                      className="p-0.5 hover:bg-[#3c3c3c] text-[#858585] hover:text-white cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Active Editor or Empty State */}
            <div className="flex-1 min-h-0 bg-[#1e1e1e]">
              {activeNode ? (
                <CollaborativeEditor
                  key={activeNode.id}
                  projectId={projectId}
                  node={activeNode}
                  username={user.username}
                  role={role}
                  userColor={myUserColor}
                  comments={comments}
                  jumpToLineRequest={jumpRequest}
                  assetVersion={assetVersion}
                  onCursorChange={(line, col) => setCursorPos({ line, col })}
                  onSyncStateChange={setSyncState}
                  onProblemsChange={handleProblemsChange}
                  onRequestPinComment={(nodeId, lineNumber) => {
                    setBottomOpen(true);
                    setActiveBottomTab("comments");
                    setPendingPinTarget({ nodeId, lineNumber, seq: Date.now() });
                  }}
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-[#858585] p-6 text-center space-y-3">
                  <AnvilWordmark size="lg" />
                  <p className="text-[12px] max-w-sm">
                    Select a file from the Explorer or press{" "}
                    <span className="font-mono text-[#cccccc]">Ctrl/Cmd+P</span> to quick-open.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Panel */}
          {bottomOpen && (
            <>
              <div
                onMouseDown={() => setResizingMode("bottom")}
                className="h-[4px] bg-transparent hover:bg-[#007acc] cursor-row-resize shrink-0 -mt-[2px] z-10"
              />
              <div
                style={{ height: bottomHeight }}
                className="border-t border-[#3c3c3c] bg-[#1e1e1e] flex flex-col shrink-0"
              >
                <div className="h-[32px] px-3 bg-[#252526] border-b border-[#3c3c3c] flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-4 text-[11px] uppercase tracking-wider">
                    <button
                      type="button"
                      onClick={() => setActiveBottomTab("output")}
                      className={`h-[32px] flex items-center gap-1.5 border-b-2 cursor-pointer ${
                        activeBottomTab === "output"
                          ? "border-[#007acc] text-white"
                          : "border-transparent text-[#858585] hover:text-[#cccccc]"
                      }`}
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      Output / Git Log
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveBottomTab("comments")}
                      className={`h-[32px] flex items-center gap-1.5 border-b-2 cursor-pointer ${
                        activeBottomTab === "comments"
                          ? "border-[#007acc] text-white"
                          : "border-transparent text-[#858585] hover:text-[#cccccc]"
                      }`}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      Comments ({unresolvedCommentsCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveBottomTab("problems")}
                      className={`h-[32px] flex items-center gap-1.5 border-b-2 cursor-pointer ${
                        activeBottomTab === "problems"
                          ? "border-[#007acc] text-white"
                          : "border-transparent text-[#858585] hover:text-[#cccccc]"
                      }`}
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Problems ({allProblems.length})
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {activeBottomTab === "output" && (
                      <button
                        type="button"
                        onClick={() => setGitLogs([])}
                        className="text-[11px] text-[#858585] hover:text-white cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setBottomOpen(false)}
                      title="Hide Panel"
                      className="p-1 text-[#858585] hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-hidden">
                  {activeBottomTab === "output" && (
                    <div className="h-full overflow-y-auto p-3 font-mono text-[12px] space-y-1">
                      {gitLogs.length === 0 ? (
                        <div className="text-[#858585]">
                          Git push output and session logs will stream here.
                        </div>
                      ) : (
                        gitLogs.map((entry) => (
                          <div
                            key={entry.id}
                            className={
                              entry.stream === "error"
                                ? "text-[#f48771]"
                                : entry.stream === "stderr"
                                ? "text-[#cca700]"
                                : entry.stream === "info"
                                ? "text-[#9cdcfe]"
                                : "text-[#cccccc]"
                            }
                          >
                            <span className="text-[#858585] mr-2">[{entry.timestamp}]</span>
                            {entry.line}
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {activeBottomTab === "comments" && (
                    <CommentsView
                      comments={comments}
                      activeNode={activeNode}
                      currentUserId={user.id}
                      isOwner={isOwner}
                      pendingPinTarget={pendingPinTarget}
                      onClearPendingPin={() => setPendingPinTarget(null)}
                      onJumpToComment={(nodeId, lineNumber) => {
                        const target = nodes.find((n) => n.id === nodeId);
                        if (target) {
                          openNode(target);
                          if (lineNumber) {
                            setJumpRequest((prev) => ({
                              nodeId,
                              line: lineNumber,
                              seq: (prev?.seq ?? 0) + 1,
                            }));
                          }
                        }
                      }}
                      onCreateComment={async (input) => {
                        await api.createComment(projectId, input);
                        await refreshComments();
                      }}
                      onToggleResolve={async (commentId, resolved) => {
                        await api.setCommentResolved(projectId, commentId, resolved);
                        await refreshComments();
                      }}
                      onDeleteComment={async (commentId) => {
                        await api.deleteComment(projectId, commentId);
                        await refreshComments();
                      }}
                    />
                  )}

                  {activeBottomTab === "problems" && (
                    <div className="h-full overflow-y-auto p-2 text-[12px]">
                      {allProblems.length === 0 ? (
                        <div className="p-3 text-[#858585]">No problems detected in open editors.</div>
                      ) : (
                        <div className="divide-y divide-[#2d2d2d]">
                          {allProblems.map((prob, idx) => (
                            <button
                              key={`${prob.nodeId}-${prob.line}-${prob.column}-${idx}`}
                              type="button"
                              onClick={() => {
                                const target = nodes.find((n) => n.id === prob.nodeId);
                                if (target) {
                                  openNode(target);
                                  setJumpRequest((prev) => ({
                                    nodeId: prob.nodeId,
                                    line: prob.line,
                                    seq: (prev?.seq ?? 0) + 1,
                                  }));
                                }
                              }}
                              className="w-full text-left px-3 py-1.5 hover:bg-[#2a2d2e] flex items-center justify-between gap-4 cursor-pointer"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <AlertTriangle
                                  className={`w-3.5 h-3.5 shrink-0 ${
                                    prob.severity === "error" ? "text-[#f48771]" : "text-[#cca700]"
                                  }`}
                                />
                                <span className="truncate text-[#cccccc]">{prob.message}</span>
                              </div>
                              <span className="font-mono text-[11px] text-[#858585] shrink-0">
                                {prob.filePath}:{prob.line}:{prob.column}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right-hand Live Preview Pane */}
        {previewOpen && (
          <>
            <div
              onMouseDown={() => setResizingMode("preview")}
              className="w-[4px] bg-transparent hover:bg-[#007acc] cursor-col-resize shrink-0 -mr-[2px] z-10"
            />
            <div style={{ width: previewWidth }} className="shrink-0 h-full overflow-hidden">
              <LivePreviewPane
                projectId={projectId}
                entryFile={project.entryFile}
                nodes={nodes}
                reloadSeq={previewReloadSeq}
                onChangeEntryFile={async (entryFile) => {
                  const res = await api.updateProjectSettings(projectId, { entryFile });
                  setProject(res.project);
                  setPreviewReloadSeq((s) => s + 1);
                }}
              />
            </div>
          </>
        )}
      </div>

      {/* VS Code Status Bar (#007acc) */}
      <footer className="h-[22px] bg-[#007acc] text-white px-3 flex items-center justify-between text-[11px] shrink-0 select-none">
        <div className="flex items-center gap-4">
          <span className="font-semibold tracking-wide">{APP_NAME}</span>
          <span className="flex items-center gap-1 font-mono">
            <GitBranch className="w-3 h-3" />
            {project.defaultBranch}
          </span>
          <span className="font-mono">
            {activeSession?.status === "active"
              ? `Session: ${activeSession.sessionCode}`
              : "Solo Workspace"}
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {presence.length} online
          </span>
          <span className="flex items-center gap-1">
            <RefreshCw className={`w-3 h-3 ${syncState === "syncing" ? "animate-spin" : ""}`} />
            {syncState === "synced"
              ? "Synced"
              : syncState === "syncing"
              ? "Syncing..."
              : "Offline (queued)"}
          </span>
        </div>

        <div className="flex items-center gap-4">
          {!bottomOpen && (
            <button
              type="button"
              onClick={() => setBottomOpen(true)}
              className="hover:underline cursor-pointer"
            >
              Show Panel
            </button>
          )}
          {activeNode?.nodeType === "text_file" && (
            <span className="font-mono">
              Ln {cursorPos.line}, Col {cursorPos.col}
            </span>
          )}
          <span>{ROLE_LABELS[role]}</span>
        </div>
      </footer>

      <QuickOpenModal
        open={quickOpenVisible}
        nodes={nodes}
        onClose={() => setQuickOpenVisible(false)}
        onSelect={openNode}
      />
    </div>
  );
};
