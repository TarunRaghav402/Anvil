#!/usr/bin/env node
/**
 * Configures Git to use the repository's cross-platform .githooks directory
 * and ensures hook files are executable on POSIX systems.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

if (!fs.existsSync(path.join(rootDir, ".git"))) {
  // Not a git working tree yet (e.g., fresh archive export before `git init`)
  process.exit(0);
}

const preCommitHook = path.join(rootDir, ".githooks", "pre-commit");
if (process.platform !== "win32" && fs.existsSync(preCommitHook)) {
  try {
    fs.chmodSync(preCommitHook, 0o755);
  } catch {
    // Ignore permission errors in read-only mounts
  }
}

try {
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], {
    cwd: rootDir,
    stdio: "ignore",
  });
} catch {
  // Ignore if git is unavailable during non-git installs
}
