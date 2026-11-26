import type { NextFunction, Request, Response } from "express";
import { db, type DbProject, type DbProjectMember } from "../services/db.js";

export interface ProjectAccessResult {
  project: DbProject;
  isOwner: boolean;
  member: DbProjectMember | null;
}

declare global {
  namespace Express {
    interface Request {
      projectAccess?: ProjectAccessResult;
    }
  }
}

export class AccessError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Authoritative project membership check used by REST routes, Socket.io, Yjs WS,
 * preview routes, zip export, and Git push.
 */
const UUID_REGEX = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

export async function assertProjectAccess(
  projectId: string,
  userId: string
): Promise<ProjectAccessResult> {
  if (!UUID_REGEX.test(projectId)) {
    throw new AccessError("Invalid project ID.", 400);
  }
  const project = await db.getProjectById(projectId);
  if (!project) {
    throw new AccessError("Project not found.", 404);
  }

  if (project.ownerId === userId) {
    const member = await db.getProjectMember(projectId, userId);
    return { project, isOwner: true, member };
  }

  const member = await db.getProjectMember(projectId, userId);
  if (!member) {
    throw new AccessError("Forbidden: you are not a member of this project.", 403);
  }

  if (member.permanent) {
    return { project, isOwner: false, member };
  }

  // Non-permanent member: valid only while an active session exists and they are in it
  const activeSession = await db.getActiveSessionForProject(projectId);
  if (!activeSession) {
    // Stale temporary membership cleanup
    await db.deleteProjectMember(projectId, userId).catch(() => undefined);
    throw new AccessError("Forbidden: your session has ended.", 403);
  }

  const sessionMembers = await db.listSessionMembers(activeSession.id);
  const inSession = sessionMembers.some((sm) => sm.userId === userId);
  if (!inSession) {
    await db.deleteProjectMember(projectId, userId).catch(() => undefined);
    throw new AccessError("Forbidden: you are not an active participant in this session.", 403);
  }

  return { project, isOwner: false, member };
}

export async function requireProjectMember(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const projectId = req.params.projectId;
    if (!projectId) {
      res.status(400).json({ error: "Missing projectId parameter." });
      return;
    }
    const access = await assertProjectAccess(projectId, req.dbUser!.id);
    req.projectAccess = access;
    next();
  } catch (err) {
    if (err instanceof AccessError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    next(err);
  }
}

export async function requireProjectOwner(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const projectId = req.params.projectId;
    if (!projectId) {
      res.status(400).json({ error: "Missing projectId parameter." });
      return;
    }
    const access = await assertProjectAccess(projectId, req.dbUser!.id);
    if (!access.isOwner) {
      res.status(403).json({ error: "Forbidden: only the project owner can perform this action." });
      return;
    }
    req.projectAccess = access;
    next();
  } catch (err) {
    if (err instanceof AccessError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    next(err);
  }
}
