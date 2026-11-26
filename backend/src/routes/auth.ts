import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { adminAuth } from "../config/firebase.js";
import { verifyFirebaseToken } from "../middleware/auth.js";
import { db, DbError } from "../services/db.js";
import { normalizeNodeName } from "../utils/filenames.js";

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth requests. Please wait a moment and try again." },
});

const usernameSchema = z
  .string()
  .transform((v) => normalizeNodeName(v).trim())
  .refine((v) => v.length >= 3 && v.length <= 30, "Username must be between 3 and 30 characters.")
  .refine(
    (v) => /^[a-zA-Z0-9_.-]+$/.test(v),
    "Username may only contain letters, numbers, underscores, dots, and hyphens."
  );

authRouter.get("/check-username", authLimiter, async (req, res, next) => {
  try {
    const parsed = usernameSchema.safeParse(req.query.username);
    if (!parsed.success) {
      res.status(400).json({
        available: false,
        error: parsed.error.issues[0]?.message ?? "Invalid username.",
      });
      return;
    }

    const existing = await db.getUserByUsername(parsed.data);
    res.json({ available: existing === null, username: parsed.data });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/register", authLimiter, verifyFirebaseToken, async (req, res, next) => {
  try {
    const bodySchema = z.object({
      username: usernameSchema,
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message ?? "Invalid registration payload.",
      });
      return;
    }

    const { uid, email } = req.auth!;
    if (!email) {
      res.status(400).json({ error: "Firebase account is missing an email address." });
      return;
    }

    const existingByUid = await db.getUserById(uid);
    if (existingByUid) {
      res.json({ user: existingByUid });
      return;
    }

    const existingByUsername = await db.getUserByUsername(parsed.data.username);
    if (existingByUsername && existingByUsername.id !== uid) {
      res.status(409).json({ error: "Username is already taken." });
      return;
    }

    const existingByEmail = await db.getUserByEmail(email);
    if (existingByEmail && existingByEmail.id !== uid) {
      res.status(409).json({ error: "An account with this email already exists." });
      return;
    }

    try {
      await db.createUser({
        id: uid,
        username: parsed.data.username,
        email,
        planTier: "free",
      });
    } catch (err) {
      if (err instanceof DbError && err.statusCode === 409) {
        res.status(409).json({ error: "Username or email is already taken." });
        return;
      }
      throw err;
    }

    try {
      await adminAuth.updateUser(uid, { displayName: parsed.data.username });
    } catch {
      // Non-fatal if displayName update fails
    }

    const created = await db.getUserById(uid);
    res.status(201).json({ user: created });
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", verifyFirebaseToken, async (req, res, next) => {
  try {
    const { uid, email, emailVerified } = req.auth!;
    const user = await db.getUserById(uid);
    res.json({
      uid,
      email,
      emailVerified,
      user,
    });
  } catch (err) {
    next(err);
  }
});
