import type { NextFunction, Request, Response } from "express";
import { adminAuth } from "../config/firebase.js";
import { db, type DbUser } from "../services/db.js";

export interface AuthContext {
  uid: string;
  email: string;
  emailVerified: boolean;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      dbUser?: DbUser;
    }
  }
}

export function extractBearerToken(headerValue: string | undefined): string | null {
  if (!headerValue || !headerValue.startsWith("Bearer ")) {
    return null;
  }
  const token = headerValue.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export async function verifyTokenString(token: string): Promise<AuthContext> {
  const decoded = await adminAuth.verifyIdToken(token);
  const email = (decoded.email ?? "").trim().toLowerCase();
  return {
    uid: decoded.uid,
    email,
    emailVerified: Boolean(decoded.email_verified),
  };
}

export async function verifyFirebaseToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      res.status(401).json({ error: "Missing Authorization Bearer token." });
      return;
    }
    req.auth = await verifyTokenString(token);
    next();
  } catch {
    res.status(401).json({
      error: "Invalid or expired authentication token.",
    });
  }
}

export async function requireVerifiedUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.auth) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  if (!req.auth.emailVerified) {
    res.status(403).json({
      error: "Email verification required. Verify your email to access Anvil.",
      code: "EMAIL_NOT_VERIFIED",
    });
    return;
  }

  try {
    const user = await db.getUserById(req.auth.uid);
    if (!user) {
      res.status(403).json({
        error: "User profile is not registered. Complete registration first.",
        code: "PROFILE_NOT_FOUND",
      });
      return;
    }
    req.dbUser = user;
    next();
  } catch (err) {
    next(err);
  }
}

export async function verifyVerifiedRegisteredUser(token: string): Promise<{
  auth: AuthContext;
  user: DbUser;
}> {
  const auth = await verifyTokenString(token);
  if (!auth.emailVerified) {
    throw Object.assign(new Error("Email verification required."), { statusCode: 403 });
  }
  const user = await db.getUserById(auth.uid);
  if (!user) {
    throw Object.assign(new Error("User profile not registered."), { statusCode: 403 });
  }
  return { auth, user };
}
