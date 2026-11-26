import crypto from "crypto";
import { env } from "../config/env.js";

interface TokenPayload {
  uid: string;
  projectId: string;
  iat: number;
  exp: number;
  nonce: string;
}

const revokedUsersPerProject = new Map<string, number>();

export function revokePreviewTokensForUser(projectId: string, userId: string): void {
  revokedUsersPerProject.set(`${projectId}:${userId}`, Date.now());
}

export function issuePreviewToken(projectId: string, userId: string, ttlMs = 30 * 60 * 1000): string {
  const now = Date.now();
  const payload: TokenPayload = {
    uid: userId,
    projectId,
    iat: now,
    exp: now + ttlMs,
    nonce: crypto.randomBytes(8).toString("hex"),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto
    .createHmac("sha256", env.PREVIEW_TOKEN_SECRET)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyPreviewToken(token: string, expectedProjectId: string): { uid: string } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = crypto
    .createHmac("sha256", env.PREVIEW_TOKEN_SECRET)
    .update(encoded)
    .digest("base64url");

  const sigBuf = Buffer.from(sig, "utf8");
  const expectedBuf = Buffer.from(expectedSig, "utf8");
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as TokenPayload;
    if (!payload.uid || payload.projectId !== expectedProjectId || payload.exp < Date.now()) {
      return null;
    }
    const revokedAt = revokedUsersPerProject.get(`${expectedProjectId}:${payload.uid}`);
    if (revokedAt && payload.iat <= revokedAt) {
      return null;
    }
    return { uid: payload.uid };
  } catch {
    return null;
  }
}
