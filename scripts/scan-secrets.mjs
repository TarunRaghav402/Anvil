#!/usr/bin/env node
/**
 * Safe secret scan across source, config, script, test, and doc files.
 * Never scans local secret files (.env, service-account.json, .firebaserc) or build artifacts.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const configPath = path.join(rootDir, ".gitleaks.toml");

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  ".firebase",
  ".dataconnect",
  ".vite",
  "coverage",
  "tmp",
  ".anvil-tmp",
]);
const SKIP_FILES = new Set([".env", ".firebaserc", "service-account.json", "package-lock.json"]);

function isSecretFilename(name) {
  if (SKIP_FILES.has(name)) return true;
  if (/^\.env\..+/i.test(name) && name !== ".env.example") return true;
  if (/\.(pem|key|p12)$/i.test(name)) return true;
  if (
    /service-account.*\.json$/i.test(name) ||
    /serviceAccountKey.*\.json$/i.test(name) ||
    /-adminsdk-.*\.json$/i.test(name)
  )
    return true;
  if (/^credentials.*\.json$/i.test(name) || name === ".runtimeconfig.json") return true;
  return false;
}

function copySafeTree(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      copySafeTree(path.join(srcDir, entry.name), path.join(destDir, entry.name));
    } else if (entry.isFile()) {
      if (isSecretFilename(entry.name)) continue;
      fs.copyFileSync(path.join(srcDir, entry.name), path.join(destDir, entry.name));
    }
  }
}

const gitleaksCheck = spawnSync("gitleaks", ["version"], { encoding: "utf8" });
if (gitleaksCheck.error || gitleaksCheck.status !== 0) {
  console.error("[Anvil] gitleaks CLI not found on PATH. Install gitleaks to run secrets:scan.");
  process.exit(1);
}

const tempStage = fs.mkdtempSync(path.join(os.tmpdir(), "anvil-gitleaks-"));
try {
  copySafeTree(rootDir, tempStage);
  const res = spawnSync(
    "gitleaks",
    ["dir", ".", "--redact", "--no-banner", "--config", configPath],
    { cwd: tempStage, stdio: "inherit" }
  );
  process.exit(res.status ?? 1);
} finally {
  fs.rmSync(tempStage, { recursive: true, force: true });
}
