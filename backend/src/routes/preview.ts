import { Router, type Request, type Response } from "express";
import { env } from "../config/env.js";
import { AccessError, assertProjectAccess } from "../middleware/accessControl.js";
import { db } from "../services/db.js";
import { verifyPreviewToken } from "../services/previewTokens.js";
import { buildNodePathMap } from "../services/projectTree.js";
import { downloadAssetBuffer } from "../services/storageService.js";
import type { YjsCollaborationServer } from "../services/yjsServer.js";
import { sanitizeProjectRelativePath } from "../utils/filenames.js";

export function createPreviewRouter(yjs: YjsCollaborationServer): Router {
  const router = Router();

  async function servePreview(req: Request, res: Response, rawAssetPath: string): Promise<void> {
    const projectId = req.params.projectId ?? "";
    const token = req.params.token ?? "";

    const verified = verifyPreviewToken(token, projectId);
    if (!verified) {
      res.status(403).send("Preview token is invalid or expired.");
      return;
    }

    let project;
    try {
      const access = await assertProjectAccess(projectId, verified.uid);
      project = access.project;
    } catch (err) {
      if (err instanceof AccessError) {
        res.status(err.statusCode).send(err.message);
        return;
      }
      throw err;
    }

    let targetPath: string;
    try {
      const candidate = rawAssetPath && rawAssetPath.trim() ? rawAssetPath : project.entryFile || "index.html";
      targetPath = sanitizeProjectRelativePath(candidate);
    } catch {
      res.status(400).send("Invalid preview path.");
      return;
    }

    const nodes = await db.listProjectNodes(projectId);
    const pathMap = buildNodePathMap(nodes);
    const lowerTarget = targetPath.toLowerCase();

    const matchedNode = nodes.find((n) => {
      if (n.nodeType === "folder") return false;
      const nodeRel = pathMap.get(n.id);
      return nodeRel ? nodeRel.toLowerCase() === lowerTarget : false;
    });

    if (!matchedNode) {
      res.status(404).send(`File "${targetPath}" not found in project.`);
      return;
    }

    // Security headers compatible with sandboxed iframe (Origin: null)
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.removeHeader("X-Frame-Options");
    res.setHeader(
      "Content-Security-Policy",
      `frame-ancestors 'self' ${env.FRONTEND_ORIGIN} http://localhost:* http://127.0.0.1:*`
    );

    if (matchedNode.nodeType === "text_file") {
      const liveText = yjs.getLiveText(projectId, matchedNode.id, matchedNode.contentText);
      const mimeType = matchedNode.mimeType || "text/plain";
      res.setHeader("Content-Type", `${mimeType}; charset=utf-8`);
      res.send(liveText);
      return;
    }

    if (matchedNode.nodeType === "binary_asset" && matchedNode.storagePath) {
      const buffer = await downloadAssetBuffer(matchedNode.storagePath);
      res.setHeader("Content-Type", matchedNode.mimeType || "application/octet-stream");
      res.send(buffer);
      return;
    }

    res.status(404).send("Asset content unavailable.");
  }

  router.get("/:projectId/t/:token", (req, res, next) => {
    void servePreview(req, res, "").catch(next);
  });

  router.get("/:projectId/t/:token/*", (req, res, next) => {
    const params = req.params as unknown as Record<string, string | string[] | undefined>;
    const rawVal = params["0"] ?? params[""] ?? "";
    const raw = Array.isArray(rawVal) ? rawVal.join("/") : String(rawVal);
    void servePreview(req, res, raw).catch(next);
  });

  return router;
}
