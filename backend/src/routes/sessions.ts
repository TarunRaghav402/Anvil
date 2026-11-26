import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { PROJECT_ROLES } from "../../../appConfig.js";
import { AccessError, assertProjectAccess, requireProjectMember } from "../middleware/accessControl.js";
import { db } from "../services/db.js";
import type { SessionManager } from "../services/sessionManager.js";

const uuidSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i, "Invalid UUID.");

const roleSchema = z.enum(PROJECT_ROLES);

export function createSessionsRouter(sessions: SessionManager): Router {
  const router = Router();

  // Strict rate limit on session join to prevent brute-forcing 6-char session codes
  const joinLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many session join attempts. Please wait a few minutes and try again." },
  });

  // Start a session for a project (project owner)
  router.post("/start", async (req, res, next) => {
    try {
      const schema = z.object({
        projectId: uuidSchema,
        role: roleSchema.default("coder"),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request." });
        return;
      }

      const access = await assertProjectAccess(parsed.data.projectId, req.dbUser!.id);
      if (!access.isOwner) {
        res.status(403).json({ error: "Only the project owner can start a live session." });
        return;
      }

      const session = await sessions.startSession(
        parsed.data.projectId,
        req.dbUser!.id,
        parsed.data.role
      );
      const sessionMembers = await db.listSessionMembers(session.id);
      res.status(201).json({ session, sessionMembers });
    } catch (err) {
      if (err instanceof AccessError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      next(err);
    }
  });

  // Join an active session via 6-char uppercase session code
  router.post("/join", joinLimiter, async (req, res, next) => {
    try {
      const schema = z.object({
        sessionCode: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z0-9]{6}$/, "Session code must be a 6-character code."),
        role: roleSchema.default("coder"),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid session code." });
        return;
      }

      const session = await db.getSessionByCode(parsed.data.sessionCode);
      if (!session || session.status !== "active") {
        res.status(404).json({ error: "Session code is invalid or the session has ended." });
        return;
      }

      const existingMember = await db.getProjectMember(session.projectId, req.dbUser!.id);
      const isOwner = session.project?.ownerId === req.dbUser!.id;
      const preservePermanent = isOwner || Boolean(existingMember?.permanent);

      await db.upsertProjectMember({
        projectId: session.projectId,
        userId: req.dbUser!.id,
        addedBy: session.hostId,
        permanent: preservePermanent,
      });

      await db.upsertSessionMember({
        sessionId: session.id,
        userId: req.dbUser!.id,
        role: parsed.data.role,
      });

      sessions.emitMembersUpdated(session.projectId);
      sessions.broadcastPresence(session.projectId);

      res.json({
        session,
        projectId: session.projectId,
        role: parsed.data.role,
      });
    } catch (err) {
      next(err);
    }
  });

  // Get active session for a project
  router.get("/project/:projectId/active", requireProjectMember, async (req, res, next) => {
    try {
      const session = await db.getActiveSessionForProject(req.params.projectId!);
      const sessionMembers = session ? await db.listSessionMembers(session.id) : [];
      res.json({ session, sessionMembers });
    } catch (err) {
      next(err);
    }
  });

  // Update user's role in an active session
  router.patch("/:sessionId/role", async (req, res, next) => {
    try {
      const schema = z.object({ role: roleSchema });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid role." });
        return;
      }

      const session = await db.getSessionById(req.params.sessionId!);
      if (!session || session.status !== "active") {
        res.status(404).json({ error: "Active session not found." });
        return;
      }

      await assertProjectAccess(session.projectId, req.dbUser!.id);
      await db.upsertSessionMember({
        sessionId: session.id,
        userId: req.dbUser!.id,
        role: parsed.data.role,
      });

      sessions.broadcastPresence(session.projectId);
      res.json({ ok: true, role: parsed.data.role });
    } catch (err) {
      if (err instanceof AccessError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      next(err);
    }
  });

  // Host explicitly ends the session
  router.post("/:sessionId/end", async (req, res, next) => {
    try {
      const session = await db.getSessionById(req.params.sessionId!);
      if (!session) {
        res.status(404).json({ error: "Session not found." });
        return;
      }
      const project = await db.getProjectById(session.projectId);
      if (session.hostId !== req.dbUser!.id && project?.ownerId !== req.dbUser!.id) {
        res.status(403).json({ error: "Only the session host can end this session." });
        return;
      }

      await sessions.endSessionAndDisconnect(session.id, "Host closed the session.");
      res.json({ ended: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
