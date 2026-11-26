import React, { useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCw, Play } from "lucide-react";
import { api, apiUrl } from "../services/api";
import type { AnvilProjectNode } from "../types/anvil";

interface LivePreviewPaneProps {
  projectId: string;
  entryFile: string;
  nodes: AnvilProjectNode[];
  reloadSeq: number;
  onChangeEntryFile: (entryFile: string) => Promise<void>;
}

export const LivePreviewPane: React.FC<LivePreviewPaneProps> = ({
  projectId,
  entryFile,
  nodes,
  reloadSeq,
  onChangeEntryFile,
}) => {
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const [manualTick, setManualTick] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const htmlFiles = useMemo(
    () =>
      nodes
        .filter((n) => n.nodeType === "text_file" && /\.html?$/i.test(n.name))
        .map((n) => n.relativePath),
    [nodes]
  );

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void (async () => {
      try {
        const res = await api.issuePreviewToken(projectId);
        if (!cancelled) setPreviewToken(res.token);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not initialize preview.");
        }
      }
    })();

    // Refresh short-lived capability token every 20 minutes
    const timer = setInterval(() => {
      void api
        .issuePreviewToken(projectId)
        .then((r) => {
          if (!cancelled) setPreviewToken(r.token);
        })
        .catch(() => undefined);
    }, 20 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [projectId]);

  const cleanEntry = (entryFile || "index.html").replace(/^\/+/, "");
  const iframeSrc = previewToken
    ? apiUrl(`/api/preview/${projectId}/t/${previewToken}/${cleanEntry}?v=${reloadSeq}_${manualTick}`)
    : "";

  const handleOpenInNewTab = async () => {
    try {
      const { token } = await api.issuePreviewToken(projectId);
      const url = apiUrl(`/api/preview/${projectId}/t/${token}/${cleanEntry}`);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open preview tab.");
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e] border-l border-[#3c3c3c]">
      <div className="h-[35px] px-3 bg-[#252526] border-b border-[#3c3c3c] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Play className="w-3.5 h-3.5 text-[#4ec9b0] shrink-0" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#bbbbbb] shrink-0">
            Live Preview
          </span>
          <select
            value={cleanEntry}
            onChange={(e) => void onChangeEntryFile(e.target.value)}
            title="Preview Entry File"
            className="bg-[#3c3c3c] border border-[#3c3c3c] focus:border-[#007acc] focus:outline-none px-1.5 py-0.5 text-[11px] font-mono text-[#cccccc] max-w-[140px]"
          >
            {!htmlFiles.includes(cleanEntry) && <option value={cleanEntry}>{cleanEntry}</option>}
            {htmlFiles.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            title="Refresh Live Preview"
            onClick={() => setManualTick((t) => t + 1)}
            className="anvil-btn anvil-btn-ghost p-1 text-[#cccccc] hover:text-white cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Open Preview in New Tab"
            onClick={() => void handleOpenInNewTab()}
            className="anvil-btn anvil-btn-ghost p-1 text-[#cccccc] hover:text-white cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 bg-white relative min-h-0">
        {error ? (
          <div className="h-full w-full bg-[#1e1e1e] text-[#f48771] p-4 text-[12px]">{error}</div>
        ) : iframeSrc ? (
          <iframe
            title="Anvil Live Preview"
            src={iframeSrc}
            sandbox="allow-scripts allow-forms allow-modals"
            className="w-full h-full border-0 bg-[#141416]"
          />
        ) : (
          <div className="h-full w-full bg-[#1e1e1e] text-[#858585] p-4 text-[12px]">
            Starting preview...
          </div>
        )}
      </div>
    </div>
  );
};
