import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findEnvFile(): string | undefined {
  const candidates = [process.cwd(), __dirname];
  for (const startDir of candidates) {
    let dir = path.resolve(startDir);
    for (let i = 0; i < 8; i++) {
      const envCandidate = path.join(dir, ".env");
      if (fs.existsSync(envCandidate)) {
        return envCandidate;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return undefined;
}

// Load root .env if present (fail-fast validation happens below)
const envFilePath = findEnvFile();
if (envFilePath) {
  dotenv.config({ path: envFilePath });
} else {
  dotenv.config();
}

const booleanStringSchema = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4001),
    FRONTEND_ORIGIN: z
      .string()
      .url("FRONTEND_ORIGIN must be a valid URL")
      .default("http://localhost:5173"),

    FIREBASE_PROJECT_ID: z.string().min(1, "FIREBASE_PROJECT_ID is required"),
    FIREBASE_STORAGE_BUCKET: z.string().min(1, "FIREBASE_STORAGE_BUCKET is required"),
    USE_FIREBASE_EMULATORS: booleanStringSchema,

    FIREBASE_AUTH_EMULATOR_HOST: z.string().optional(),
    FIREBASE_STORAGE_EMULATOR_HOST: z.string().optional(),
    DATA_CONNECT_EMULATOR_HOST: z.string().optional(),

    DATA_CONNECT_SERVICE_ID: z.string().min(1).default("anvil-dataconnect"),
    DATA_CONNECT_LOCATION: z.string().min(1).default("us-central1"),
    DATA_CONNECT_CONNECTOR: z.string().min(1).default("anvil-connector"),

    GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
    FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),

    SESSION_HOST_GRACE_MS: z.coerce.number().int().min(1000).max(600_000).default(30_000),
    ENABLE_PAID_TIERS: booleanStringSchema,
    ADMIN_EMAILS: z
      .string()
      .optional()
      .transform((val) =>
        (val ?? "")
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
      ),

    YJS_SAVE_DEBOUNCE_MS: z.coerce.number().int().min(250).max(30_000).default(2000),
    PREVIEW_TOKEN_SECRET: z.string().min(16, "PREVIEW_TOKEN_SECRET must be at least 16 characters"),
    MAX_UPLOAD_SIZE_MB: z.coerce.number().min(1).max(100).default(15),
    GIT_TIMEOUT_MS: z.coerce.number().int().min(5000).max(300_000).default(60_000),

    FIREBASE_WEB_API_KEY: z.string().optional(),
    VITE_FIREBASE_API_KEY: z.string().optional(),

    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: booleanStringSchema,
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.USE_FIREBASE_EMULATORS) {
      if (!val.FIREBASE_AUTH_EMULATOR_HOST) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["FIREBASE_AUTH_EMULATOR_HOST"],
          message: "FIREBASE_AUTH_EMULATOR_HOST is required when USE_FIREBASE_EMULATORS=true",
        });
      }
      if (!val.FIREBASE_STORAGE_EMULATOR_HOST) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["FIREBASE_STORAGE_EMULATOR_HOST"],
          message: "FIREBASE_STORAGE_EMULATOR_HOST is required when USE_FIREBASE_EMULATORS=true",
        });
      }
      if (!val.DATA_CONNECT_EMULATOR_HOST) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["DATA_CONNECT_EMULATOR_HOST"],
          message: "DATA_CONNECT_EMULATOR_HOST is required when USE_FIREBASE_EMULATORS=true",
        });
      }
    }
    if (val.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()) {
      try {
        JSON.parse(val.FIREBASE_SERVICE_ACCOUNT_JSON);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["FIREBASE_SERVICE_ACCOUNT_JSON"],
          message: "FIREBASE_SERVICE_ACCOUNT_JSON must be valid JSON.",
        });
      }
    }
    if (val.NODE_ENV === "production") {
      if (
        val.PREVIEW_TOKEN_SECRET.includes("change-in-production") ||
        val.PREVIEW_TOKEN_SECRET.startsWith("replace-with-")
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["PREVIEW_TOKEN_SECRET"],
          message: "PREVIEW_TOKEN_SECRET must be rotated for production",
        });
      }
      if (val.FIREBASE_PROJECT_ID.includes("your-firebase-project-id")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["FIREBASE_PROJECT_ID"],
          message: "FIREBASE_PROJECT_ID must be set to your real Firebase project ID in production",
        });
      }
      if (val.FIREBASE_STORAGE_BUCKET.includes("your-firebase-project-id")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["FIREBASE_STORAGE_BUCKET"],
          message:
            "FIREBASE_STORAGE_BUCKET must be set to your real Firebase Storage bucket in production",
        });
      }
    }
  });

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "env"}: ${issue.message}`)
    .join("\n");
  console.error(`\n[Anvil] Environment validation failed:\n${details}\n`);
  console.error(`Copy .env.example to .env at the repository root and verify values.\n`);
  process.exit(1);
}

export const env = parsed.data;

// Ensure Auth & Storage Admin SDKs use emulators only when USE_FIREBASE_EMULATORS=true,
// while allowing local Data Connect emulator usage in non-production hybrid setups
// (Cloud Auth/Storage + local Data Connect emulator on DATA_CONNECT_EMULATOR_HOST).
if (env.USE_FIREBASE_EMULATORS) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = env.FIREBASE_AUTH_EMULATOR_HOST;
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = env.FIREBASE_STORAGE_EMULATOR_HOST;
  process.env.DATA_CONNECT_EMULATOR_HOST = env.DATA_CONNECT_EMULATOR_HOST;
} else {
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
  delete process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  if (env.NODE_ENV !== "production" && env.DATA_CONNECT_EMULATOR_HOST?.trim()) {
    process.env.DATA_CONNECT_EMULATOR_HOST = env.DATA_CONNECT_EMULATOR_HOST.trim();
  } else {
    delete process.env.DATA_CONNECT_EMULATOR_HOST;
  }
}

if (!env.GOOGLE_APPLICATION_CREDENTIALS) {
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
}
