import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import { env } from "../config/env.js";
import { sanitizeProjectRelativePath } from "../utils/filenames.js";
import { db, type DbUser } from "./db.js";
import { buildNodePathMap } from "./projectTree.js";
import type { SessionManager } from "./sessionManager.js";
import { downloadAssetBuffer } from "./storageService.js";
import type { YjsCollaborationServer } from "./yjsServer.js";

const execFileAsync = promisify(execFile);

export interface CommitPushInput {
  projectId: string;
  user: DbUser;
  originUrl: string;
  branch: string;
  pat: string;
  commitMessage: string;
}

export interface CommitPushResult {
  commitSha: string;
  branch: string;
  originUrl: string;
  filesCommitted: number;
  message: string;
}

export class GitValidationError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

// Per-project async queue lock so simultaneous pushes are queued, never parallel
const projectPushQueue = new Map<string, Promise<unknown>>();
// Track last commit SHA pushed by Anvil per (projectId + originUrl + branch)
const lastPushedBranchSha = new Map<string, string>();

export function scrubPatFromText(text: string, pat: string): string {
  let scrubbed = text;
  if (pat) {
    const encodedPat = encodeURIComponent(pat);
    scrubbed = scrubbed.split(pat).join("[REDACTED_PAT]");
    if (encodedPat && encodedPat !== pat) {
      scrubbed = scrubbed.split(encodedPat).join("[REDACTED_PAT]");
    }
  }
  // Also strip any credential embedded in https://user:token@github.com URLs
  scrubbed = scrubbed.replace(/https:\/\/[^/\s@]+@/gi, "https://[REDACTED]@");
  return scrubbed;
}

export function validateGitHubOriginUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed || /[\s\0]/.test(trimmed)) {
    throw new GitValidationError("Invalid GitHub Origin URL.");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new GitValidationError("GitHub Origin URL must be a valid HTTPS URL (e.g. https://github.com/owner/repo.git).");
  }
  if (parsed.protocol !== "https:") {
    throw new GitValidationError("Only HTTPS GitHub Origin URLs are allowed.");
  }
  if (parsed.hostname.toLowerCase() !== "github.com") {
    throw new GitValidationError("Only github.com repository URLs are allowed.");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new GitValidationError("Origin URL must not embed credentials, query strings, or fragments.");
  }
  const parts = parsed.pathname.replace(/^\/+|\/+$/g, "").split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1] || parts.some((p) => p === ".." || p === ".")) {
    throw new GitValidationError("GitHub Origin URL must look like https://github.com/owner/repo.git");
  }
  const cleanRepo = parts[1].endsWith(".git") ? parts[1] : `${parts[1]}.git`;
  return `https://github.com/${parts[0]}/${cleanRepo}`;
}

export function validateGitBranchName(rawBranch: string): string {
  const branch = rawBranch.trim();
  if (!branch || branch.length > 120) {
    throw new GitValidationError("Branch name must be between 1 and 120 characters.");
  }
  if (
    branch.startsWith("-") ||
    branch.startsWith("/") ||
    branch.endsWith("/") ||
    branch.endsWith(".") ||
    branch.endsWith(".lock") ||
    branch.includes("..") ||
    branch.includes("//") ||
    branch.includes("@{") ||
    /[\s~^:?*\[\\\x00-\x1f\x7f]/.test(branch)
  ) {
    throw new GitValidationError(`Invalid Git branch name: "${branch}".`);
  }
  return branch;
}

export function validateCommitMessage(rawMessage: string): string {
  const clean = rawMessage.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").trim();
  if (!clean || clean.length > 500) {
    throw new GitValidationError("Commit message must be between 1 and 500 characters.");
  }
  return clean;
}

function buildAuthenticatedOriginUrl(canonicalUrl: string, pat: string): string {
  const parsed = new URL(canonicalUrl);
  parsed.username = "x-access-token";
  parsed.password = pat;
  return parsed.toString();
}

async function runGit(
  cwd: string,
  args: string[],
  pat: string,
  onLog: (stream: "stdout" | "stderr", line: string) => void
): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync("git", args, {
      cwd,
      timeout: env.GIT_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GCM_INTERACTIVE: "never",
      },
    });
    const out = scrubPatFromText(result.stdout ?? "", pat);
    const err = scrubPatFromText(result.stderr ?? "", pat);
    for (const line of out.split(/\r?\n/)) {
      if (line.trim()) onLog("stdout", line);
    }
    for (const line of err.split(/\r?\n/)) {
      if (line.trim()) onLog("stderr", line);
    }
    return { stdout: out, stderr: err };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const stdout = scrubPatFromText(String(e.stdout ?? ""), pat);
    const stderr = scrubPatFromText(String(e.stderr ?? ""), pat);
    const message = scrubPatFromText(String(e.message ?? "Git command failed"), pat);
    for (const line of stdout.split(/\r?\n/)) {
      if (line.trim()) onLog("stdout", line);
    }
    for (const line of stderr.split(/\r?\n/)) {
      if (line.trim()) onLog("stderr", line);
    }
    throw Object.assign(new Error(stderr || message), { stdout, stderr });
  }
}

export class GitService {
  private yjs: YjsCollaborationServer;
  private sessions: SessionManager;

  constructor(yjs: YjsCollaborationServer, sessions: SessionManager) {
    this.yjs = yjs;
    this.sessions = sessions;
  }

  enqueueCommitAndPush(input: CommitPushInput): Promise<CommitPushResult> {
    const prev = projectPushQueue.get(input.projectId) ?? Promise.resolve();
    const nextTask = prev
      .catch(() => undefined)
      .then(() => this.executeCommitAndPush(input));

    projectPushQueue.set(input.projectId, nextTask);
    nextTask.finally(() => {
      if (projectPushQueue.get(input.projectId) === nextTask) {
        projectPushQueue.delete(input.projectId);
      }
    });

    return nextTask;
  }

  private async executeCommitAndPush(input: CommitPushInput): Promise<CommitPushResult> {
    const originUrl = validateGitHubOriginUrl(input.originUrl);
    const branch = validateGitBranchName(input.branch);
    const commitMessage = validateCommitMessage(input.commitMessage);
    const pat = input.pat.trim();
    if (!pat || /[\r\n\0]/.test(pat)) {
      throw new GitValidationError("A valid GitHub Personal Access Token (PAT) is required.");
    }

    const log = (stream: "stdout" | "stderr" | "info" | "error", line: string) => {
      this.sessions.emitGitLog(input.projectId, {
        stream,
        line: scrubPatFromText(line, pat),
      });
    };

    this.sessions.emitGitStatus(input.projectId, { pushing: true });
    log("info", `Starting Commit & Push to ${originUrl} (${branch}) by ${input.user.username}...`);

    // Step 3: Flush any pending Yjs edits to SQL first
    await this.yjs.flushProjectDocs(input.projectId);

    const project = await db.getProjectById(input.projectId);
    if (!project) {
      throw new GitValidationError("Project not found.", 404);
    }
    const nodes = await db.listProjectNodes(input.projectId);
    const pathMap = buildNodePathMap(nodes);

    // Step 4: Materialize into isolated temp folder
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "anvil-git-"));
    let pushedSuccessfully = false;

    try {
      const authUrl = buildAuthenticatedOriginUrl(originUrl, pat);

      await runGit(tempDir, ["init"], pat, log);
      await runGit(tempDir, ["config", "core.autocrlf", "false"], pat, log);
      await runGit(tempDir, ["config", "core.fileMode", "false"], pat, log);
      await runGit(tempDir, ["config", "user.name", input.user.username], pat, log);
      await runGit(tempDir, ["config", "user.email", input.user.email], pat, log);
      await runGit(tempDir, ["remote", "add", "origin", authUrl], pat, log);

      // Check remote branch state so subsequent Anvil pushes fast-forward cleanly,
      // while external remote commits still trigger a non-fast-forward warning.
      const branchCacheKey = `${input.projectId}:${originUrl}:${branch}`;
      const knownSha = lastPushedBranchSha.get(branchCacheKey);
      let parentedOnRemote = false;

      try {
        const lsOut = await runGit(
          tempDir,
          ["ls-remote", "--heads", "origin", `refs/heads/${branch}`],
          pat,
          () => undefined
        );
        const remoteLine = lsOut.stdout.trim().split(/\s+/)[0] ?? "";
        if (remoteLine && knownSha && remoteLine === knownSha) {
          await runGit(tempDir, ["fetch", "--depth=1", "origin", branch], pat, log);
          await runGit(tempDir, ["checkout", "-B", branch, "FETCH_HEAD"], pat, log);
          // Clear tracked working tree files before materializing latest cloud snapshot
          const entries = await fs.readdir(tempDir);
          for (const entry of entries) {
            if (entry === ".git") continue;
            await fs.rm(path.join(tempDir, entry), { recursive: true, force: true });
          }
          parentedOnRemote = true;
        }
      } catch {
        // Proceed with fresh branch creation; git push will handle auth or non-fast-forward cleanly
      }

      if (!parentedOnRemote) {
        await runGit(tempDir, ["checkout", "-B", branch], pat, log);
      }

      // Materialize cloud files
      let fileCount = 0;
      let hasGitattributes = false;

      for (const node of nodes) {
        if (node.nodeType === "folder") continue;
        const relRaw = pathMap.get(node.id);
        if (!relRaw) continue;

        const safeRel = sanitizeProjectRelativePath(relRaw);
        if (safeRel === ".gitattributes") {
          hasGitattributes = true;
        }
        const targetFile = path.join(tempDir, ...safeRel.split("/"));
        await fs.mkdir(path.dirname(targetFile), { recursive: true });

        if (node.nodeType === "text_file") {
          await fs.writeFile(targetFile, node.contentText ?? "", "utf8");
          fileCount += 1;
        } else if (node.nodeType === "binary_asset" && node.storagePath) {
          const buf = await downloadAssetBuffer(node.storagePath);
          await fs.writeFile(targetFile, buf);
          fileCount += 1;
        }
      }

      if (!hasGitattributes) {
        await fs.writeFile(path.join(tempDir, ".gitattributes"), "* text=auto\n", "utf8");
      }

      await runGit(tempDir, ["add", "-A"], pat, log);

      // Check if there is anything staged to commit
      let nothingToCommit = false;
      try {
        await runGit(tempDir, ["diff", "--cached", "--quiet"], pat, () => undefined);
        nothingToCommit = true;
      } catch {
        nothingToCommit = false;
      }

      if (nothingToCommit && parentedOnRemote) {
        const rev = await runGit(tempDir, ["rev-parse", "HEAD"], pat, () => undefined);
        const sha = rev.stdout.trim();
        log("info", "No changes detected compared to remote branch.");
        this.sessions.emitGitStatus(input.projectId, {
          pushing: false,
          pushedBy: input.user.username,
          success: true,
          message: "Remote branch is already up to date.",
        });
        pushedSuccessfully = true;
        return {
          commitSha: sha,
          branch,
          originUrl,
          filesCommitted: 0,
          message: "Remote branch is already up to date.",
        };
      }

      await runGit(tempDir, ["commit", "-m", commitMessage], pat, log);
      const rev = await runGit(tempDir, ["rev-parse", "HEAD"], pat, () => undefined);
      const commitSha = rev.stdout.trim();

      log("info", `Pushing ${commitSha.slice(0, 7)} to origin/${branch}...`);
      await runGit(tempDir, ["push", "-u", "origin", branch], pat, log);

      lastPushedBranchSha.set(branchCacheKey, commitSha);
      await db.updateProjectSettings(input.projectId, {
        githubOriginUrl: originUrl,
        defaultBranch: branch,
      });

      pushedSuccessfully = true;
      const successMsg = `Pushed ${fileCount} files to ${branch} (${commitSha.slice(0, 7)}).`;
      log("info", successMsg);
      this.sessions.emitGitStatus(input.projectId, {
        pushing: false,
        pushedBy: input.user.username,
        success: true,
        message: successMsg,
      });

      return {
        commitSha,
        branch,
        originUrl,
        filesCommitted: fileCount,
        message: successMsg,
      };
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      const cleanMsg = scrubPatFromText(rawMsg, pat);

      let userMessage = cleanMsg;
      if (/non-fast-forward|fetch first|failed to push some refs|\[rejected\]/i.test(cleanMsg)) {
        userMessage = "Remote has newer commits. Push to a new branch or pull manually.";
      } else if (/Authentication failed|invalid username or token|403|401/i.test(cleanMsg)) {
        userMessage = "GitHub authentication failed. Check your Personal Access Token (repo scope) and repository permissions.";
      } else if (/Repository not found|404/i.test(cleanMsg)) {
        userMessage = "GitHub repository not found. Verify the Origin URL and token access.";
      }

      if (!pushedSuccessfully) {
        log("error", userMessage);
        this.sessions.emitGitStatus(input.projectId, {
          pushing: false,
          pushedBy: input.user.username,
          success: false,
          message: userMessage,
        });
      }

      throw new GitValidationError(userMessage, 400);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
