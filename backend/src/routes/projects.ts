import { Router } from "express";
import rateLimit from "express-rate-limit";
import mime from "mime-types";
import multer from "multer";
import { z } from "zod";
import { env } from "../config/env.js";
import { requireProjectMember, requireProjectOwner } from "../middleware/accessControl.js";
import { db, newUuid, sameUuid } from "../services/db.js";
import type { GitService } from "../services/gitService.js";
import { GitValidationError, validateGitBranchName } from "../services/gitService.js";
import { issuePreviewToken } from "../services/previewTokens.js";
import {
  assertValidAndUniqueSiblingName,
  attachRelativePaths,
  deleteSubtreeFromProject,
  isDescendantNode,
} from "../services/projectTree.js";
import type { SessionManager } from "../services/sessionManager.js";
import { createCanvasStarterFiles } from "../services/starterTemplate.js";
import { downloadAssetBuffer, uploadAssetBuffer } from "../services/storageService.js";
import type { YjsCollaborationServer } from "../services/yjsServer.js";
import { streamProjectZip } from "../services/zipExport.js";
import { normalizeNodeName, sanitizeProjectRelativePath } from "../utils/filenames.js";

const uuidSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i, "Invalid UUID.");

const TEXT_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".ts",
  ".tsx",
  ".json",
  ".md",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
  ".csv",
  ".glsl",
  ".vert",
  ".frag",
  ".gitattributes",
  ".gitignore",
]);

const BINARY_ASSET_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".ico",
  ".wav",
  ".mp3",
  ".ogg",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
]);

function getLowerExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.slice(idx).toLowerCase() : "";
}

function resolveMimeType(filename: string, providedMime?: string): string {
  const ext = getLowerExtension(filename);
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".js" || ext === ".mjs") return "application/javascript";
  if (ext === ".ts" || ext === ".tsx") return "application/typescript";
  if (ext === ".woff2") return "font/woff2";
  if (ext === ".woff") return "font/woff";
  const lookedUp = mime.lookup(filename);
  if (typeof lookedUp === "string") return lookedUp;
  if (providedMime && providedMime !== "application/octet-stream") return providedMime;
  return "text/plain";
}

export function createProjectsRouter(
  yjs: YjsCollaborationServer,
  sessions: SessionManager,
  gitService: GitService
): Router {
  const router = Router();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
      files: 20,
    },
  });

  const gitPushLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 12,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many Git push requests. Please wait a minute." },
  });

  // List projects for authenticated verified user
  router.get("/", async (req, res, next) => {
    try {
      const projects = await db.listProjectsForUser(req.dbUser!.id);
      const enriched = await Promise.all(
        projects.map(async (p) => {
          const activeSession = await db.getActiveSessionForProject(p.id);
          return { ...p, activeSession };
        })
      );
      res.json({ projects: enriched });
    } catch (err) {
      next(err);
    }
  });

  // Create a new cloud project
  router.post("/", async (req, res, next) => {
    try {
      const schema = z.object({
        name: z.string().trim().min(1, "Project name is required.").max(100),
        defaultBranch: z.string().trim().min(1).max(100).default("main"),
        entryFile: z.string().trim().min(1).max(200).default("index.html"),
        template: z.enum(["canvas-game", "blank"]).default("canvas-game"),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid project payload." });
        return;
      }

      const defaultBranch = validateGitBranchName(parsed.data.defaultBranch);
      const entryFile = sanitizeProjectRelativePath(parsed.data.entryFile);

      const projectId = newUuid();
      await db.createProject({
        id: projectId,
        ownerId: req.dbUser!.id,
        name: normalizeNodeName(parsed.data.name),
        defaultBranch,
        entryFile,
      });

      await db.upsertProjectMember({
        projectId,
        userId: req.dbUser!.id,
        addedBy: req.dbUser!.id,
        permanent: true,
      });

      if (parsed.data.template === "canvas-game") {
        await createCanvasStarterFiles(projectId, parsed.data.name);
      }

      const project = await db.getProjectById(projectId);
      res.status(201).json({ project });
    } catch (err) {
      if (err instanceof GitValidationError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      if (err instanceof Error && /file path|traversal|forbidden|reserved|empty/i.test(err.message)) {
        res.status(400).json({ error: err.message });
        return;
      }
      next(err);
    }
  });

  // Get single project workspace overview
  router.get("/:projectId", requireProjectMember, async (req, res, next) => {
    try {
      const projectId = req.params.projectId!;
      const [members, activeSession, rawNodes] = await Promise.all([
        db.listProjectMembers(projectId),
        db.getActiveSessionForProject(projectId),
        db.listProjectNodes(projectId),
      ]);
      const sessionMembers = activeSession ? await db.listSessionMembers(activeSession.id) : [];

      res.json({
        project: req.projectAccess!.project,
        isOwner: req.projectAccess!.isOwner,
        members,
        activeSession,
        sessionMembers,
        presence: sessions.getProjectPresence(projectId),
        nodes: attachRelativePaths(rawNodes).map(({ contentText: _ct, ...meta }) => meta),
      });
    } catch (err) {
      next(err);
    }
  });

  // Update project settings (entry file, github origin, branch, or name for owner)
  router.patch("/:projectId", requireProjectMember, async (req, res, next) => {
    try {
      const schema = z.object({
        name: z.string().trim().min(1).max(100).optional(),
        githubOriginUrl: z.string().trim().max(500).nullable().optional(),
        defaultBranch: z.string().trim().min(1).max(120).optional(),
        entryFile: z.string().trim().min(1).max(255).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid update." });
        return;
      }

      if (parsed.data.name !== undefined && !req.projectAccess!.isOwner) {
        res.status(403).json({ error: "Only the project owner can rename the project." });
        return;
      }

      const patch = { ...parsed.data };
      if (patch.name !== undefined) {
        patch.name = normalizeNodeName(patch.name);
      }
      if (patch.defaultBranch !== undefined) {
        patch.defaultBranch = validateGitBranchName(patch.defaultBranch);
      }
      if (patch.entryFile !== undefined) {
        patch.entryFile = sanitizeProjectRelativePath(patch.entryFile);
      }

      await db.updateProjectSettings(req.params.projectId!, patch);
      const updated = await db.getProjectById(req.params.projectId!);
      res.json({ project: updated });
    } catch (err) {
      if (err instanceof GitValidationError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      if (err instanceof Error && /file path|traversal|forbidden|reserved|empty/i.test(err.message)) {
        res.status(400).json({ error: err.message });
        return;
      }
      next(err);
    }
  });

  // List members
  router.get("/:projectId/members", requireProjectMember, async (req, res, next) => {
    try {
      const members = await db.listProjectMembers(req.params.projectId!);
      res.json({ members });
    } catch (err) {
      next(err);
    }
  });

  // Owner adds permanent collaborator by username or email
  router.post("/:projectId/members", requireProjectOwner, async (req, res, next) => {
    try {
      const schema = z.object({
        identifier: z.string().trim().min(1, "Username or email is required."),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input." });
        return;
      }

      const id = parsed.data.identifier;
      const targetUser = id.includes("@")
        ? await db.getUserByEmail(id)
        : await db.getUserByUsername(id);

      if (!targetUser) {
        res.status(404).json({ error: `No registered Anvil user found matching "${id}".` });
        return;
      }

      await db.upsertProjectMember({
        projectId: req.params.projectId!,
        userId: targetUser.id,
        addedBy: req.dbUser!.id,
        permanent: true,
      });

      sessions.emitMembersUpdated(req.params.projectId!);
      const members = await db.listProjectMembers(req.params.projectId!);
      res.status(201).json({ members });
    } catch (err) {
      next(err);
    }
  });

  // Owner removes a collaborator
  router.delete("/:projectId/members/:userId", requireProjectOwner, async (req, res, next) => {
    try {
      const projectId = req.params.projectId!;
      const targetUserId = req.params.userId!;
      if (targetUserId === req.projectAccess!.project.ownerId) {
        res.status(400).json({ error: "Cannot remove the project owner." });
        return;
      }

      await db.deleteProjectMember(projectId, targetUserId);
      sessions.disconnectUserFromProject(projectId, targetUserId, "Removed from project by owner.");
      sessions.emitMembersUpdated(projectId);
      res.json({ removed: true });
    } catch (err) {
      next(err);
    }
  });

  // List file tree nodes
  router.get("/:projectId/nodes", requireProjectMember, async (req, res, next) => {
    try {
      const nodes = await db.listProjectNodes(req.params.projectId!);
      res.json({
        nodes: attachRelativePaths(nodes).map(({ contentText: _ct, ...meta }) => meta),
      });
    } catch (err) {
      next(err);
    }
  });

  // Create folder or text file
  router.post("/:projectId/nodes", requireProjectMember, async (req, res, next) => {
    try {
      const projectId = req.params.projectId!;
      const schema = z.object({
        parentId: uuidSchema.nullable().default(null),
        name: z.string().min(1),
        nodeType: z.enum(["folder", "text_file"]),
        contentText: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid node payload." });
        return;
      }

      const nodes = await db.listProjectNodes(projectId);
      if (parsed.data.parentId) {
        const parent = nodes.find((n) => sameUuid(n.id, parsed.data.parentId));
        if (!parent || parent.nodeType !== "folder") {
          res.status(400).json({ error: "Parent folder does not exist." });
          return;
        }
      }

      const nameCheck = assertValidAndUniqueSiblingName(
        nodes,
        projectId,
        parsed.data.parentId,
        parsed.data.name
      );
      if (!nameCheck.valid) {
        res.status(nameCheck.statusCode).json({ error: nameCheck.error });
        return;
      }

      const nodeId = newUuid();
      const mimeType =
        parsed.data.nodeType === "folder"
          ? "inode/directory"
          : resolveMimeType(nameCheck.normalizedName);

      await db.createProjectNode({
        id: nodeId,
        projectId,
        parentId: parsed.data.parentId,
        name: nameCheck.normalizedName,
        nodeType: parsed.data.nodeType,
        contentText: parsed.data.nodeType === "text_file" ? parsed.data.contentText ?? "" : null,
        storagePath: null,
        mimeType,
      });

      sessions.emitTreeUpdated(projectId);
      if (parsed.data.nodeType === "text_file") {
        sessions.schedulePreviewReload(projectId, "node-created");
      }

      const updatedNodes = attachRelativePaths(await db.listProjectNodes(projectId));
      const created = updatedNodes.find((n) => sameUuid(n.id, nodeId));
      res.status(201).json({ node: created });
    } catch (err) {
      next(err);
    }
  });

  // Rename or move node
  router.patch("/:projectId/nodes/:nodeId", requireProjectMember, async (req, res, next) => {
    try {
      const projectId = req.params.projectId!;
      const nodeId = req.params.nodeId!;
      if (!uuidSchema.safeParse(nodeId).success) {
        res.status(400).json({ error: "Invalid node ID." });
        return;
      }
      const schema = z.object({
        name: z.string().min(1).optional(),
        parentId: uuidSchema.nullable().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid rename/move payload." });
        return;
      }

      const nodes = await db.listProjectNodes(projectId);
      const target = nodes.find((n) => sameUuid(n.id, nodeId));
      if (!target) {
        res.status(404).json({ error: "File or folder not found." });
        return;
      }

      const nextParentId = parsed.data.parentId !== undefined ? parsed.data.parentId : target.parentId;
      const nextName = parsed.data.name !== undefined ? parsed.data.name : target.name;

      if (nextParentId) {
        const parent = nodes.find((n) => sameUuid(n.id, nextParentId));
        if (!parent || parent.nodeType !== "folder") {
          res.status(400).json({ error: "Destination folder does not exist." });
          return;
        }
        if (sameUuid(nextParentId, target.id) || isDescendantNode(nodes, parent.id, target.id)) {
          res.status(400).json({ error: "Cannot move a folder into itself or its descendant." });
          return;
        }
      }

      const nameCheck = assertValidAndUniqueSiblingName(
        nodes,
        projectId,
        nextParentId,
        nextName,
        target.id
      );
      if (!nameCheck.valid) {
        res.status(nameCheck.statusCode).json({ error: nameCheck.error });
        return;
      }

      await db.updateProjectNodeMeta({
        id: target.id,
        projectId,
        parentId: nextParentId,
        name: nameCheck.normalizedName,
      });

      sessions.emitTreeUpdated(projectId);
      sessions.schedulePreviewReload(projectId, "node-renamed");

      const updatedNodes = attachRelativePaths(await db.listProjectNodes(projectId));
      const updated = updatedNodes.find((n) => sameUuid(n.id, target.id));
      res.json({ node: updated });
    } catch (err) {
      next(err);
    }
  });

  // Delete file or folder recursively
  router.delete("/:projectId/nodes/:nodeId", requireProjectMember, async (req, res, next) => {
    try {
      const projectId = req.params.projectId!;
      const nodeId = req.params.nodeId!;
      if (!uuidSchema.safeParse(nodeId).success) {
        res.status(400).json({ error: "Invalid node ID." });
        return;
      }
      const nodes = await db.listProjectNodes(projectId);
      const target = nodes.find((n) => sameUuid(n.id, nodeId));
      if (!target) {
        res.status(404).json({ error: "Node not found." });
        return;
      }

      const deleted = await deleteSubtreeFromProject(nodes, target.id, async (n) => {
        if (n.nodeType === "text_file") {
          await yjs.dropNodeDoc(projectId, n.id);
        }
      });

      sessions.emitTreeUpdated(projectId);
      sessions.emitCommentsUpdated(projectId);
      sessions.schedulePreviewReload(projectId, "node-deleted");

      res.json({ deletedIds: deleted.map((d) => d.id) });
    } catch (err) {
      next(err);
    }
  });

  // Drag-and-drop upload of assets (PNG, SVG, JSON, WAV, MP3, fonts, or text files)
  router.post(
    "/:projectId/nodes/upload",
    requireProjectMember,
    upload.array("files", 20),
    async (req, res, next) => {
      try {
        const projectId = req.params.projectId!;
        const parentIdRaw = typeof req.body?.parentId === "string" && req.body.parentId ? req.body.parentId.trim() : null;
        if (parentIdRaw && !uuidSchema.safeParse(parentIdRaw).success) {
          res.status(400).json({ error: "Invalid parentId UUID." });
          return;
        }
        const overwrite = req.body?.overwrite === "true" || req.body?.overwrite === true;
        const files = (req.files as Express.Multer.File[] | undefined) ?? [];

        if (files.length === 0) {
          res.status(400).json({ error: "No files uploaded." });
          return;
        }

        let nodes = await db.listProjectNodes(projectId);
        if (parentIdRaw) {
          const parent = nodes.find((n) => sameUuid(n.id, parentIdRaw));
          if (!parent || parent.nodeType !== "folder") {
            res.status(400).json({ error: "Target parent folder not found." });
            return;
          }
        }

        const createdOrUpdatedIds: string[] = [];

        for (const file of files) {
          // Strip any directory prefix sent by browser upload and validate filename
          const rawBaseName = file.originalname.replace(/\\/g, "/").split("/").pop() ?? file.originalname;
          const ext = getLowerExtension(rawBaseName);

          if (!BINARY_ASSET_EXTENSIONS.has(ext) && !TEXT_EXTENSIONS.has(ext)) {
            res.status(400).json({
              error: `Unsupported file type "${ext || rawBaseName}". Allowed: PNG, SVG, JSON, WAV, MP3, fonts, and web code files.`,
            });
            return;
          }

          const isText = TEXT_EXTENSIONS.has(ext) && ext !== ".svg";
          const existingSameParent = nodes.find(
            (n) =>
              (parentIdRaw === null ? n.parentId === null : sameUuid(n.parentId, parentIdRaw)) &&
              normalizeNodeName(n.name).toLowerCase() === normalizeNodeName(rawBaseName).toLowerCase()
          );

          if (existingSameParent) {
            if (!overwrite || existingSameParent.name !== normalizeNodeName(rawBaseName)) {
              res.status(409).json({
                error: `A file or folder named "${existingSameParent.name}" already exists in this folder.`,
              });
              return;
            }
            if (existingSameParent.nodeType === "folder") {
              res.status(409).json({ error: `"${existingSameParent.name}" is a folder.` });
              return;
            }
            if (
              (isText && existingSameParent.nodeType !== "text_file") ||
              (!isText && existingSameParent.nodeType !== "binary_asset")
            ) {
              res.status(409).json({
                error: `Cannot overwrite ${existingSameParent.nodeType} "${existingSameParent.name}" with an incompatible file type. Delete it first.`,
              });
              return;
            }

            if (isText) {
              await yjs.dropNodeDoc(projectId, existingSameParent.id);
              await db.updateProjectNodeContent(existingSameParent.id, file.buffer.toString("utf8"));
            } else {
              const mimeType = resolveMimeType(existingSameParent.name, file.mimetype);
              const storagePath = `projects/${projectId}/assets/${existingSameParent.id}/${existingSameParent.name}`;
              await uploadAssetBuffer(storagePath, file.buffer, mimeType);
              await db.updateProjectNodeAsset(existingSameParent.id, storagePath, mimeType);
            }
            createdOrUpdatedIds.push(existingSameParent.id);
            continue;
          }

          const check = assertValidAndUniqueSiblingName(nodes, projectId, parentIdRaw, rawBaseName);
          if (!check.valid) {
            res.status(check.statusCode).json({ error: check.error });
            return;
          }

          const nodeId = newUuid();
          const mimeType = resolveMimeType(check.normalizedName, file.mimetype);

          if (isText) {
            await db.createProjectNode({
              id: nodeId,
              projectId,
              parentId: parentIdRaw,
              name: check.normalizedName,
              nodeType: "text_file",
              contentText: file.buffer.toString("utf8"),
              storagePath: null,
              mimeType,
            });
          } else {
            const storagePath = `projects/${projectId}/assets/${nodeId}/${check.normalizedName}`;
            await uploadAssetBuffer(storagePath, file.buffer, mimeType);
            await db.createProjectNode({
              id: nodeId,
              projectId,
              parentId: parentIdRaw,
              name: check.normalizedName,
              nodeType: "binary_asset",
              contentText: null,
              storagePath,
              mimeType,
            });
          }

          createdOrUpdatedIds.push(nodeId);
          nodes = await db.listProjectNodes(projectId);
        }

        sessions.emitTreeUpdated(projectId);
        sessions.schedulePreviewReload(projectId, "asset-uploaded");

        const latestNodes = attachRelativePaths(await db.listProjectNodes(projectId));
        res.status(201).json({
          uploaded: latestNodes.filter((n) => createdOrUpdatedIds.some((id) => sameUuid(id, n.id))),
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Get text content or binary asset bytes
  router.get("/:projectId/nodes/:nodeId/content", requireProjectMember, async (req, res, next) => {
    try {
      const projectId = req.params.projectId!;
      const nodeId = req.params.nodeId!;
      if (!uuidSchema.safeParse(nodeId).success) {
        res.status(400).json({ error: "Invalid node ID." });
        return;
      }
      const node = await db.getProjectNodeById(nodeId);
      if (!node || !sameUuid(node.projectId, projectId)) {
        res.status(404).json({ error: "Node not found." });
        return;
      }

      if (node.nodeType === "folder") {
        res.status(400).json({ error: "Folders do not have file content." });
        return;
      }

      if (node.nodeType === "text_file") {
        const text = yjs.getLiveText(projectId, node.id, node.contentText);
        res.json({ nodeId: node.id, name: node.name, mimeType: node.mimeType, contentText: text });
        return;
      }

      if (!node.storagePath) {
        res.status(404).json({ error: "Binary asset has no storage path." });
        return;
      }

      const buffer = await downloadAssetBuffer(node.storagePath);
      res.setHeader("Content-Type", node.mimeType || "application/octet-stream");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  });

  // Force sync (Ctrl/Cmd+S) flushes Yjs docs to SQL and triggers preview refresh
  router.post("/:projectId/sync", requireProjectMember, async (req, res, next) => {
    try {
      const projectId = req.params.projectId!;
      await yjs.flushProjectDocs(projectId);
      sessions.schedulePreviewReload(projectId, "manual-save");
      res.json({ synced: true, timestamp: Date.now() });
    } catch (err) {
      next(err);
    }
  });

  // Issue short-lived preview capability token for sandboxed Live Preview iframe
  router.post("/:projectId/preview-token", requireProjectMember, async (req, res) => {
    const token = issuePreviewToken(req.params.projectId!, req.dbUser!.id);
    res.json({ token });
  });

  // Export entire project tree as cross-OS .zip archive
  router.get("/:projectId/export", requireProjectMember, async (req, res, next) => {
    try {
      const projectId = req.params.projectId!;
      await yjs.flushProjectDocs(projectId);
      const nodes = await db.listProjectNodes(projectId);
      await streamProjectZip(req.projectAccess!.project, nodes, res, yjs);
    } catch (err) {
      next(err);
    }
  });

  // One-click GitHub Commit & Push (any project member)
  router.post(
    "/:projectId/git/commit-push",
    gitPushLimiter,
    requireProjectMember,
    async (req, res, next) => {
      try {
        const schema = z.object({
          originUrl: z.string().min(1),
          branch: z.string().min(1).default("main"),
          pat: z.string().min(1, "Personal Access Token is required."),
          commitMessage: z.string().min(1, "Commit message is required."),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid Git push request." });
          return;
        }

        const result = await gitService.enqueueCommitAndPush({
          projectId: req.params.projectId!,
          user: req.dbUser!,
          originUrl: parsed.data.originUrl,
          branch: parsed.data.branch,
          pat: parsed.data.pat,
          commitMessage: parsed.data.commitMessage,
        });

        res.json(result);
      } catch (err) {
        if (err instanceof GitValidationError) {
          res.status(err.statusCode).json({ error: err.message });
          return;
        }
        next(err);
      }
    }
  );

  return router;
}
