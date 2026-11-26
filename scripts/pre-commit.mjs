#!/usr/bin/env node
/**
 * Cross-platform pre-commit secret guard for Windows, macOS, and Linux.
 * 1. Blocks staging of known secret/credential filenames (defense-in-depth).
 * 2. Runs gitleaks against staged files using .gitleaks.toml.
 * 3. Falls back to built-in regex checks if gitleaks is not yet installed locally.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const FORBIDDEN_FILE_PATTERNS = [
  /(^|\/)\.env$/i,
  /(^|\/)\.env\.(?!example$).+/i,
  /(^|\/)\.firebaserc$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /service-account.*\.json$/i,
  /serviceAccountKey.*\.json$/i,
  /-adminsdk-.*\.json$/i,
  /(^|\/)\.runtimeconfig\.json$/i,
  /(^|\/)credentials.*\.json$/i,
  /(^|\/)secrets\//i,
  /(^|\/)dataconnect\/\.dataconnect\/pgliteData\//i,
];

const FALLBACK_SECRET_RULES = [
  { name: "Google / Firebase API Key", regex: /AIza[0-9A-Za-z\-_]{35}/ },
  { name: "GitHub PAT (classic)", regex: /ghp_[0-9A-Za-z]{36}/ },
  { name: "GitHub PAT (fine-grained)", regex: /github_pat_[0-9A-Za-z_]{22,}/ },
  { name: "Private Key Block", regex: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/ },
  { name: "Firebase Service Account JSON", regex: /"type"\s*:\s*"service_account"/ },
  { name: "AWS Access Key ID", regex: /AKIA[0-9A-Z]{16}/ },
];

function getStagedFiles() {
  const out = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"], {
    cwd: rootDir,
  });
  return out
    .toString("utf8")
    .split("\0")
    .map((s) => s.trim())
    .filter(Boolean);
}

function checkForbiddenFilenames(files) {
  const blocked = [];
  for (const file of files) {
    const normalized = file.replace(/\\/g, "/");
    if (FORBIDDEN_FILE_PATTERNS.some((rx) => rx.test(normalized))) {
      blocked.push(normalized);
    }
  }
  return blocked;
}

function detectGitleaksMode() {
  const ver = spawnSync("gitleaks", ["version"], { encoding: "utf8" });
  if (ver.error || ver.status !== 0) {
    return null;
  }
  const gitHelp = spawnSync("gitleaks", ["git", "--help"], { encoding: "utf8" });
  if (gitHelp.status === 0) {
    return "git";
  }
  return "protect";
}

function runFallbackRegexScan(stagedFiles) {
  const findings = [];
  const skipFiles = new Set([".env.example", ".firebaserc.example", "package-lock.json"]);
  for (const file of stagedFiles) {
    const normalized = file.replace(/\\/g, "/");
    if (skipFiles.has(normalized) || normalized.startsWith("docs/")) continue;
    const diffRes = spawnSync("git", ["diff", "--cached", "--no-color", "-U0", "--", file], {
      cwd: rootDir,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    });
    if (diffRes.status !== 0 || !diffRes.stdout) continue;
    for (const line of diffRes.stdout.split(/\r?\n/)) {
      if (!line.startsWith("+") || line.startsWith("+++")) continue;
      for (const rule of FALLBACK_SECRET_RULES) {
        if (rule.regex.test(line)) {
          findings.push(`${normalized}: matched ${rule.name}`);
        }
      }
    }
  }
  return findings;
}

function main() {
  const stagedFiles = getStagedFiles();
  if (stagedFiles.length === 0) {
    process.exit(0);
  }

  const forbidden = checkForbiddenFilenames(stagedFiles);
  if (forbidden.length > 0) {
    console.error("\n[Anvil pre-commit] Commit blocked! Sensitive or local-only files are staged:");
    for (const file of forbidden) {
      console.error(`  - ${file}`);
    }
    console.error("Unstage them with: git rm --cached <file>\n");
    process.exit(1);
  }

  const configPath = path.join(rootDir, ".gitleaks.toml");
  const mode = detectGitleaksMode();

  if (mode) {
    const args =
      mode === "git"
        ? ["git", "--pre-commit", "--staged", "--redact", "--no-banner", "--config", configPath]
        : ["protect", "--staged", "--redact", "--no-banner", "--config", configPath];

    const res = spawnSync("gitleaks", args, {
      cwd: rootDir,
      stdio: "inherit",
    });

    if (res.status !== 0) {
      console.error("\n[Anvil pre-commit] Commit blocked by gitleaks secret scan.");
      console.error("Remove the secret from staged changes before committing.\n");
      process.exit(res.status ?? 1);
    }
    process.exit(0);
  }

  console.warn(
    "[Anvil pre-commit] Warning: 'gitleaks' CLI not found on PATH. Running built-in secret fallback scan."
  );
  console.warn(
    "Install gitleaks for full protection: macOS 'brew install gitleaks' | Windows 'winget install Gitleaks.Gitleaks' | Linux: https://github.com/gitleaks/gitleaks/releases\n"
  );

  const fallbackFindings = runFallbackRegexScan(stagedFiles);
  if (fallbackFindings.length > 0) {
    console.error("[Anvil pre-commit] Commit blocked by built-in secret scanner:");
    for (const item of fallbackFindings) {
      console.error(`  - ${item}`);
    }
    process.exit(1);
  }

  if (!fs.existsSync(configPath)) {
    console.warn("[Anvil pre-commit] Note: .gitleaks.toml was not found at repository root.");
  }
}

main();
