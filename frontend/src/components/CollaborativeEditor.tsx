import React, { useEffect, useMemo, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type * as MonacoNs from "monaco-editor";
import * as Y from "yjs";
import { MonacoBinding } from "y-monaco";
import { WebsocketProvider } from "y-websocket";
import {
  Grid,
  MessageSquarePlus,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { ROLE_LABELS, type ProjectRole } from "../../../appConfig";
import { api, getIdToken, getWsBaseUrl } from "../services/api";
import type { AnvilComment, AnvilProjectNode, ProblemEntry } from "../types/anvil";

interface CollaborativeEditorProps {
  projectId: string;
  node: AnvilProjectNode;
  username: string;
  role: ProjectRole;
  userColor: string;
  comments: AnvilComment[];
  jumpToLineRequest: { nodeId: string; line: number; seq: number } | null;
  assetVersion: number;
  onCursorChange: (line: number, column: number) => void;
  onSyncStateChange: (state: "synced" | "syncing" | "offline") => void;
  onProblemsChange: (nodeId: string, filePath: string, problems: ProblemEntry[]) => void;
  onRequestPinComment: (nodeId: string, lineNumber: number | null) => void;
}

function detectLanguage(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".scss")) return "scss";
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) return "javascript";
  if (lower.endsWith(".jsx")) return "javascript";
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".md")) return "markdown";
  if (lower.endsWith(".xml") || lower.endsWith(".svg")) return "xml";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "yaml";
  return "plaintext";
}

function isImageFile(name: string): boolean {
  return /\.(png|svg|jpg|jpeg|gif|webp|ico)$/i.test(name);
}

function isAudioFile(name: string): boolean {
  return /\.(wav|mp3|ogg)$/i.test(name);
}

function isFontFile(name: string): boolean {
  return /\.(woff|woff2|ttf|otf)$/i.test(name);
}

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export const CollaborativeEditor: React.FC<CollaborativeEditorProps> = ({
  projectId,
  node,
  username,
  role,
  userColor,
  comments,
  jumpToLineRequest,
  assetVersion,
  onCursorChange,
  onSyncStateChange,
  onProblemsChange,
  onRequestPinComment,
}) => {
  const editorRef = useRef<MonacoNs.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof MonacoNs | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  const commentDecorationsRef = useRef<string[]>([]);
  const styleTagRef = useRef<HTMLStyleElement | null>(null);
  const [editorReadySeq, setEditorReadySeq] = useState(0);
  const [currentLine, setCurrentLine] = useState(1);

  // Asset preview state
  const [assetUrl, setAssetUrl] = useState<string | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [checkerboard, setCheckerboard] = useState(true);
  const [imgDimensions, setImgDimensions] = useState<{ w: number; h: number } | null>(null);

  // Audio player state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [muted, setMuted] = useState(false);

  // Font preview state
  const [fontFamilyName, setFontFamilyName] = useState<string | null>(null);

  const isBinary = node.nodeType === "binary_asset";

  // Load binary asset blob when viewing media
  useEffect(() => {
    if (!isBinary) {
      setAssetUrl(null);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    setAssetError(null);
    setImgDimensions(null);
    setPlaying(false);
    setAudioCurrentTime(0);
    setAudioDuration(0);

    void (async () => {
      try {
        const url = await api.fetchNodeBlobUrl(projectId, node.id);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        createdUrl = url;
        setAssetUrl(url);

        if (isFontFile(node.name)) {
          const family = `anvil-preview-${node.id.slice(0, 8)}-${assetVersion}`;
          const face = new FontFace(family, `url(${url})`);
          await face.load();
          if (!cancelled) {
            document.fonts.add(face);
            setFontFamilyName(family);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setAssetError(err instanceof Error ? err.message : "Could not load asset.");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [isBinary, projectId, node.id, node.name, assetVersion]);

  // Connect Yjs WebSocket + y-monaco for text files
  useEffect(() => {
    if (isBinary) return;
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!editor || !monaco || !model) return;

    let disposed = false;
    onSyncStateChange("syncing");

    const styleEl = document.createElement("style");
    styleEl.setAttribute("data-anvil-cursors", node.id);
    document.head.appendChild(styleEl);
    styleTagRef.current = styleEl;

    void (async () => {
      try {
        const token = await getIdToken();
        if (disposed) return;

        const ydoc = new Y.Doc();
        ydocRef.current = ydoc;
        const yText = ydoc.getText("monaco");

        const roomName = `${projectId}:${node.id}`;
        const provider = new WebsocketProvider(getWsBaseUrl(), roomName, ydoc, {
          params: { token },
        });
        providerRef.current = provider;

        const updateRemoteCursorCss = () => {
          const rules: string[] = [];
          provider.awareness.getStates().forEach((state, clientId) => {
            if (clientId === ydoc.clientID) return;
            const u = state.user as { name?: string; role?: string; color?: string } | undefined;
            if (!u?.name) return;
            const color = u.color || "#4ec9b0";
            const label = `${u.name} · ${u.role || "Coder"}`
              .replace(/\\/g, "\\\\")
              .replace(/"/g, '\\"');
            rules.push(`
              .yRemoteSelection-${clientId} { background-color: ${color}3d; }
              .yRemoteSelectionHead-${clientId} { border-color: ${color}; }
              .yRemoteSelectionHead-${clientId}::after {
                content: "${label}";
                position: absolute;
                top: -17px;
                left: -2px;
                background-color: ${color};
                color: #1e1e1e;
                font-family: system-ui, sans-serif;
                font-size: 10px;
                font-weight: 700;
                line-height: 14px;
                padding: 0 5px;
                white-space: nowrap;
                pointer-events: none;
                z-index: 30;
              }
            `);
          });
          if (styleTagRef.current) {
            styleTagRef.current.textContent = rules.join("\n");
          }
        };

        provider.awareness.setLocalStateField("user", {
          name: username,
          role: ROLE_LABELS[role],
          color: userColor,
        });

        provider.awareness.on("change", updateRemoteCursorCss);
        provider.on("status", ({ status }: { status: "connected" | "disconnected" | "connecting" }) => {
          if (status === "disconnected") {
            onSyncStateChange("offline");
          } else if (status === "connecting") {
            onSyncStateChange("syncing");
          } else if (provider.synced) {
            onSyncStateChange("synced");
          }
        });
        provider.on("sync", (synced: boolean) => {
          onSyncStateChange(synced ? "synced" : "syncing");
        });

        const binding = new MonacoBinding(
          yText,
          model,
          new Set([editor]),
          provider.awareness
        );
        bindingRef.current = binding;
      } catch {
        onSyncStateChange("offline");
      }
    })();

    return () => {
      disposed = true;
      bindingRef.current?.destroy();
      bindingRef.current = null;
      providerRef.current?.destroy();
      providerRef.current = null;
      ydocRef.current?.destroy();
      ydocRef.current = null;
      if (styleTagRef.current) {
        styleTagRef.current.remove();
        styleTagRef.current = null;
      }
    };
  }, [isBinary, projectId, node.id, editorReadySeq]);

  // Keep awareness role/username updated without recreating WebSocket
  useEffect(() => {
    const provider = providerRef.current;
    if (!provider) return;
    provider.awareness.setLocalStateField("user", {
      name: username,
      role: ROLE_LABELS[role],
      color: userColor,
    });
  }, [username, role, userColor]);

  // Comment gutter markers in Monaco
  const fileComments = useMemo(
    () =>
      comments.filter(
        (c) => c.nodeId === node.id && c.parentCommentId === null && c.lineNumber !== null
      ),
    [comments, node.id]
  );

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || isBinary) return;

    const decorations: MonacoNs.editor.IModelDeltaDecoration[] = fileComments.map((c) => ({
      range: new monaco.Range(c.lineNumber!, 1, c.lineNumber!, 1),
      options: {
        isWholeLine: false,
        glyphMarginClassName: "anvil-comment-glyph",
        glyphMarginHoverMessage: {
          value: `**${c.author?.username ?? "Member"}**${c.resolved ? " (resolved)" : ""}: ${c.body}`,
        },
      },
    }));

    commentDecorationsRef.current = editor.deltaDecorations(
      commentDecorationsRef.current,
      decorations
    );
  }, [fileComments, isBinary, editorReadySeq]);

  // Jump to requested line when user clicks a comment in the Comments panel
  useEffect(() => {
    if (!jumpToLineRequest || jumpToLineRequest.nodeId !== node.id || isBinary) return;
    const editor = editorRef.current;
    if (!editor) return;
    editor.revealLineInCenter(jumpToLineRequest.line);
    editor.setPosition({ lineNumber: jumpToLineRequest.line, column: 1 });
    editor.focus();
  }, [jumpToLineRequest, node.id, isBinary, editorReadySeq]);

  const handleMonacoMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    editor.onDidChangeCursorPosition((ev) => {
      setCurrentLine(ev.position.lineNumber);
      onCursorChange(ev.position.lineNumber, ev.position.column);
    });

    editor.addAction({
      id: "anvil.pinCommentOnLine",
      label: "Anvil: Pin Comment to Line",
      contextMenuGroupId: "9_cutcopypaste",
      contextMenuOrder: 99,
      run: (ed) => {
        const pos = ed.getPosition();
        onRequestPinComment(node.id, pos?.lineNumber ?? 1);
      },
    });

    const markerListener = monaco.editor.onDidChangeMarkers((uris) => {
      const model = editor.getModel();
      if (!model) return;
      if (!uris.some((u) => u.toString() === model.uri.toString())) return;
      const markers = monaco.editor.getModelMarkers({ resource: model.uri });
      const mapped: ProblemEntry[] = markers.map((m) => ({
        nodeId: node.id,
        filePath: node.relativePath,
        line: m.startLineNumber,
        column: m.startColumn,
        severity:
          m.severity === monaco.MarkerSeverity.Error
            ? "error"
            : m.severity === monaco.MarkerSeverity.Warning
            ? "warning"
            : "info",
        message: m.message,
        source: m.source,
      }));
      onProblemsChange(node.id, node.relativePath, mapped);
    });

    editor.onDidDispose(() => {
      markerListener.dispose();
    });

    setEditorReadySeq((s) => s + 1);
  };

  if (isBinary) {
    return (
      <div className="h-full flex flex-col bg-[#1e1e1e]">
        <div className="h-9 px-3 border-b border-[#3c3c3c] bg-[#252526] flex items-center justify-between text-[12px] shrink-0">
          <div className="flex items-center gap-2 font-mono text-[#cccccc]">
            <span>{node.relativePath}</span>
            {imgDimensions && (
              <span className="text-[11px] text-[#858585]">
                {imgDimensions.w} × {imgDimensions.h}px
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isImageFile(node.name) && (
              <>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.25, Number((z - 0.25).toFixed(2))))}
                  title="Zoom Out"
                  className="anvil-btn anvil-btn-sm anvil-btn-secondary p-1 text-[#cccccc] hover:text-white cursor-pointer"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-[11px] w-12 text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(8, Number((z + 0.25).toFixed(2))))}
                  title="Zoom In"
                  className="anvil-btn anvil-btn-sm anvil-btn-secondary p-1 text-[#cccccc] hover:text-white cursor-pointer"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(1)}
                  title="Reset Zoom"
                  className="anvil-btn anvil-btn-sm anvil-btn-secondary p-1 text-[#cccccc] hover:text-white cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setCheckerboard((c) => !c)}
                  className={`anvil-btn anvil-btn-sm px-2.5 py-1 text-[11px] flex items-center gap-1 cursor-pointer ${
                    checkerboard
                      ? "anvil-btn-active text-white"
                      : "anvil-btn-secondary text-[#cccccc]"
                  }`}
                >
                  <Grid className="w-3 h-3" />
                  Checkerboard
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => onRequestPinComment(node.id, null)}
              className="anvil-btn anvil-btn-sm anvil-btn-primary px-2.5 py-1 text-white text-[11px] flex items-center gap-1 cursor-pointer"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              Pin Comment
            </button>
          </div>
        </div>

        <div
          className={`flex-1 overflow-auto flex items-center justify-center p-6 ${
            isImageFile(node.name) && checkerboard ? "checkerboard-bg" : "bg-[#1e1e1e]"
          }`}
        >
          {assetError && <div className="text-[12px] text-[#f48771]">{assetError}</div>}
          {!assetError && !assetUrl && (
            <div className="text-[12px] text-[#858585]">Loading asset...</div>
          )}

          {assetUrl && isImageFile(node.name) && (
            <img
              src={assetUrl}
              alt={node.name}
              onLoad={(e) => {
                const img = e.currentTarget;
                setImgDimensions({ w: img.naturalWidth, h: img.naturalHeight });
              }}
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: "center center",
                imageRendering: zoom >= 2 ? "pixelated" : "auto",
              }}
              className="max-w-none transition-transform duration-75"
            />
          )}

          {assetUrl && isAudioFile(node.name) && (
            <div className="w-full max-w-md anvil-poly-frame p-5 space-y-4">
              <div className="text-[13px] font-medium text-white font-mono truncate">
                {node.name}
              </div>
              <audio
                ref={audioRef}
                src={assetUrl}
                muted={muted}
                onLoadedMetadata={(e) => setAudioDuration(e.currentTarget.duration || 0)}
                onTimeUpdate={(e) => setAudioCurrentTime(e.currentTarget.currentTime || 0)}
                onEnded={() => setPlaying(false)}
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const el = audioRef.current;
                    if (!el) return;
                    if (playing) {
                      el.pause();
                      setPlaying(false);
                    } else {
                      void el.play();
                      setPlaying(true);
                    }
                  }}
                  className="anvil-btn anvil-btn-sm anvil-btn-primary text-white p-2 cursor-pointer"
                >
                  {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>

                <input
                  type="range"
                  min={0}
                  max={audioDuration || 100}
                  step={0.05}
                  value={audioCurrentTime}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    if (audioRef.current) {
                      audioRef.current.currentTime = next;
                    }
                    setAudioCurrentTime(next);
                  }}
                  className="flex-1 accent-[#007acc] cursor-pointer"
                />

                <span className="font-mono text-[11px] text-[#cccccc] w-20 text-right">
                  {formatDuration(audioCurrentTime)} / {formatDuration(audioDuration)}
                </span>

                <button
                  type="button"
                  onClick={() => setMuted((m) => !m)}
                  className="anvil-btn anvil-btn-sm anvil-btn-secondary p-1.5 text-[#cccccc] hover:text-white cursor-pointer"
                >
                  {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {assetUrl && isFontFile(node.name) && (
            <div
              className="max-w-xl anvil-poly-frame p-6 space-y-4 text-white"
              style={{ fontFamily: fontFamilyName ?? "inherit" }}
            >
              <div className="text-[11px] font-sans uppercase tracking-wider text-[#858585]">
                Font Preview · {node.name}
              </div>
              <div className="text-2xl">The quick brown fox jumps over the lazy dog.</div>
              <div className="text-base">ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789 !@#$%^&amp;*()</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e]">
      <div className="h-7 px-3 border-b border-[#3c3c3c] bg-[#1e1e1e] flex items-center justify-between text-[11px] text-[#858585] shrink-0">
        <span className="font-mono truncate">{node.relativePath}</span>
        <button
          type="button"
          onClick={() => onRequestPinComment(node.id, currentLine)}
          className="text-[#9cdcfe] hover:text-white flex items-center gap-1 cursor-pointer"
        >
          <MessageSquarePlus className="w-3.5 h-3.5" />
          Pin Comment (Ln {currentLine})
        </button>
      </div>
      <div className="flex-1 min-h-0">
        <Editor
          key={node.id}
          height="100%"
          theme="vs-dark"
          path={`anvil://${projectId}/${node.relativePath}`}
          language={detectLanguage(node.name)}
          defaultValue=""
          onMount={handleMonacoMount}
          options={{
            fontFamily: "Consolas, Menlo, Monaco, 'Courier New', monospace",
            fontSize: 13,
            minimap: { enabled: true },
            glyphMargin: true,
            automaticLayout: true,
            tabSize: 2,
            insertSpaces: true,
            scrollBeyondLastLine: false,
            wordWrap: "off",
          }}
        />
      </div>
    </div>
  );
};
