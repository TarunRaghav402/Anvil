import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { io } from "socket.io-client";
import WebSocket from "ws";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { adminAuth } from "../src/config/firebase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, "..");

const PORT = 4011;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const WS_URL = `ws://127.0.0.1:${PORT}/yjs`;
const AUTH_EMULATOR_URL = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099"}`;
const API_KEY = process.env.VITE_FIREBASE_API_KEY || "anvil-local-api-key";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForHealth() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await sleep(300);
  }
  throw new Error("Backend server failed to become healthy in time.");
}

async function emulatorSignUp(email: string, password: string): Promise<{ uid: string; idToken: string }> {
  const res = await fetch(
    `${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  const data = (await res.json()) as { localId: string; idToken: string; error?: { message: string } };
  if (!res.ok) throw new Error(`Auth signup failed: ${data.error?.message || res.status}`);
  return { uid: data.localId, idToken: data.idToken };
}

async function emulatorSignIn(email: string, password: string): Promise<string> {
  const res = await fetch(
    `${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  const data = (await res.json()) as { idToken: string; error?: { message: string } };
  if (!res.ok) throw new Error(`Auth signin failed: ${data.error?.message || res.status}`);
  return data.idToken;
}

async function apiReq(
  pathname: string,
  token: string,
  init: RequestInit = {}
): Promise<{ status: number; json: any; raw: Response }> {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const raw = await fetch(`${BASE_URL}${pathname}`, { ...init, headers });
  let json: any = null;
  try {
    json = await raw.clone().json();
  } catch {
    // non-json
  }
  return { status: raw.status, json, raw };
}

async function run() {
  const serverProc = spawn("npx", ["tsx", "src/index.ts"], {
    cwd: backendDir,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: String(PORT),
    },
  });

  serverProc.stdout.on("data", (d) => process.stdout.write(`[server] ${d}`));
  serverProc.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));

  try {
    await waitForHealth();
    console.log("1. Backend healthy.");

    const suffix = Date.now();
    const emailA = `e2e_host_${suffix}@anvil.local`;
    const emailB = `e2e_guest_${suffix}@anvil.local`;
    const emailC = `e2e_outsider_${suffix}@anvil.local`;
    const pw = "AnvilPass!123";

    // Create Host (unverified initially)
    const userA = await emulatorSignUp(emailA, pw);
    const regA = await apiReq("/api/auth/register", userA.idToken, {
      method: "POST",
      body: JSON.stringify({ username: `host_${suffix}` }),
    });
    assert.equal(regA.status, 201);

    // Unverified host must be blocked with 403
    const blockedUnverified = await apiReq("/api/projects", userA.idToken);
    assert.equal(blockedUnverified.status, 403);
    assert.equal(blockedUnverified.json.code, "EMAIL_NOT_VERIFIED");

    // Verify User A via 6-digit email OTP endpoint
    const otpSendA = await apiReq("/api/auth/send-verification-code", userA.idToken, {
      method: "POST",
    });
    assert.equal(otpSendA.status, 200);
    assert.match(String(otpSendA.json.emulatorCode), /^\d{6}$/);

    const otpVerifyA = await apiReq("/api/auth/verify-email-code", userA.idToken, {
      method: "POST",
      body: JSON.stringify({ code: otpSendA.json.emulatorCode }),
    });
    assert.equal(otpVerifyA.status, 200);
    assert.equal(otpVerifyA.json.verified, true);
    console.log("2. Email verification gate & 6-digit OTP verification enforced.");

    // Username-only login + forgot-password reset flow
    const badLogin = await apiReq("/api/auth/login-username", "", {
      method: "POST",
      body: JSON.stringify({ username: `host_${suffix}`, password: "WrongPassword!" }),
    });
    assert.equal(badLogin.status, 401);

    const okLogin = await apiReq("/api/auth/login-username", "", {
      method: "POST",
      body: JSON.stringify({ username: `host_${suffix}`, password: pw }),
    });
    assert.equal(okLogin.status, 200);
    assert.equal(okLogin.json.email, emailA);

    const forgotRes = await apiReq("/api/auth/forgot-password", "", {
      method: "POST",
      body: JSON.stringify({ email: emailA }),
    });
    assert.equal(forgotRes.status, 200);
    assert.match(String(forgotRes.json.emulatorCode), /^\d{6}$/);

    const newPw = "AnvilUpdated!456";
    const resetRes = await apiReq("/api/auth/reset-password", "", {
      method: "POST",
      body: JSON.stringify({
        email: emailA,
        code: forgotRes.json.emulatorCode,
        newPassword: newPw,
      }),
    });
    assert.equal(resetRes.status, 200);
    const tokenA = await emulatorSignIn(emailA, newPw);
    console.log("2b. Username-only login and forgot/reset password code flow verified.");

    const userB = await emulatorSignUp(emailB, pw);
    // Duplicate username must fail with 409
    const dupReg = await apiReq("/api/auth/register", userB.idToken, {
      method: "POST",
      body: JSON.stringify({ username: `host_${suffix}` }),
    });
    assert.equal(dupReg.status, 409);

    const regB = await apiReq("/api/auth/register", userB.idToken, {
      method: "POST",
      body: JSON.stringify({ username: `guest_${suffix}` }),
    });
    assert.equal(regB.status, 201);
    await adminAuth.updateUser(userB.uid, { emailVerified: true });
    const tokenB = await emulatorSignIn(emailB, pw);

    const userC = await emulatorSignUp(emailC, pw);
    await apiReq("/api/auth/register", userC.idToken, {
      method: "POST",
      body: JSON.stringify({ username: `outsider_${suffix}` }),
    });
    await adminAuth.updateUser(userC.uid, { emailVerified: true });
    const tokenC = await emulatorSignIn(emailC, pw);

    // Create project
    const createdProj = await apiReq("/api/projects", tokenA, {
      method: "POST",
      body: JSON.stringify({ name: "E2E Arena", template: "canvas-game" }),
    });
    assert.equal(createdProj.status, 201);
    const projectId = createdProj.json.project.id as string;

    // Cross-OS filename rules
    const badWinName = await apiReq(`/api/projects/${projectId}/nodes`, tokenA, {
      method: "POST",
      body: JSON.stringify({ parentId: null, name: "CON.txt", nodeType: "text_file" }),
    });
    assert.equal(badWinName.status, 400);

    const okFile = await apiReq(`/api/projects/${projectId}/nodes`, tokenA, {
      method: "POST",
      body: JSON.stringify({ parentId: null, name: "Player.js", nodeType: "text_file", contentText: "// player\n" }),
    });
    assert.equal(okFile.status, 201);

    const caseCollision = await apiReq(`/api/projects/${projectId}/nodes`, tokenA, {
      method: "POST",
      body: JSON.stringify({ parentId: null, name: "player.js", nodeType: "text_file" }),
    });
    assert.equal(caseCollision.status, 409);
    console.log("3. Cross-OS filename rules (Windows reserved + case-insensitive collision) enforced.");

    // Binary PNG upload to Firebase Storage
    const png1x1 = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );
    const form = new FormData();
    form.append("files", new Blob([png1x1], { type: "image/png" }), "hero.png");
    const uploadRes = await apiReq(`/api/projects/${projectId}/nodes/upload`, tokenA, {
      method: "POST",
      body: form,
    });
    assert.equal(uploadRes.status, 201);
    const pngNodeId = uploadRes.json.uploaded[0].id as string;

    const pngDownload = await apiReq(`/api/projects/${projectId}/nodes/${pngNodeId}/content`, tokenA);
    assert.equal(pngDownload.status, 200);
    const downloadedBuf = Buffer.from(await pngDownload.raw.arrayBuffer());
    assert.equal(Buffer.compare(downloadedBuf, png1x1), 0);
    console.log("4. Binary asset upload/download via Firebase Storage Emulator verified.");

    // Non-member access control
    const outsiderRes = await apiReq(`/api/projects/${projectId}`, tokenC);
    assert.equal(outsiderRes.status, 403);
    console.log("5. Non-member REST access blocked with 403.");

    // Host starts session
    console.log("5a. Starting session...");
    const startRes = await apiReq("/api/sessions/start", tokenA, {
      method: "POST",
      body: JSON.stringify({ projectId, role: "coder" }),
    });
    assert.equal(startRes.status, 201);
    const sessionCode = startRes.json.session.sessionCode as string;
    const sessionId = startRes.json.session.id as string;
    assert.match(sessionCode, /^[A-Z0-9]{6}$/);

    // Guest B joins via code
    console.log("5b. Joining session as guest B...");
    const joinRes = await apiReq("/api/sessions/join", tokenB, {
      method: "POST",
      body: JSON.stringify({ sessionCode, role: "designer" }),
    });
    assert.equal(joinRes.status, 200);

    // Connect Socket.io for B to verify presence + session:ended event
    console.log("5c. Connecting Socket.io for B...");
    const sockB = io(BASE_URL, { auth: { token: tokenB }, transports: ["websocket"] });
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("Socket.io connect timeout")), 10000);
      sockB.on("connect", () => {
        sockB.emit("project:join", { projectId, role: "designer" }, (ack: any) => {
          clearTimeout(t);
          if (ack?.ok) resolve();
          else reject(new Error(ack?.error || "Socket join failed"));
        });
      });
      sockB.on("connect_error", (e) => {
        clearTimeout(t);
        reject(e);
      });
    });

    // Live Preview capability token & HTML serving
    console.log("5d. Checking Live Preview...");
    const previewTokB = await apiReq(`/api/projects/${projectId}/preview-token`, tokenB, {
      method: "POST",
    });
    assert.equal(previewTokB.status, 200);
    const tokenValB = previewTokB.json.token as string;
    const htmlPreview = await fetch(`${BASE_URL}/api/preview/${projectId}/t/${tokenValB}/index.html`);
    assert.equal(htmlPreview.status, 200);
    assert.match(await htmlPreview.text(), /<canvas id="game"/);

    // Live Yjs CRDT edit between A and B
    console.log("5e. Connecting Yjs WebSocket providers...");
    const nodesList = await apiReq(`/api/projects/${projectId}/nodes`, tokenA);
    const mainJs = nodesList.json.nodes.find((n: any) => n.name === "main.js");
    assert.ok(mainJs);

    // Outsider C must be rejected on Yjs WebSocket handshake (403)
    await new Promise<void>((resolve, reject) => {
      const wsC = new WebSocket(`${WS_URL}/${projectId}:${mainJs.id}?token=${encodeURIComponent(tokenC)}`);
      wsC.on("unexpected-response", (_req, res) => {
        assert.equal(res.statusCode, 403);
        wsC.terminate();
        resolve();
      });
      wsC.on("open", () => {
        wsC.terminate();
        reject(new Error("Outsider C should not be able to open Yjs WebSocket"));
      });
      wsC.on("error", () => resolve());
    });

    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const provA = new WebsocketProvider(WS_URL, `${projectId}:${mainJs.id}`, docA, {
      params: { token: tokenA },
      disableBc: true,
      WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
    });
    const provB = new WebsocketProvider(WS_URL, `${projectId}:${mainJs.id}`, docB, {
      params: { token: tokenB },
      disableBc: true,
      WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
    });

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Yjs provA sync timeout")), 10000);
        if (provA.synced) {
          clearTimeout(t);
          resolve();
        } else {
          provA.on("sync", (s: boolean) => {
            if (s) {
              clearTimeout(t);
              resolve();
            }
          });
        }
      }),
      new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Yjs provB sync timeout")), 10000);
        if (provB.synced) {
          clearTimeout(t);
          resolve();
        } else {
          provB.on("sync", (s: boolean) => {
            if (s) {
              clearTimeout(t);
              resolve();
            }
          });
        }
      }),
    ]);

    docA.getText("monaco").insert(0, "// synced-live-edit\n");
    await sleep(400);
    assert.ok(docB.getText("monaco").toString().startsWith("// synced-live-edit\n"));

    // Force sync flushes Yjs to SQL
    const syncRes = await apiReq(`/api/projects/${projectId}/sync`, tokenA, { method: "POST" });
    assert.equal(syncRes.status, 200);
    const contentCheck = await apiReq(`/api/projects/${projectId}/nodes/${mainJs.id}/content`, tokenB);
    assert.ok(contentCheck.json.contentText.startsWith("// synced-live-edit\n"));
    console.log("6. Real-time Yjs CRDT collaboration + SQL flush + Live Preview verified.");

    provA.destroy();
    provB.destroy();
    docA.destroy();
    docB.destroy();

    // Comments + replies + resolve
    const cRes = await apiReq(`/api/projects/${projectId}/comments`, tokenB, {
      method: "POST",
      body: JSON.stringify({ nodeId: mainJs.id, lineNumber: 1, body: "Looks great!" }),
    });
    assert.equal(cRes.status, 201);
    const commentId = cRes.json.comment.id as string;
    const resolveRes = await apiReq(`/api/projects/${projectId}/comments/${commentId}`, tokenA, {
      method: "PATCH",
      body: JSON.stringify({ resolved: true }),
    });
    assert.equal(resolveRes.status, 200);
    assert.equal(resolveRes.json.comment.resolved, true);
    console.log("7. Contextual comments + resolve verified.");

    // Zip export check
    const zipRes = await apiReq(`/api/projects/${projectId}/export`, tokenB);
    assert.equal(zipRes.status, 200);
    const zipBuf = Buffer.from(await zipRes.raw.arrayBuffer());
    assert.equal(zipBuf.subarray(0, 2).toString("utf8"), "PK");
    assert.ok(zipBuf.includes(Buffer.from("index.html", "utf8")));
    assert.ok(zipBuf.includes(Buffer.from("hero.png", "utf8")));
    console.log("8. Zip export verified.");

    // Host ends session -> B gets session:ended + loses REST & preview access
    const endedPromise = new Promise<void>((resolve) => {
      sockB.on("session:ended", () => resolve());
    });
    const endRes = await apiReq(`/api/sessions/${sessionId}/end`, tokenA, { method: "POST" });
    assert.equal(endRes.status, 200);
    await endedPromise;
    await sleep(250);
    sockB.disconnect();

    const postEndRead = await apiReq(`/api/projects/${projectId}`, tokenB);
    assert.equal(postEndRead.status, 403);
    const postEndPreview = await fetch(`${BASE_URL}/api/preview/${projectId}/t/${tokenValB}/index.html`);
    assert.equal(postEndPreview.status, 403);
    const postEndJoin = await apiReq("/api/sessions/join", tokenB, {
      method: "POST",
      body: JSON.stringify({ sessionCode, role: "coder" }),
    });
    assert.equal(postEndJoin.status, 404);
    console.log("9. Session end invalidates code and revokes temporary member access (REST + Preview).");

    // Permanent member Git Push PAT scrubbing check & outsider 403
    const outsiderGit = await apiReq(`/api/projects/${projectId}/git/commit-push`, tokenC, {
      method: "POST",
      body: JSON.stringify({
        originUrl: "https://github.com/acme/nonexistent-test-repo.git",
        branch: "main",
        pat: "ghp_SENSITIVE_PAT_999",
        commitMessage: "Test",
      }),
    });
    assert.equal(outsiderGit.status, 403);

    await apiReq(`/api/projects/${projectId}/members`, tokenA, {
      method: "POST",
      body: JSON.stringify({ identifier: `guest_${suffix}` }),
    });
    const secretPat = "ghp_SENSITIVE_PAT_SHOULD_NEVER_LEAK_999";
    const gitAttempt = await apiReq(`/api/projects/${projectId}/git/commit-push`, tokenB, {
      method: "POST",
      body: JSON.stringify({
        originUrl: "https://github.com/anvil-nonexistent-org-check/anvil-nonexistent-repo.git",
        branch: "main",
        pat: secretPat,
        commitMessage: "Verify PAT scrubbing",
      }),
    });
    assert.equal(gitAttempt.status, 400);
    assert.equal(JSON.stringify(gitAttempt.json).includes(secretPat), false);
    console.log("10. Non-host permanent member Git push access + PAT scrubbing verified.");

    console.log("\nALL E2E EMULATOR INTEGRATION TESTS PASSED!");
  } finally {
    serverProc.kill("SIGTERM");
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("E2E test failed:", err);
    process.exit(1);
  });
