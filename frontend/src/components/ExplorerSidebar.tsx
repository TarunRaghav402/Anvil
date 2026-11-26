import React, { useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileImage,
  FileJson,
  FileMusic,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  RefreshCw,
  Upload,
} from "lucide-react";
import type { AnvilProjectNode, OnlinePresenceEntry } from "../types/anvil";
import { validateNodeNameClient } from "../utils/filenames";

interface ExplorerSidebarProps {
  projectId: string;
  nodes: AnvilProjectNode[];
  activeNodeId: string | null;
  presence: OnlinePresenceEntry[];
  onOpenNode: (node: AnvilProjectNode) => void;
  onRefresh: () => Promise<void>;
  onCreateNode: (parentId: string | null, name: string, nodeType: "folder" | "text_file") => Promise<void>;
  onRenameNode: (nodeId: string, newName: string) => Promise<void>;
  onDeleteNode: (nodeId: string) => Promise<void>;
  onUploadFiles: (files: File[], parentId: string | null) => Promise<void>;
}

interface ContextMenuState {
  x: number;
  y: number;
  targetNode: AnvilProjectNode | null;
}

function getFileIcon(node: AnvilProjectNode) {
  const lower = node.name.toLowerCase();
  if (/\.(png|svg|jpg|jpeg|gif|webp|ico)$/.test(lower)) {
    return <FileImage className="w-3.5 h-3.5 text-[#c586c0] shrink-0" />;
  }
  if (/\.(wav|mp3|ogg)$/.test(lower)) {
    return <FileMusic className="w-3.5 h-3.5 text-[#4ec9b0] shrink-0" />;
  }
  if (/\.json$/.test(lower)) {
    return <FileJson className="w-3.5 h-3.5 text-[#dcdcaa] shrink-0" />;
  }
  if (/\.(js|jsx|ts|tsx|mjs|html|css|scss)$/.test(lower)) {
    return <FileCode2 className="w-3.5 h-3.5 text-[#569cd6] shrink-0" />;
  }
  return <FileText className="w-3.5 h-3.5 text-[#cccccc] shrink-0" />;
}

export const ExplorerSidebar: React.FC<ExplorerSidebarProps> = ({
  nodes,
  activeNodeId,
  presence,
  onOpenNode,
  onRefresh,
  onCreateNode,
  onRenameNode,
  onDeleteNode,
  onUploadFiles,
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [inlineAction, setInlineAction] = useState<
    | { kind: "create"; parentId: string | null; nodeType: "folder" | "text_file" }
    | { kind: "rename"; node: AnvilProjectNode }
    | null
  >(null);
  const [inlineValue, setInlineValue] = useState("");
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [dragTargetFolderId, setDragTargetFolderId] = useState<string | "ROOT" | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const uploadParentIdRef = useRef<string | null>(null);

  const childrenByParent = useMemo(() => {
    const map = new Map<string, AnvilProjectNode[]>();
    for (const n of nodes) {
      const key = n.parentId ?? "ROOT";
      const list = map.get(key) ?? [];
      list.push(n);
      map.set(key, list);
    }
    for (const [k, list] of map.entries()) {
      list.sort((a, b) => {
        if (a.nodeType === "folder" && b.nodeType !== "folder") return -1;
        if (a.nodeType !== "folder" && b.nodeType === "folder") return 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });
      map.set(k, list);
    }
    return map;
  }, [nodes]);

  const presenceByNode = useMemo(() => {
    const map = new Map<string, OnlinePresenceEntry[]>();
    for (const p of presence) {
      if (!p.activeNodeId) continue;
      const arr = map.get(p.activeNodeId) ?? [];
      arr.push(p);
      map.set(p.activeNodeId, arr);
    }
    return map;
  }, [presence]);

  const toggleFolder = (folderId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const startCreate = (parentId: string | null, nodeType: "folder" | "text_file") => {
    if (parentId) {
      setExpanded((prev) => new Set(prev).add(parentId));
    }
    setInlineAction({ kind: "create", parentId, nodeType });
    setInlineValue("");
    setInlineError(null);
    setContextMenu(null);
  };

  const startRename = (node: AnvilProjectNode) => {
    setInlineAction({ kind: "rename", node });
    setInlineValue(node.name);
    setInlineError(null);
    setContextMenu(null);
  };

  const triggerUploadDialog = (parentId: string | null) => {
    uploadParentIdRef.current = parentId;
    setContextMenu(null);
    uploadInputRef.current?.click();
  };

  const handleInlineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inlineAction) return;

    const check = validateNodeNameClient(inlineValue);
    if (!check.valid) {
      setInlineError(check.error || "Invalid name.");
      return;
    }

    const parentId =
      inlineAction.kind === "create" ? inlineAction.parentId : inlineAction.node.parentId;
    const excludeId = inlineAction.kind === "rename" ? inlineAction.node.id : undefined;
    const siblings = childrenByParent.get(parentId ?? "ROOT") ?? [];
    const collision = siblings.find(
      (s) => s.id !== excludeId && s.name.toLowerCase() === check.normalized.toLowerCase()
    );
    if (collision) {
      setInlineError(
        `Sibling "${collision.name}" already exists (case-insensitive names enforced across Windows/macOS/Linux).`
      );
      return;
    }

    try {
      if (inlineAction.kind === "create") {
        await onCreateNode(parentId, check.normalized, inlineAction.nodeType);
      } else {
        await onRenameNode(inlineAction.node.id, check.normalized);
      }
      setInlineAction(null);
      setInlineError(null);
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : "Operation failed.");
    }
  };

  const handleDropFiles = async (e: React.DragEvent, targetParentId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setDragTargetFolderId(null);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length === 0) return;
    if (targetParentId) {
      setExpanded((prev) => new Set(prev).add(targetParentId));
    }
    await onUploadFiles(dropped, targetParentId);
  };

  const renderInlineInput = (depth: number) => {
    if (!inlineAction) return null;
    return (
      <form
        onSubmit={handleInlineSubmit}
        style={{ paddingLeft: `${depth * 14 + 12}px` }}
        className="pr-2 py-1 bg-[#2a2d2e]"
      >
        <input
          autoFocus
          type="text"
          value={inlineValue}
          onChange={(e) => {
            setInlineValue(e.target.value);
            setInlineError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setInlineAction(null);
              setInlineError(null);
            }
          }}
          onBlur={() => {
            if (!inlineValue.trim()) {
              setInlineAction(null);
              setInlineError(null);
            }
          }}
          placeholder={
            inlineAction.kind === "create"
              ? inlineAction.nodeType === "folder"
                ? "Folder name..."
                : "File name..."
              : "New name..."
          }
          className="w-full bg-[#3c3c3c] border border-[#007acc] focus:outline-none px-1.5 py-0.5 text-[12px] text-white font-mono"
        />
        {inlineError && (
          <div className="text-[11px] text-[#f48771] mt-1 leading-tight">{inlineError}</div>
        )}
      </form>
    );
  };

  const renderNodes = (parentId: string | null, depth: number) => {
    const items = childrenByParent.get(parentId ?? "ROOT") ?? [];
    return (
      <>
        {inlineAction?.kind === "create" && inlineAction.parentId === parentId && renderInlineInput(depth)}
        {items.map((node) => {
          const isFolder = node.nodeType === "folder";
          const isOpen = expanded.has(node.id);
          const isActive = activeNodeId === node.id;
          const isRenaming = inlineAction?.kind === "rename" && inlineAction.node.id === node.id;
          const viewers = presenceByNode.get(node.id) ?? [];

          if (isRenaming) {
            return <React.Fragment key={node.id}>{renderInlineInput(depth)}</React.Fragment>;
          }

          return (
            <React.Fragment key={node.id}>
              <div
                style={{ paddingLeft: `${depth * 14 + 8}px` }}
                onClick={() => {
                  setContextMenu(null);
                  if (isFolder) {
                    setSelectedFolderId(node.id);
                    toggleFolder(node.id);
                  } else {
                    setSelectedFolderId(node.parentId);
                    onOpenNode(node);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({
                    x: Math.min(e.clientX, window.innerWidth - 170),
                    y: Math.min(e.clientY, window.innerHeight - 190),
                    targetNode: node,
                  });
                }}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes("Files")) {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragTargetFolderId(isFolder ? node.id : node.parentId ?? "ROOT");
                  }
                }}
                onDrop={(e) => {
                  if (e.dataTransfer.files.length > 0) {
                    void handleDropFiles(e, isFolder ? node.id : node.parentId);
                  }
                }}
                className={`h-[24px] pr-2 flex items-center justify-between cursor-pointer text-[13px] ${
                  isActive
                    ? "bg-[#37373d] text-white"
                    : dragTargetFolderId === node.id
                    ? "bg-[#094771] text-white"
                    : "hover:bg-[#2a2d2e] text-[#cccccc]"
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {isFolder ? (
                    <>
                      {isOpen ? (
                        <ChevronDown className="w-3.5 h-3.5 text-[#858585] shrink-0" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-[#858585] shrink-0" />
                      )}
                      {isOpen ? (
                        <FolderOpen className="w-3.5 h-3.5 text-[#dcb67a] shrink-0" />
                      ) : (
                        <Folder className="w-3.5 h-3.5 text-[#dcb67a] shrink-0" />
                      )}
                    </>
                  ) : (
                    <>
                      <span className="w-3.5 shrink-0" />
                      {getFileIcon(node)}
                    </>
                  )}
                  <span className="truncate">{node.name}</span>
                </div>

                {viewers.length > 0 && (
                  <div className="flex items-center gap-1 shrink-0 ml-1" title={viewers.map((v) => v.username).join(", ")}>
                    {viewers.slice(0, 3).map((v) => (
                      <span
                        key={v.userId}
                        className="w-2 h-2 inline-block"
                        style={{ backgroundColor: v.color }}
                      />
                    ))}
                  </div>
                )}
              </div>
              {isFolder && isOpen && renderNodes(node.id, depth + 1)}
            </React.Fragment>
          );
        })}
      </>
    );
  };

  return (
    <div
      className="h-full flex flex-col bg-[#252526] select-none relative"
      onClick={() => setContextMenu(null)}
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenu({
          x: Math.min(e.clientX, window.innerWidth - 170),
          y: Math.min(e.clientY, window.innerHeight - 190),
          targetNode: null,
        });
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragTargetFolderId("ROOT");
        }
      }}
      onDragLeave={() => setDragTargetFolderId(null)}
      onDrop={(e) => {
        if (e.dataTransfer.files.length > 0) {
          void handleDropFiles(e, selectedFolderId);
        }
      }}
    >
      <div className="h-[35px] px-3 flex items-center justify-between border-b border-[#3c3c3c] shrink-0">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#bbbbbb]">
          Explorer
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="New File"
            onClick={() => startCreate(selectedFolderId, "text_file")}
            className="p-1 hover:bg-[#3c3c3c] text-[#cccccc] cursor-pointer"
          >
            <FilePlus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="New Folder"
            onClick={() => startCreate(selectedFolderId, "folder")}
            className="p-1 hover:bg-[#3c3c3c] text-[#cccccc] cursor-pointer"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Upload Assets"
            onClick={() => triggerUploadDialog(selectedFolderId)}
            className="p-1 hover:bg-[#3c3c3c] text-[#cccccc] cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Refresh Explorer"
            onClick={() => void onRefresh()}
            className="p-1 hover:bg-[#3c3c3c] text-[#cccccc] cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <input
        ref={uploadInputRef}
        type="file"
        multiple
        accept=".png,.svg,.jpg,.jpeg,.gif,.webp,.ico,.wav,.mp3,.ogg,.json,.html,.css,.js,.ts,.tsx,.jsx,.md,.txt,.woff,.woff2,.ttf,.otf"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length > 0) {
            void onUploadFiles(files, uploadParentIdRef.current);
          }
        }}
      />

      <div
        className={`flex-1 overflow-y-auto py-1 ${
          dragTargetFolderId === "ROOT" ? "outline-1 outline-[#007acc] bg-[#094771]/20" : ""
        }`}
      >
        {nodes.length === 0 && !inlineAction ? (
          <div className="p-4 text-[12px] text-[#858585] leading-relaxed">
            Project is empty. Use the toolbar or right-click to create files or drag-and-drop PNG,
            SVG, JSON, WAV, or MP3 assets here.
          </div>
        ) : (
          renderNodes(null, 0)
        )}
      </div>

      <div className="px-3 py-1.5 border-t border-[#3c3c3c] text-[10px] text-[#858585]">
        Drag &amp; drop PNG, SVG, JSON, WAV, MP3 or fonts to upload
      </div>

      {contextMenu && (
        <div
          style={{ left: contextMenu.x, top: contextMenu.y }}
          className="fixed z-50 w-40 bg-[#252526] border border-[#454545] shadow-lg py-1 text-[12px] text-[#cccccc]"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              const targetParent =
                contextMenu.targetNode?.nodeType === "folder"
                  ? contextMenu.targetNode.id
                  : contextMenu.targetNode?.parentId ?? null;
              startCreate(targetParent, "text_file");
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[#094771] hover:text-white cursor-pointer"
          >
            New File
          </button>
          <button
            type="button"
            onClick={() => {
              const targetParent =
                contextMenu.targetNode?.nodeType === "folder"
                  ? contextMenu.targetNode.id
                  : contextMenu.targetNode?.parentId ?? null;
              startCreate(targetParent, "folder");
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[#094771] hover:text-white cursor-pointer"
          >
            New Folder
          </button>
          <button
            type="button"
            onClick={() => {
              const targetParent =
                contextMenu.targetNode?.nodeType === "folder"
                  ? contextMenu.targetNode.id
                  : contextMenu.targetNode?.parentId ?? null;
              triggerUploadDialog(targetParent);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[#094771] hover:text-white cursor-pointer"
          >
            Upload
          </button>
          {contextMenu.targetNode && (
            <>
              <div className="my-1 border-t border-[#3c3c3c]" />
              <button
                type="button"
                onClick={() => startRename(contextMenu.targetNode!)}
                className="w-full text-left px-3 py-1.5 hover:bg-[#094771] hover:text-white cursor-pointer"
              >
                Rename
              </button>
              <button
                type="button"
                onClick={() => {
                  const node = contextMenu.targetNode!;
                  setContextMenu(null);
                  void onDeleteNode(node.id);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#5a1d1d] text-[#f48771] cursor-pointer"
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
