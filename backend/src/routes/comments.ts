import { Router } from "express";
import { z } from "zod";
import { requireProjectMember } from "../middleware/accessControl.js";
import { db, newUuid } from "../services/db.js";
import { buildNodePathMap } from "../services/projectTree.js";
import type { SessionManager } from "../services/sessionManager.js";

const uuidSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i, "Invalid UUID.");

export function createCommentsRouter(sessions: SessionManager): Router {
  const router = Router();

  router.get("/:projectId/comments", requireProjectMember, async (req, res, next) => {
    try {
      const projectId = req.params.projectId!;
      const [comments, nodes] = await Promise.all([
        db.listProjectComments(projectId),
        db.listProjectNodes(projectId),
      ]);
      const pathMap = buildNodePathMap(nodes);
      const enriched = comments.map((c) => ({
        ...c,
        nodePath: pathMap.get(c.nodeId) ?? c.node?.name ?? "unknown",
      }));
      res.json({ comments: enriched });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:projectId/comments", requireProjectMember, async (req, res, next) => {
    try {
      const projectId = req.params.projectId!;
      const schema = z.object({
        nodeId: uuidSchema,
        parentCommentId: uuidSchema.nullable().default(null),
        lineNumber: z.number().int().positive().nullable().default(null),
        body: z.string().trim().min(1, "Comment cannot be empty.").max(4000),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid comment." });
        return;
      }

      const node = await db.getProjectNodeById(parsed.data.nodeId);
      if (!node || node.projectId !== projectId) {
        res.status(404).json({ error: "Target file or asset not found." });
        return;
      }

      let resolvedLine = parsed.data.lineNumber;
      if (parsed.data.parentCommentId) {
        const parent = await db.getCommentById(parsed.data.parentCommentId);
        if (!parent || parent.projectId !== projectId) {
          res.status(404).json({ error: "Parent comment not found." });
          return;
        }
        resolvedLine = parent.lineNumber;
      }

      const commentId = newUuid();
      await db.createComment({
        id: commentId,
        projectId,
        nodeId: parsed.data.nodeId,
        authorId: req.dbUser!.id,
        parentCommentId: parsed.data.parentCommentId,
        lineNumber: resolvedLine,
        body: parsed.data.body,
      });

      sessions.emitCommentsUpdated(projectId);
      const created = await db.getCommentById(commentId);
      res.status(201).json({ comment: created });
    } catch (err) {
      next(err);
    }
  });

  router.patch("/:projectId/comments/:commentId", requireProjectMember, async (req, res, next) => {
    try {
      const projectId = req.params.projectId!;
      const commentId = req.params.commentId!;
      const schema = z.object({
        resolved: z.boolean(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid resolve update." });
        return;
      }

      const comment = await db.getCommentById(commentId);
      if (!comment || comment.projectId !== projectId) {
        res.status(404).json({ error: "Comment not found." });
        return;
      }

      await db.setCommentResolved(commentId, parsed.data.resolved);
      sessions.emitCommentsUpdated(projectId);
      const updated = await db.getCommentById(commentId);
      res.json({ comment: updated });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:projectId/comments/:commentId", requireProjectMember, async (req, res, next) => {
    try {
      const projectId = req.params.projectId!;
      const commentId = req.params.commentId!;
      const comment = await db.getCommentById(commentId);
      if (!comment || comment.projectId !== projectId) {
        res.status(404).json({ error: "Comment not found." });
        return;
      }
      if (comment.authorId !== req.dbUser!.id && !req.projectAccess!.isOwner) {
        res.status(403).json({ error: "Only the comment author or project owner can delete it." });
        return;
      }

      const all = await db.listProjectComments(projectId);
      const replies = all.filter((c) => c.parentCommentId === commentId);
      for (const r of replies) {
        await db.deleteComment(r.id);
      }
      await db.deleteComment(commentId);

      sessions.emitCommentsUpdated(projectId);
      res.json({ deleted: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
