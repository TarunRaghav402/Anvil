import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { env } from "../config/env.js";
import { adminAuth } from "../config/firebase.js";
import { verifyFirebaseToken } from "../middleware/auth.js";
import { db, DbError } from "../services/db.js";
import {
  isSmtpConfigured,
  sendEmailOtp,
  verifyOtp,
} from "../services/emailOtpService.js";
import { normalizeNodeName } from "../utils/filenames.js";

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth requests. Please wait a moment and try again." },
});

const strictCodeLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many verification attempts. Please wait a few minutes and try again." },
});

const usernameSchema = z
  .string()
  .transform((v) => normalizeNodeName(v).trim())
  .refine((v) => v.length >= 3 && v.length <= 30, "Username must be between 3 and 30 characters.")
  .refine(
    (v) => /^[a-zA-Z0-9_.-]+$/.test(v),
    "Username may only contain letters, numbers, underscores, dots, and hyphens."
  );

const otpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Verification code must be 6 digits.");

async function verifyFirebasePassword(email: string, password: string): Promise<boolean> {
  const apiKey =
    env.FIREBASE_WEB_API_KEY?.trim() || env.VITE_FIREBASE_API_KEY?.trim() || "anvil-local-api-key";
  const baseUrl = env.USE_FIREBASE_EMULATORS
    ? `http://${env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`
    : "https://identitytoolkit.googleapis.com/v1";

  const res = await fetch(
    `${baseUrl}/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    }
  );
  return res.ok;
}

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

// Login with username + password only (verifies password against Firebase Auth before returning email)
authRouter.post("/login-username", strictCodeLimiter, async (req, res, next) => {
  try {
    const schema = z.object({
      username: usernameSchema,
      password: z.string().min(1, "Password is required."),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Wrong username or password." });
      return;
    }

    const user = await db.getUserByUsername(parsed.data.username);
    if (!user) {
      res.status(401).json({ error: "Wrong username or password." });
      return;
    }

    const validPassword = await verifyFirebasePassword(user.email, parsed.data.password);
    if (!validPassword) {
      res.status(401).json({ error: "Wrong username or password." });
      return;
    }

    res.json({ email: user.email, username: user.username });
  } catch (err) {
    next(err);
  }
});

// Send 6-digit verification code to signed-in user's email
authRouter.post(
  "/send-verification-code",
  strictCodeLimiter,
  verifyFirebaseToken,
  async (req, res, next) => {
    try {
      const { uid, email, emailVerified } = req.auth!;
      if (!email) {
        res.status(400).json({ error: "Account has no email address." });
        return;
      }
      if (emailVerified) {
        res.json({ sent: false, alreadyVerified: true, delivery: isSmtpConfigured() ? "smtp" : "emulator" });
        return;
      }

      const dbUser = await db.getUserById(uid);
      const result = await sendEmailOtp("verify_email", email, dbUser?.username);
      res.json({
        sent: true,
        delivery: result.delivery,
        canQuickVerify: env.USE_FIREBASE_EMULATORS && !isSmtpConfigured(),
        ...(result.emulatorCode ? { emulatorCode: result.emulatorCode } : {}),
      });
    } catch (err) {
      next(err);
    }
  }
);

// Verify 6-digit email verification code (or emulator quick-verify when SMTP is not configured)
authRouter.post(
  "/verify-email-code",
  strictCodeLimiter,
  verifyFirebaseToken,
  async (req, res, next) => {
    try {
      const schema = z.object({
        code: otpCodeSchema.optional(),
        emulatorQuickVerify: z.boolean().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid verification request." });
        return;
      }

      const { uid, email } = req.auth!;
      if (!email) {
        res.status(400).json({ error: "Account has no email address." });
        return;
      }

      if (parsed.data.emulatorQuickVerify) {
        if (!env.USE_FIREBASE_EMULATORS || isSmtpConfigured()) {
          res.status(403).json({
            error: "Quick verify is only available in local emulator mode without SMTP.",
          });
          return;
        }
      } else {
        if (!parsed.data.code) {
          res.status(400).json({ error: "Please enter the 6-digit verification code." });
          return;
        }
        const check = verifyOtp("verify_email", email, parsed.data.code);
        if (!check.valid) {
          res.status(400).json({ error: check.reason ?? "Invalid verification code." });
          return;
        }
      }

      await adminAuth.updateUser(uid, { emailVerified: true });
      res.json({ verified: true });
    } catch (err) {
      next(err);
    }
  }
);

// Forgot password: send 6-digit reset code to email
authRouter.post("/forgot-password", strictCodeLimiter, async (req, res, next) => {
  try {
    const schema = z.object({
      email: z.string().trim().email("Please enter a valid email address."),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid email address." });
      return;
    }

    const cleanEmail = parsed.data.email.toLowerCase();
    const user = await db.getUserByEmail(cleanEmail);
    const smtpActive = isSmtpConfigured();

    let emulatorCode: string | undefined;
    if (user) {
      const result = await sendEmailOtp("reset_password", user.email, user.username);
      emulatorCode = result.emulatorCode;
    }

    res.json({
      sent: true,
      delivery: smtpActive ? "smtp" : "emulator",
      message: "If an account exists for that email, a 6-digit reset code has been sent.",
      ...(emulatorCode ? { emulatorCode } : {}),
    });
  } catch (err) {
    next(err);
  }
});

// Reset password using 6-digit email code
authRouter.post("/reset-password", strictCodeLimiter, async (req, res, next) => {
  try {
    const schema = z.object({
      email: z.string().trim().email("Please enter a valid email address."),
      code: otpCodeSchema,
      newPassword: z.string().min(6, "Password must be at least 6 characters.").max(128),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid reset request." });
      return;
    }

    const cleanEmail = parsed.data.email.toLowerCase();
    const user = await db.getUserByEmail(cleanEmail);
    if (!user) {
      res.status(400).json({ error: "Invalid or expired reset code." });
      return;
    }

    const check = verifyOtp("reset_password", user.email, parsed.data.code);
    if (!check.valid) {
      res.status(400).json({ error: check.reason ?? "Invalid verification code." });
      return;
    }

    await adminAuth.updateUser(user.id, {
      password: parsed.data.newPassword,
      emailVerified: true,
    });

    res.json({ reset: true, username: user.username });
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
