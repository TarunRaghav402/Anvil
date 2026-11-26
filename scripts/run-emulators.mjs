#!/usr/bin/env node
/**
 * Cross-platform Firebase Local Emulator runner.
 * Resolves the emulator project ID from .env (FIREBASE_PROJECT_ID),
 * then .firebaserc (projects.default), falling back to "demo-anvil".
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function parseJavaMajor(javaBin) {
  const res = spawnSync(javaBin, ["-version"], { encoding: "utf8" });
  const combined = `${res.stdout ?? ""}\n${res.stderr ?? ""}`;
  const match = /version\s+"(\d+)/.exec(combined);
  return match ? Number(match[1]) : 0;
}

function buildEmulatorEnv() {
  const env = { ...process.env };
  if (parseJavaMajor("java") >= 21) return env;

  const candidates = [
    "/opt/homebrew/opt/openjdk@21",
    "/usr/local/opt/openjdk@21",
    "/opt/homebrew/opt/openjdk",
    "/usr/local/opt/openjdk",
  ];
  for (const home of candidates) {
    const javaBin = path.join(home, "bin", "java");
    if (fs.existsSync(javaBin) && parseJavaMajor(javaBin) >= 21) {
      env.JAVA_HOME = home;
      env.PATH = `${path.join(home, "bin")}${path.delimiter}${env.PATH || ""}`;
      return env;
    }
  }
  return env;
}

function readDotEnvKey(envFilePath, key) {
  if (!fs.existsSync(envFilePath)) return undefined;
  const lines = fs.readFileSync(envFilePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const k = trimmed.slice(0, eqIdx).trim();
    if (k !== key) continue;
    let v = trimmed.slice(eqIdx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    return v;
  }
  return undefined;
}

function resolveProjectId() {
  const fromEnv =
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    readDotEnvKey(path.join(rootDir, ".env"), "FIREBASE_PROJECT_ID")?.trim();
  if (fromEnv && !fromEnv.includes("your-firebase-project-id")) {
    return fromEnv;
  }

  const rcPath = path.join(rootDir, ".firebaserc");
  if (fs.existsSync(rcPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(rcPath, "utf8"));
      const rcProject = parsed?.projects?.default?.trim();
      if (rcProject && !rcProject.includes("your-firebase-project-id")) {
        return rcProject;
      }
    } catch {
      // Ignore malformed .firebaserc and fall back to demo-anvil
    }
  }

  return "demo-anvil";
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/run-emulators.mjs <start|exec> [firebase args...]");
  process.exit(1);
}

const [subcommand, ...restArgs] = args;
const firebaseCmd = subcommand === "exec" ? "emulators:exec" : "emulators:start";
const projectId = resolveProjectId();

if (!/^[a-z0-9-]+$/i.test(projectId)) {
  console.error(`[Anvil] Invalid Firebase project ID "${projectId}".`);
  process.exit(1);
}

const require = createRequire(import.meta.url);
const firebasePkgPath = require.resolve("firebase-tools/package.json", { paths: [rootDir] });
const firebaseBin = path.join(path.dirname(firebasePkgPath), "lib", "bin", "firebase.js");

const child = spawn(
  process.execPath,
  [firebaseBin, firebaseCmd, "--project", projectId, ...restArgs],
  {
    cwd: rootDir,
    stdio: "inherit",
    env: buildEmulatorEnv(),
  }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
