import React, { useEffect, useMemo, useState } from "react";
import { FileCode2, Search } from "lucide-react";
import type { AnvilProjectNode } from "../types/anvil";

interface QuickOpenModalProps {
  open: boolean;
  nodes: AnvilProjectNode[];
  onClose: () => void;
  onSelect: (node: AnvilProjectNode) => void;
}

export const QuickOpenModal: React.FC<QuickOpenModalProps> = ({
  open,
  nodes,
  onClose,
  onSelect,
}) => {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);

  const files = useMemo(
    () =>
      nodes
        .filter((n) => n.nodeType !== "folder")
        .sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
    [nodes]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) => f.relativePath.toLowerCase().includes(q));
  }, [files, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
    }
  }, [open]);

  useEffect(() => {
    if (selectedIdx >= filtered.length) {
      setSelectedIdx(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, selectedIdx]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-14"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl anvil-poly-frame shadow-2xl"
        style={{ "--anvil-c": "8px" } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#3c3c3c] bg-[#3c3c3c]/40">
          <Search className="w-4 h-4 text-[#858585]" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelectedIdx((i) => Math.min(filtered.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedIdx((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter" && filtered[selectedIdx]) {
                e.preventDefault();
                onSelect(filtered[selectedIdx]!);
                onClose();
              }
            }}
            placeholder="Quick Open file by name (Ctrl/Cmd+P)..."
            className="flex-1 bg-transparent focus:outline-none text-[13px] text-white font-mono"
          />
        </div>

        <div className="max-h-72 overflow-y-auto divide-y divide-[#2d2d2d]">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-[12px] text-[#858585]">No matching files.</div>
          ) : (
            filtered.map((file, idx) => (
              <button
                key={file.id}
                type="button"
                onClick={() => {
                  onSelect(file);
                  onClose();
                }}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 text-[12px] font-mono cursor-pointer ${
                  idx === selectedIdx
                    ? "bg-[#094771] text-white"
                    : "hover:bg-[#2a2d2e] text-[#cccccc]"
                }`}
              >
                <FileCode2 className="w-3.5 h-3.5 text-[#569cd6] shrink-0" />
                <span className="truncate">{file.relativePath}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
