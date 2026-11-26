import React, { useMemo, useState } from "react";
import { CheckCircle2, Circle, CornerDownRight, MessageSquare, Trash2, Send } from "lucide-react";
import type { AnvilComment, AnvilProjectNode } from "../types/anvil";

interface CommentsViewProps {
  comments: AnvilComment[];
  activeNode: AnvilProjectNode | null;
  currentUserId: string;
  isOwner: boolean;
  pendingPinTarget: { nodeId: string; lineNumber: number | null; seq: number } | null;
  onClearPendingPin: () => void;
  onJumpToComment: (nodeId: string, lineNumber: number | null) => void;
  onCreateComment: (input: {
    nodeId: string;
    parentCommentId?: string | null;
    lineNumber?: number | null;
    body: string;
  }) => Promise<void>;
  onToggleResolve: (commentId: string, resolved: boolean) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
  compact?: boolean;
}

export const CommentsView: React.FC<CommentsViewProps> = ({
  comments,
  activeNode,
  currentUserId,
  isOwner,
  pendingPinTarget,
  onClearPendingPin,
  onJumpToComment,
  onCreateComment,
  onToggleResolve,
  onDeleteComment,
  compact = false,
}) => {
  const [filter, setFilter] = useState<"all" | "open" | "resolved" | "file">("open");
  const [newBody, setNewBody] = useState("");
  const [lineInput, setLineInput] = useState<string>("");
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [busy, setBusy] = useState(false);

  const effectiveTargetNodeId = pendingPinTarget?.nodeId ?? activeNode?.id ?? null;

  React.useEffect(() => {
    if (pendingPinTarget) {
      setLineInput(pendingPinTarget.lineNumber ? String(pendingPinTarget.lineNumber) : "");
    }
  }, [pendingPinTarget]);

  const { roots, repliesByParent } = useMemo(() => {
    const r: AnvilComment[] = [];
    const map = new Map<string, AnvilComment[]>();
    for (const c of comments) {
      if (!c.parentCommentId) {
        r.push(c);
      } else {
        const list = map.get(c.parentCommentId) ?? [];
        list.push(c);
        map.set(c.parentCommentId, list);
      }
    }
    return { roots: r, repliesByParent: map };
  }, [comments]);

  const filteredRoots = useMemo(() => {
    return roots.filter((c) => {
      if (filter === "open") return !c.resolved;
      if (filter === "resolved") return c.resolved;
      if (filter === "file") return activeNode ? c.nodeId === activeNode.id : true;
      return true;
    });
  }, [roots, filter, activeNode]);

  const handlePostNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveTargetNodeId || !newBody.trim()) return;
    setBusy(true);
    try {
      const parsedLine = lineInput.trim() ? Number.parseInt(lineInput.trim(), 10) : null;
      await onCreateComment({
        nodeId: effectiveTargetNodeId,
        parentCommentId: null,
        lineNumber: parsedLine && parsedLine > 0 ? parsedLine : null,
        body: newBody.trim(),
      });
      setNewBody("");
      onClearPendingPin();
    } finally {
      setBusy(false);
    }
  };

  const handlePostReply = async (e: React.FormEvent, root: AnvilComment) => {
    e.preventDefault();
    if (!replyBody.trim()) return;
    setBusy(true);
    try {
      await onCreateComment({
        nodeId: root.nodeId,
        parentCommentId: root.id,
        lineNumber: root.lineNumber,
        body: replyBody.trim(),
      });
      setReplyBody("");
      setReplyingToId(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e] text-[#cccccc]">
      {/* Filter Bar */}
      <div className="px-3 py-1.5 border-b border-[#3c3c3c] bg-[#252526] flex items-center justify-between gap-2 shrink-0 flex-wrap">
        <div className="flex items-center gap-1 text-[11px]">
          {(
            [
              ["open", "Open"],
              ["all", "All"],
              ["resolved", "Resolved"],
              ["file", "Current File"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`px-2 py-0.5 cursor-pointer ${
                filter === key
                  ? "bg-[#007acc] text-white"
                  : "bg-[#333333] text-[#9d9d9d] hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {!compact && activeNode && activeNode.nodeType !== "folder" && (
          <form onSubmit={handlePostNew} className="flex items-center gap-1.5 flex-1 max-w-2xl">
            <span className="text-[11px] text-[#858585] font-mono truncate max-w-[140px]">
              {activeNode.name}
            </span>
            {activeNode.nodeType === "text_file" && (
              <input
                type="number"
                min={1}
                value={lineInput}
                onChange={(e) => setLineInput(e.target.value)}
                placeholder="Ln"
                className="w-14 bg-[#3c3c3c] border border-[#3c3c3c] focus:border-[#007acc] focus:outline-none px-1.5 py-0.5 text-[11px] font-mono text-white"
              />
            )}
            <input
              type="text"
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              placeholder={`Pin comment on ${activeNode.name}...`}
              className="flex-1 min-w-0 bg-[#3c3c3c] border border-[#3c3c3c] focus:border-[#007acc] focus:outline-none px-2 py-0.5 text-[12px] text-white"
            />
            <button
              type="submit"
              disabled={busy || !newBody.trim()}
              className="bg-[#007acc] hover:bg-[#1f8ad2] disabled:opacity-50 text-white px-2.5 py-0.5 text-[11px] flex items-center gap-1 cursor-pointer"
            >
              <Send className="w-3 h-3" />
              Pin
            </button>
          </form>
        )}
      </div>

      {/* Thread List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {filteredRoots.length === 0 ? (
          <div className="p-4 text-[12px] text-[#858585] flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            <span>
              No comments match this filter. Open a file or asset and pin a comment to collaborate.
            </span>
          </div>
        ) : (
          filteredRoots.map((root) => {
            const replies = repliesByParent.get(root.id) ?? [];
            const canDelete = root.authorId === currentUserId || isOwner;
            return (
              <div
                key={root.id}
                className={`border border-[#3c3c3c] bg-[#252526] p-2.5 ${
                  root.resolved ? "opacity-65" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onJumpToComment(root.nodeId, root.lineNumber)}
                    className="text-left group cursor-pointer min-w-0"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-mono text-[#9cdcfe] group-hover:underline">
                        {root.nodePath ?? root.node?.name ?? "file"}
                        {root.lineNumber ? `:${root.lineNumber}` : " (asset)"}
                      </span>
                      <span className="text-[11px] text-[#858585]">
                        by <strong className="text-[#cccccc]">{root.author?.username ?? "Member"}</strong>
                      </span>
                      {root.resolved && (
                        <span className="text-[10px] px-1.5 py-0 bg-[#1b3a2b] text-[#89d185] border border-[#2ea043]">
                          Resolved
                        </span>
                      )}
                    </div>
                  </button>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => void onToggleResolve(root.id, !root.resolved)}
                      title={root.resolved ? "Reopen thread" : "Resolve thread"}
                      className="text-[11px] px-1.5 py-0.5 bg-[#333333] hover:bg-[#3c3c3c] text-[#cccccc] flex items-center gap-1 cursor-pointer"
                    >
                      {root.resolved ? (
                        <CheckCircle2 className="w-3 h-3 text-[#89d185]" />
                      ) : (
                        <Circle className="w-3 h-3 text-[#858585]" />
                      )}
                      {root.resolved ? "Reopen" : "Resolve"}
                    </button>

                    <button
                      type="button"
                      onClick={() => setReplyingToId(replyingToId === root.id ? null : root.id)}
                      className="text-[11px] px-1.5 py-0.5 bg-[#333333] hover:bg-[#3c3c3c] text-[#cccccc] cursor-pointer"
                    >
                      Reply
                    </button>

                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => void onDeleteComment(root.id)}
                        title="Delete comment thread"
                        className="p-0.5 text-[#858585] hover:text-[#f48771] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <p
                  onClick={() => onJumpToComment(root.nodeId, root.lineNumber)}
                  className="text-[12px] text-white mt-1.5 whitespace-pre-wrap cursor-pointer"
                >
                  {root.body}
                </p>

                {replies.length > 0 && (
                  <div className="mt-2 pl-3 border-l border-[#3c3c3c] space-y-1.5">
                    {replies.map((rep) => (
                      <div key={rep.id} className="text-[12px]">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-[#9d9d9d]">
                            <CornerDownRight className="w-3 h-3 inline mr-1" />
                            <strong className="text-[#cccccc]">{rep.author?.username ?? "Member"}</strong>
                          </span>
                          {(rep.authorId === currentUserId || isOwner) && (
                            <button
                              type="button"
                              onClick={() => void onDeleteComment(rep.id)}
                              className="text-[#858585] hover:text-[#f48771] cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <p className="text-[#e5e5e5] mt-0.5 whitespace-pre-wrap">{rep.body}</p>
                      </div>
                    ))}
                  </div>
                )}

                {replyingToId === root.id && (
                  <form onSubmit={(e) => void handlePostReply(e, root)} className="mt-2 flex gap-1.5">
                    <input
                      autoFocus
                      type="text"
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      placeholder="Write a reply..."
                      className="flex-1 bg-[#3c3c3c] border border-[#007acc] focus:outline-none px-2 py-1 text-[12px] text-white"
                    />
                    <button
                      type="submit"
                      disabled={busy || !replyBody.trim()}
                      className="bg-[#007acc] hover:bg-[#1f8ad2] disabled:opacity-50 text-white px-2.5 py-1 text-[11px] cursor-pointer"
                    >
                      Reply
                    </button>
                  </form>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
