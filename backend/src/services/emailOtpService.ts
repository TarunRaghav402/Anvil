import crypto from "crypto";
import nodemailer from "nodemailer";
import { APP_EMAIL_VERIFICATION_SUBJECT, APP_NAME } from "../../../appConfig.js";
import { env } from "../config/env.js";

export type OtpPurpose = "verify_email" | "reset_password";

interface OtpRecord {
  hash: Buffer;
  expiresAt: number;
  attempts: number;
}

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

const otpStore = new Map<string, OtpRecord>();

function storeKey(purpose: OtpPurpose, email: string): string {
  return `${purpose}:${email.trim().toLowerCase()}`;
}

function hashOtp(purpose: OtpPurpose, email: string, code: string): Buffer {
  return crypto
    .createHmac("sha256", env.PREVIEW_TOKEN_SECRET)
    .update(`${purpose}:${email.trim().toLowerCase()}:${code.trim()}`)
    .digest();
}

export function isSmtpConfigured(): boolean {
  return Boolean(env.SMTP_HOST?.trim() && env.SMTP_USER?.trim() && env.SMTP_PASS?.trim());
}

export function generateOtpCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export function storeOtp(purpose: OtpPurpose, email: string, code: string, ttlMs = OTP_TTL_MS): void {
  const key = storeKey(purpose, email);
  otpStore.set(key, {
    hash: hashOtp(purpose, email, code),
    expiresAt: Date.now() + ttlMs,
    attempts: 0,
  });
}

export function verifyOtp(
  purpose: OtpPurpose,
  email: string,
  candidateCode: string
): { valid: boolean; reason?: string } {
  const key = storeKey(purpose, email);
  const record = otpStore.get(key);
  if (!record) {
    return { valid: false, reason: "No active verification code found. Request a new code." };
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(key);
    return { valid: false, reason: "Verification code expired. Request a new code." };
  }

  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    otpStore.delete(key);
    return { valid: false, reason: "Too many incorrect attempts. Request a new code." };
  }

  const candidateHash = hashOtp(purpose, email, candidateCode);
  const match =
    candidateHash.length === record.hash.length &&
    crypto.timingSafeEqual(candidateHash, record.hash);

  if (!match) {
    record.attempts += 1;
    const remaining = MAX_OTP_ATTEMPTS - record.attempts;
    if (remaining <= 0) {
      otpStore.delete(key);
      return { valid: false, reason: "Too many incorrect attempts. Request a new code." };
    }
    return { valid: false, reason: `Invalid verification code (${remaining} attempts remaining).` };
  }

  otpStore.delete(key);
  return { valid: true };
}

export function clearOtp(purpose: OtpPurpose, email: string): void {
  otpStore.delete(storeKey(purpose, email));
}

export interface SendOtpResult {
  delivery: "smtp" | "emulator";
  emulatorCode?: string;
}

export async function sendEmailOtp(
  purpose: OtpPurpose,
  email: string,
  username?: string
): Promise<SendOtpResult> {
  const cleanEmail = email.trim().toLowerCase();
  const code = generateOtpCode();
  storeOtp(purpose, cleanEmail, code);

  const subject =
    purpose === "verify_email"
      ? APP_EMAIL_VERIFICATION_SUBJECT
      : `Reset your ${APP_NAME} password`;

  const actionLabel =
    purpose === "verify_email"
      ? `verify your email address for ${APP_NAME}`
      : `reset your ${APP_NAME} password`;

  const greeting = username ? `Hi ${username},` : "Hi,";
  const textBody = `${greeting}\n\nYour ${APP_NAME} code to ${actionLabel} is:\n\n${code}\n\nThis code expires in 10 minutes. If you did not request this, ignore this email.\n`;
  const htmlBody = `
    <div style="font-family: system-ui, -apple-system, sans-serif; background: #1e1e1e; color: #cccccc; padding: 24px; max-width: 480px;">
      <h2 style="margin: 0 0 12px; color: #ffffff; border-bottom: 2px solid #007acc; padding-bottom: 8px;">${APP_NAME}</h2>
      <p style="margin: 0 0 12px;">${greeting}</p>
      <p style="margin: 0 0 16px;">Use this 6-digit code to ${actionLabel}:</p>
      <div style="font-family: Consolas, Menlo, monospace; font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #ffffff; background: #252526; border: 1px solid #3c3c3c; padding: 14px 20px; text-align: center;">
        ${code}
      </div>
      <p style="margin: 16px 0 0; font-size: 12px; color: #858585;">This code expires in 10 minutes.</p>
    </div>
  `;

  if (isSmtpConfigured()) {
    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST!.trim(),
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_USER!.trim(),
        pass: env.SMTP_PASS!.trim(),
      },
    });

    await transporter.sendMail({
      from: env.SMTP_FROM?.trim() || `${APP_NAME} <${env.SMTP_USER!.trim()}>`,
      to: cleanEmail,
      subject,
      text: textBody,
      html: htmlBody,
    });

    return { delivery: "smtp" };
  }

  if (env.USE_FIREBASE_EMULATORS) {
    console.log(
      `[${APP_NAME} Email OTP] (${purpose}) for ${cleanEmail}: ${code} (configure SMTP_* in .env to send real emails)`
    );
    return { delivery: "emulator", emulatorCode: code };
  }

  throw new Error(
    "Email delivery is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env."
  );
}
