import crypto from "crypto";
import type { Server as SocketIOServer, Socket } from "socket.io";
import type { ProjectRole } from "../../../appConfig.js";
import { env } from "../config/env.js";
import { assertProjectAccess } from "../middleware/accessControl.js";
import { verifyVerifiedRegisteredUser } from "../middleware/auth.js";
import { canSessionPersist, db, newUuid, type DbSession } from "./db.js";
import { revokePreviewTokensForUser } from "./previewTokens.js";
import type { YjsCollaborationServer } from "./yjsServer.js";

const SESSION_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export interface OnlinePresenceEntry {
  userId: string;
  username: string;
  role: ProjectRole;
  activeNodeId: string | null;
  activeFilePath: string | null;
  color: string;
}

interface SocketUserMeta {
  userId: string;
  username: string;
  projectId: string;
  role: ProjectRole;
  activeNodeId: string | null;
  activeFilePath: string | null;
  color: string;
}

const CURSOR_PALETTE = [
  "#4ec9b0",
  "#ce9178",
  "#c586c0",
  "#dcdcaa",
  "#569cd6",
  "#d16969",
  "#b5cea8",
  "#9cdcfe",
];

function colorForUserId(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return CURSOR_PALETTE[hash % CURSOR_PALETTE.length]!;
}

export function generateSessionCode(): string {
  const bytes = crypto.randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += SESSION_CODE_ALPHABET[bytes[i]! % SESSION_CODE_ALPHABET.length];
  }
  return code;
}

export class SessionManager {
  private io: SocketIOServer;
  private yjs: YjsCollaborationServer;
  private socketMeta = new Map<string, SocketUserMeta>();
  private hostGraceTimers = new Map<string, NodeJS.Timeout>();
  private previewDebounceTimers = new Map<string, NodeJS.Timeout>();

  constructor(io: SocketIOServer, yjs: YjsCollaborationServer) {
    this.io = io;
    this.yjs = yjs;
  }

  initSocketHandlers(): void {
    this.io.use(async (socket, next) => {
      try {
        const token =
          (typeof socket.handshake.auth?.token === "string" && socket.handshake.auth.token) ||
          (typeof socket.handshake.query?.token === "string" && socket.handshake.query.token) ||
          "";
        if (!token) {
          next(new Error("Missing authentication token."));
          return;
        }
        const { user } = await verifyVerifiedRegisteredUser(token);
        socket.data.user = user;
        next();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unauthorized";
        next(new Error(msg));
      }
    });

    this.io.on("connection", (socket) => {
      const user = socket.data.user as { id: string; username: string };

      socket.on(
        "project:join",
        async (
          payload: { projectId: string; role?: ProjectRole },
          ack?: (res: { ok: boolean; error?: string; presence?: OnlinePresenceEntry[] }) => void
        ) => {
          try {
            if (!payload?.projectId) {
              ack?.({ ok: false, error: "projectId is required." });
              return;
            }
            await assertProjectAccess(payload.projectId, user.id);

            // Leave previous project room if switching projects on same socket
            const prev = this.socketMeta.get(socket.id);
            if (prev && prev.projectId !== payload.projectId) {
              socket.leave(this.roomName(prev.projectId));
              this.socketMeta.delete(socket.id);
              this.broadcastPresence(prev.projectId);
            }

            // Determine role from active session_members if present, else payload or 'coder'
            const activeSession = await db.getActiveSessionForProject(payload.projectId);
            let resolvedRole: ProjectRole = payload.role ?? "coder";
            if (activeSession) {
              const smList = await db.listSessionMembers(activeSession.id);
              const existingSm = smList.find((m) => m.userId === user.id);
              if (existingSm) {
                resolvedRole = payload.role ?? existingSm.role;
                if (payload.role && payload.role !== existingSm.role) {
                  await db.upsertSessionMember({
                    sessionId: activeSession.id,
                    userId: user.id,
                    role: payload.role,
                  });
                }
              }
              if (activeSession.hostId === user.id) {
                this.cancelHostGraceTimer(activeSession.id);
              }
            }

            const meta: SocketUserMeta = {
              userId: user.id,
              username: user.username,
              projectId: payload.projectId,
              role: resolvedRole,
              activeNodeId: null,
              activeFilePath: null,
              color: colorForUserId(user.id),
            };
            this.socketMeta.set(socket.id, meta);
            await socket.join(this.roomName(payload.projectId));

            const presence = this.getProjectPresence(payload.projectId);
            this.broadcastPresence(payload.projectId);
            ack?.({ ok: true, presence });
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Forbidden";
            ack?.({ ok: false, error: message });
          }
        }
      );

      socket.on("presence:active-file", (payload: { nodeId: string | null; filePath: string | null }) => {
        const meta = this.socketMeta.get(socket.id);
        if (!meta) return;
        meta.activeNodeId = payload?.nodeId ?? null;
        meta.activeFilePath = payload?.filePath ?? null;
        this.broadcastPresence(meta.projectId);
      });

      socket.on("presence:role", async (payload: { role: ProjectRole }) => {
        const meta = this.socketMeta.get(socket.id);
        if (!meta || !payload?.role) return;
        meta.role = payload.role;
        const activeSession = await db.getActiveSessionForProject(meta.projectId);
        if (activeSession) {
          await db
            .upsertSessionMember({
              sessionId: activeSession.id,
              userId: meta.userId,
              role: payload.role,
            })
            .catch(() => undefined);
        }
        this.broadcastPresence(meta.projectId);
      });

      socket.on("disconnect", () => {
        const meta = this.socketMeta.get(socket.id);
        if (!meta) return;
        this.socketMeta.delete(socket.id);
        this.broadcastPresence(meta.projectId);
        void this.maybeScheduleHostGraceTimer(meta.projectId, meta.userId);
      });
    });
  }

  /**
   * Called at backend boot to handle non-persistent active sessions left over from a crash/restart.
   */
  async reconcileActiveSessionsOnBoot(): Promise<void> {
    const maxAttempts = 8;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const active = await db.listActiveSessions();
        for (const session of active) {
          if (!canSessionPersist(session)) {
            this.scheduleHostGraceTimer(session);
          }
        }
        return;
      } catch (err) {
        if (attempt === maxAttempts) {
          console.warn("[Anvil] Could not reconcile active sessions on boot:", err);
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  private roomName(projectId: string): string {
    return `project:${projectId}`;
  }

  getProjectPresence(projectId: string): OnlinePresenceEntry[] {
    const byUser = new Map<string, OnlinePresenceEntry>();
    for (const meta of this.socketMeta.values()) {
      if (meta.projectId !== projectId) continue;
      const existing = byUser.get(meta.userId);
      // Prefer socket entry that currently has an active file selected
      if (!existing || (meta.activeNodeId && !existing.activeNodeId)) {
        byUser.set(meta.userId, {
          userId: meta.userId,
          username: meta.username,
          role: meta.role,
          activeNodeId: meta.activeNodeId,
          activeFilePath: meta.activeFilePath,
          color: meta.color,
        });
      }
    }
    return Array.from(byUser.values());
  }

  broadcastPresence(projectId: string): void {
    const presence = this.getProjectPresence(projectId);
    this.io.to(this.roomName(projectId)).emit("presence:updated", { projectId, presence });
  }

  emitTreeUpdated(projectId: string): void {
    this.io.to(this.roomName(projectId)).emit("tree:updated", { projectId });
  }

  emitMembersUpdated(projectId: string): void {
    this.io.to(this.roomName(projectId)).emit("members:updated", { projectId });
  }

  emitCommentsUpdated(projectId: string): void {
    this.io.to(this.roomName(projectId)).emit("comments:updated", { projectId });
  }

  emitGitLog(projectId: string, event: { stream: "stdout" | "stderr" | "info" | "error"; line: string }): void {
    this.io.to(this.roomName(projectId)).emit("git:log", { projectId, ...event });
  }

  emitGitStatus(projectId: string, status: { pushing: boolean; pushedBy?: string; success?: boolean; message?: string }): void {
    this.io.to(this.roomName(projectId)).emit("git:status", { projectId, ...status });
  }

  schedulePreviewReload(projectId: string, reason = "file-change"): void {
    const prev = this.previewDebounceTimers.get(projectId);
    if (prev) clearTimeout(prev);

    const timer = setTimeout(() => {
      this.previewDebounceTimers.delete(projectId);
      this.io.to(this.roomName(projectId)).emit("preview:reload", {
        projectId,
        reason,
        timestamp: Date.now(),
      });
    }, 350);
    this.previewDebounceTimers.set(projectId, timer);
  }

  private hasActiveHostSocket(projectId: string, hostId: string): boolean {
    for (const meta of this.socketMeta.values()) {
      if (meta.projectId === projectId && meta.userId === hostId) {
        return true;
      }
    }
    return false;
  }

  private async maybeScheduleHostGraceTimer(projectId: string, userId: string): Promise<void> {
    try {
      const activeSession = await db.getActiveSessionForProject(projectId);
      if (!activeSession || activeSession.hostId !== userId) return;
      if (canSessionPersist(activeSession)) return;
      if (this.hasActiveHostSocket(projectId, userId)) return;

      this.scheduleHostGraceTimer(activeSession);
    } catch (err) {
      console.error("[Anvil Session] Error checking host disconnect grace timer:", err);
    }
  }

  scheduleHostGraceTimer(session: DbSession): void {
    if (canSessionPersist(session)) return;
    if (this.hostGraceTimers.has(session.id)) return;

    const timer = setTimeout(() => {
      this.hostGraceTimers.delete(session.id);
      void (async () => {
        try {
          const fresh = await db.getSessionById(session.id);
          if (!fresh || fresh.status !== "active") return;
          if (canSessionPersist(fresh)) return;
          if (this.hasActiveHostSocket(fresh.projectId, fresh.hostId)) return;

          await this.endSessionAndDisconnect(
            fresh.id,
            "Host disconnected past grace period. Session ended."
          );
        } catch (err) {
          console.error(`[Anvil Session] Grace timeout end failed for ${session.id}:`, err);
        }
      })();
    }, env.SESSION_HOST_GRACE_MS);

    this.hostGraceTimers.set(session.id, timer);
  }

  cancelHostGraceTimer(sessionId: string): void {
    const timer = this.hostGraceTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.hostGraceTimers.delete(sessionId);
    }
  }

  async startSession(projectId: string, hostId: string, role: ProjectRole): Promise<DbSession> {
    const existing = await db.getActiveSessionForProject(projectId);
    if (existing) {
      this.cancelHostGraceTimer(existing.id);
      await db.upsertSessionMember({
        sessionId: existing.id,
        userId: hostId,
        role,
      });
      this.io.to(this.roomName(projectId)).emit("session:started", { session: existing });
      this.broadcastPresence(projectId);
      return existing;
    }

    // Generate unique 6-char uppercase session code
    let code = generateSessionCode();
    for (let attempt = 0; attempt < 10; attempt++) {
      const collision = await db.getSessionByCode(code);
      if (!collision) break;
      code = generateSessionCode();
    }

    const sessionId = newUuid();
    const isPersistent = env.ENABLE_PAID_TIERS ? false : false;
    await db.createSession({
      id: sessionId,
      projectId,
      hostId,
      sessionCode: code,
      isPersistent,
    });
    await db.upsertSessionMember({
      sessionId,
      userId: hostId,
      role,
    });

    const created = (await db.getSessionById(sessionId))!;
    this.io.to(this.roomName(projectId)).emit("session:started", { session: created });
    this.emitMembersUpdated(projectId);
    return created;
  }

  async endSessionAndDisconnect(sessionId: string, reason: string): Promise<void> {
    this.cancelHostGraceTimer(sessionId);

    const session = await db.getSessionById(sessionId);
    if (!session || session.status === "ended") return;

    // Flush any unsaved Yjs edits to SQL before ending the session
    await this.yjs.flushProjectDocs(session.projectId);

    // Mark session ended in SQL (invalidates code)
    await db.endSession(sessionId);

    // Remove temporary (non-permanent) project members and revoke their access
    const members = await db.listProjectMembers(session.projectId);
    const nonPermanentUserIds = new Set<string>();
    for (const m of members) {
      if (!m.permanent && m.userId !== session.hostId) {
        nonPermanentUserIds.add(m.userId);
        revokePreviewTokensForUser(session.projectId, m.userId);
        await db.deleteProjectMember(session.projectId, m.userId).catch(() => undefined);
      }
    }

    // Notify everyone in the project room before disconnecting non-permanent collaborators
    this.io.to(this.roomName(session.projectId)).emit("session:ended", {
      sessionId: session.id,
      projectId: session.projectId,
      reason,
    });

    for (const uid of nonPermanentUserIds) {
      this.disconnectUserFromProject(session.projectId, uid, reason);
    }

    this.emitMembersUpdated(session.projectId);
    this.broadcastPresence(session.projectId);
  }

  disconnectUserFromProject(projectId: string, userId: string, reason = "Access removed"): void {
    revokePreviewTokensForUser(projectId, userId);
    this.yjs.disconnectUserFromProject(projectId, userId, 4403, reason);

    for (const [socketId, meta] of Array.from(this.socketMeta.entries())) {
      if (meta.projectId === projectId && meta.userId === userId) {
        const sock: Socket | undefined = this.io.sockets.sockets.get(socketId);
        if (sock) {
          sock.emit("access:revoked", { projectId, reason });
          sock.leave(this.roomName(projectId));
          sock.disconnect(true);
        }
        this.socketMeta.delete(socketId);
      }
    }
    this.broadcastPresence(projectId);
  }
}
