import type { Server as HttpServer, IncomingMessage } from "http";
import type { Duplex } from "stream";
import { WebSocketServer, WebSocket } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { env } from "../config/env.js";
import { verifyVerifiedRegisteredUser } from "../middleware/auth.js";
import { assertProjectAccess } from "../middleware/accessControl.js";
import { db } from "./db.js";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

interface ClientMeta {
  ws: WebSocket;
  userId: string;
  username: string;
  projectId: string;
  nodeId: string;
  awarenessClientIds: Set<number>;
}

interface ManagedDoc {
  roomKey: string;
  projectId: string;
  nodeId: string;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  clients: Set<ClientMeta>;
  dirty: boolean;
  saveTimer: NodeJS.Timeout | null;
  savingPromise: Promise<void> | null;
  destroyed: boolean;
}

export type PreviewReloadCallback = (projectId: string, nodeId: string) => void;

export class YjsCollaborationServer {
  private wss: WebSocketServer;
  private docs = new Map<string, ManagedDoc>();
  private loadingDocs = new Map<string, Promise<ManagedDoc>>();
  private onDocSaved?: PreviewReloadCallback;

  constructor(onDocSaved?: PreviewReloadCallback) {
    this.onDocSaved = onDocSaved;
    this.wss = new WebSocketServer({ noServer: true });
  }

  attachUpgradeHandler(httpServer: HttpServer): void {
    httpServer.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      const reqUrl = new URL(request.url ?? "/", "http://localhost");
      // Let Socket.io handle /socket.io/ upgrades
      if (!reqUrl.pathname.startsWith("/yjs/")) {
        return;
      }

      void this.handleUpgrade(request, reqUrl, socket, head);
    });
  }

  private async handleUpgrade(
    request: IncomingMessage,
    reqUrl: URL,
    socket: Duplex,
    head: Buffer
  ): Promise<void> {
    try {
      // Room path format: /yjs/<projectId>:<nodeId>?token=...
      const roomSegment = decodeURIComponent(reqUrl.pathname.slice("/yjs/".length)).replace(/^\/+/, "");
      const [projectId, nodeId] = roomSegment.split(":");
      const token = reqUrl.searchParams.get("token") ?? "";

      if (!projectId || !nodeId || !token) {
        socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
        socket.destroy();
        return;
      }

      const { user } = await verifyVerifiedRegisteredUser(token);
      await assertProjectAccess(projectId, user.id);

      const node = await db.getProjectNodeById(nodeId);
      if (!node || node.projectId !== projectId || node.nodeType !== "text_file") {
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        socket.destroy();
        return;
      }

      // Load/hydrate Yjs doc BEFORE completing HTTP 101 upgrade so ws.on("message")
      // attaches synchronously and never misses the client's initial SyncStep1.
      const managed = await this.getOrLoadDoc(projectId, nodeId);

      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.handleConnection(ws, managed, projectId, nodeId, user.id, user.username);
      });
    } catch (err: unknown) {
      const status =
        typeof err === "object" && err !== null && "statusCode" in err
          ? Number((err as { statusCode?: number }).statusCode || 403)
          : 403;
      const reason = status === 401 ? "401 Unauthorized" : status === 404 ? "404 Not Found" : "403 Forbidden";
      socket.write(`HTTP/1.1 ${reason}\r\n\r\n`);
      socket.destroy();
    }
  }

  private async getOrLoadDoc(projectId: string, nodeId: string): Promise<ManagedDoc> {
    const roomKey = `${projectId}:${nodeId}`;
    const existing = this.docs.get(roomKey);
    if (existing && !existing.destroyed) {
      return existing;
    }

    const pending = this.loadingDocs.get(roomKey);
    if (pending) {
      return pending;
    }

    const loadPromise = (async () => {
      const node = await db.getProjectNodeById(nodeId);
      const doc = new Y.Doc();
      const yText = doc.getText("monaco");
      const initialText = node?.contentText ?? "";
      if (initialText.length > 0) {
        doc.transact(() => {
          yText.insert(0, initialText);
        }, "sql-hydration");
      }

      const awareness = new awarenessProtocol.Awareness(doc);
      const managed: ManagedDoc = {
        roomKey,
        projectId,
        nodeId,
        doc,
        awareness,
        clients: new Set(),
        dirty: false,
        saveTimer: null,
        savingPromise: null,
        destroyed: false,
      };

      doc.on("update", (update: Uint8Array, origin: unknown) => {
        // Broadcast Yjs update to other connected clients
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.writeUpdate(encoder, update);
        const payload = encoding.toUint8Array(encoder);

        for (const client of managed.clients) {
          if (client.ws !== origin && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(payload);
          }
        }

        if (origin !== "sql-hydration") {
          managed.dirty = true;
          this.scheduleSave(managed);
        }
      });

      awareness.on(
        "update",
        (
          { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
          origin: unknown
        ) => {
          const changed = added.concat(updated, removed);
          if (changed.length === 0) return;

          if (origin && typeof origin === "object" && "awarenessClientIds" in origin) {
            const client = origin as ClientMeta;
            for (const id of added) client.awarenessClientIds.add(id);
            for (const id of updated) client.awarenessClientIds.add(id);
            for (const id of removed) client.awarenessClientIds.delete(id);
          }

          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
          encoding.writeVarUint8Array(
            encoder,
            awarenessProtocol.encodeAwarenessUpdate(awareness, changed)
          );
          const payload = encoding.toUint8Array(encoder);

          for (const client of managed.clients) {
            if (client.ws.readyState === WebSocket.OPEN) {
              client.ws.send(payload);
            }
          }
        }
      );

      this.docs.set(roomKey, managed);
      return managed;
    })();

    this.loadingDocs.set(roomKey, loadPromise);
    try {
      return await loadPromise;
    } finally {
      this.loadingDocs.delete(roomKey);
    }
  }

  private handleConnection(
    ws: WebSocket,
    managed: ManagedDoc,
    projectId: string,
    nodeId: string,
    userId: string,
    username: string
  ): void {
    const client: ClientMeta = {
      ws,
      userId,
      username,
      projectId,
      nodeId,
      awarenessClientIds: new Set(),
    };
    managed.clients.add(client);

    // Send Sync Step 1
    {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeSyncStep1(encoder, managed.doc);
      ws.send(encoding.toUint8Array(encoder));
    }

    // Send current awareness states
    const awarenessStates = managed.awareness.getStates();
    if (awarenessStates.size > 0) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(
          managed.awareness,
          Array.from(awarenessStates.keys())
        )
      );
      ws.send(encoding.toUint8Array(encoder));
    }

    ws.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
      try {
        const buf = Array.isArray(data)
          ? Buffer.concat(data)
          : data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : new Uint8Array(data);

        const decoder = decoding.createDecoder(buf);
        const encoder = encoding.createEncoder();
        const messageType = decoding.readVarUint(decoder);

        if (messageType === MESSAGE_SYNC) {
          encoding.writeVarUint(encoder, MESSAGE_SYNC);
          syncProtocol.readSyncMessage(decoder, encoder, managed.doc, ws);
          if (encoding.length(encoder) > 1 && ws.readyState === WebSocket.OPEN) {
            ws.send(encoding.toUint8Array(encoder));
          }
        } else if (messageType === MESSAGE_AWARENESS) {
          awarenessProtocol.applyAwarenessUpdate(
            managed.awareness,
            decoding.readVarUint8Array(decoder),
            client
          );
        }
      } catch (err) {
        console.error("[Anvil Yjs] Error processing message:", err);
      }
    });

    ws.on("close", () => {
      void this.handleDisconnect(managed, client);
    });

    ws.on("error", () => {
      void this.handleDisconnect(managed, client);
    });
  }

  private async handleDisconnect(managed: ManagedDoc, client: ClientMeta): Promise<void> {
    if (!managed.clients.has(client)) return;
    managed.clients.delete(client);

    if (client.awarenessClientIds.size > 0) {
      awarenessProtocol.removeAwarenessStates(
        managed.awareness,
        Array.from(client.awarenessClientIds),
        null
      );
    }

    if (managed.clients.size === 0) {
      await this.flushDoc(managed);
      // Re-check in case someone reconnected while flushing
      if (managed.clients.size === 0 && !managed.dirty) {
        managed.destroyed = true;
        managed.awareness.destroy();
        managed.doc.destroy();
        this.docs.delete(managed.roomKey);
      }
    }
  }

  private scheduleSave(managed: ManagedDoc): void {
    if (managed.saveTimer) {
      clearTimeout(managed.saveTimer);
    }
    managed.saveTimer = setTimeout(() => {
      managed.saveTimer = null;
      void this.flushDoc(managed);
    }, env.YJS_SAVE_DEBOUNCE_MS);
  }

  async flushDoc(managed: ManagedDoc): Promise<void> {
    if (managed.saveTimer) {
      clearTimeout(managed.saveTimer);
      managed.saveTimer = null;
    }
    if (managed.savingPromise) {
      await managed.savingPromise;
    }
    if (!managed.dirty) return;

    const text = managed.doc.getText("monaco").toString();
    managed.dirty = false;

    const saveTask = (async () => {
      try {
        await db.updateProjectNodeContent(managed.nodeId, text);
        this.onDocSaved?.(managed.projectId, managed.nodeId);
      } catch (err) {
        // Restore dirty flag if persistence failed so next flush retries
        managed.dirty = true;
        console.error(`[Anvil Yjs] Failed saving node ${managed.nodeId}:`, err);
      } finally {
        managed.savingPromise = null;
      }
    })();

    managed.savingPromise = saveTask;
    await saveTask;
  }

  async flushProjectDocs(projectId: string): Promise<void> {
    const targets = Array.from(this.docs.values()).filter((d) => d.projectId === projectId);
    await Promise.all(targets.map((d) => this.flushDoc(d)));
  }

  async flushNodeDoc(projectId: string, nodeId: string): Promise<void> {
    const doc = this.docs.get(`${projectId}:${nodeId}`);
    if (doc) {
      await this.flushDoc(doc);
    }
  }

  getLiveText(projectId: string, nodeId: string, fallback: string | null): string {
    const managed = this.docs.get(`${projectId}:${nodeId}`);
    if (managed && !managed.destroyed) {
      return managed.doc.getText("monaco").toString();
    }
    return fallback ?? "";
  }

  async dropNodeDoc(projectId: string, nodeId: string): Promise<void> {
    const key = `${projectId}:${nodeId}`;
    const managed = this.docs.get(key);
    if (!managed) return;
    if (managed.saveTimer) {
      clearTimeout(managed.saveTimer);
      managed.saveTimer = null;
    }
    managed.dirty = false;
    managed.destroyed = true;
    for (const c of Array.from(managed.clients)) {
      try {
        c.ws.close(4404, "File deleted");
      } catch {
        // ignore
      }
    }
    managed.clients.clear();
    managed.awareness.destroy();
    managed.doc.destroy();
    this.docs.delete(key);
  }

  disconnectUserFromProject(projectId: string, userId: string, code = 4403, reason = "Access revoked"): void {
    for (const managed of this.docs.values()) {
      if (managed.projectId !== projectId) continue;
      for (const client of Array.from(managed.clients)) {
        if (client.userId === userId) {
          try {
            client.ws.close(code, reason);
          } catch {
            // ignore
          }
        }
      }
    }
  }
}
