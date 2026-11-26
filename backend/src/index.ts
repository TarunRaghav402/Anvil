import http from "http";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import multer from "multer";
import { Server as SocketIOServer } from "socket.io";
import { APP_NAME } from "../../appConfig.js";
import { env } from "./config/env.js";
import { requireVerifiedUser, verifyFirebaseToken } from "./middleware/auth.js";
import { authRouter } from "./routes/auth.js";
import { createCommentsRouter } from "./routes/comments.js";
import { createPreviewRouter } from "./routes/preview.js";
import { createProjectsRouter } from "./routes/projects.js";
import { createSessionsRouter } from "./routes/sessions.js";
import { DbError } from "./services/db.js";
import { GitService } from "./services/gitService.js";
import { SessionManager } from "./services/sessionManager.js";
import { YjsCollaborationServer } from "./services/yjsServer.js";

const app = express();
const httpServer = http.createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: [env.FRONTEND_ORIGIN, "http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
  },
});

let sessionManager: SessionManager;

const yjsServer = new YjsCollaborationServer((projectId) => {
  sessionManager.schedulePreviewReload(projectId, "yjs-save");
});

sessionManager = new SessionManager(io, yjsServer);
sessionManager.initSocketHandlers();
yjsServer.attachUpgradeHandler(httpServer);

const gitService = new GitService(yjsServer, sessionManager);

// Security headers (with preview route overriding frame/CORP for sandboxed iframe)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "same-site" },
    contentSecurityPolicy: false,
  })
);

app.use(
  cors({
    origin: [env.FRONTEND_ORIGIN, "http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
  })
);

app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    app: APP_NAME,
    status: "ok",
    emulators: env.USE_FIREBASE_EMULATORS,
    paidTiersEnabled: env.ENABLE_PAID_TIERS,
  });
});

// Preview route uses signed capability tokens + project membership validation
app.use("/api/preview", createPreviewRouter(yjsServer));

// Auth routes (check-username, register, me)
app.use("/api/auth", authRouter);

// Protected workspace routes (require valid verified Firebase token + registered user)
app.use("/api/projects", verifyFirebaseToken, requireVerifiedUser, createProjectsRouter(yjsServer, sessionManager, gitService));
app.use("/api/projects", verifyFirebaseToken, requireVerifiedUser, createCommentsRouter(sessionManager));
app.use("/api/sessions", verifyFirebaseToken, requireVerifiedUser, createSessionsRouter(sessionManager));

// Global error handler (never leak internal stack traces, SQL schemas, or secrets)
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? `Uploaded file exceeds the ${env.MAX_UPLOAD_SIZE_MB} MB limit.`
        : err.message;
    res.status(status).json({ error: message });
    return;
  }
  if (err instanceof DbError) {
    if (err.statusCode >= 500) {
      console.error(`[${APP_NAME}] Database error:`, err);
      res.status(err.statusCode).json({ error: "A database error occurred." });
      return;
    }
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  const rawStatus =
    typeof err === "object" && err !== null
      ? "statusCode" in err
        ? (err as { statusCode?: number }).statusCode
        : "status" in err
        ? (err as { status?: number }).status
        : undefined
      : undefined;
  const status = typeof rawStatus === "number" && rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500;
  if (status >= 500) {
    console.error(`[${APP_NAME}] Unhandled error:`, err);
    res.status(status).json({ error: "An unexpected internal server error occurred." });
    return;
  }
  const message = err instanceof Error ? err.message : "Request failed.";
  res.status(status).json({ error: message });
});

httpServer.listen(env.PORT, () => {
  console.log(`[${APP_NAME}] Backend listening on http://127.0.0.1:${env.PORT}`);
  void sessionManager.reconcileActiveSessionsOnBoot();
});
