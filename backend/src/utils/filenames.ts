/**
 * Cross-OS filename and path validation rules for Windows, macOS, and Linux.
 * - Normalizes Unicode names to NFC (prevents macOS NFD duplicate-looking files)
 * - Rejects Windows reserved names (CON, PRN, AUX, NUL, COM1-9, LPT1-9) even with extensions
 * - Rejects illegal characters (< > : " / \ | ? * and control chars)
 * - Rejects trailing dots/spaces and leading spaces
 * - Prevents path traversal (.., absolute paths, null bytes)
 * - Generates case-insensitive sibling keys so Windows/macOS/Linux behave identically
 */

const WINDOWS_RESERVED_BASENAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
]);

const FORBIDDEN_CHARS_REGEX = /[<>:"/\\|?*\x00-\x1f]/;

export interface NameValidationResult {
  valid: boolean;
  normalized: string;
  error?: string;
}

export function normalizeNodeName(rawName: string): string {
  return rawName.normalize("NFC");
}

export function validateNodeName(rawName: string): NameValidationResult {
  if (typeof rawName !== "string") {
    return { valid: false, normalized: "", error: "File name must be a string." };
  }

  const normalized = normalizeNodeName(rawName);

  if (normalized.length === 0) {
    return { valid: false, normalized, error: "Name cannot be empty." };
  }
  if (normalized.length > 200) {
    return { valid: false, normalized, error: "Name must be 200 characters or fewer." };
  }
  if (normalized === "." || normalized === "..") {
    return { valid: false, normalized, error: "Relative path segments '.' and '..' are not allowed." };
  }
  if (normalized.startsWith(" ") || normalized.endsWith(" ")) {
    return { valid: false, normalized, error: "Name cannot start or end with a space." };
  }
  if (normalized.endsWith(".")) {
    return { valid: false, normalized, error: "Name cannot end with a dot (incompatible with Windows)." };
  }
  if (FORBIDDEN_CHARS_REGEX.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Name contains forbidden characters (< > : " / \\ | ? * or control characters).',
    };
  }

  const baseName = normalized.split(".")[0]?.toUpperCase() ?? "";
  if (WINDOWS_RESERVED_BASENAMES.has(baseName)) {
    return {
      valid: false,
      normalized,
      error: `Name "${normalized}" uses a Windows-reserved device name (${baseName}).`,
    };
  }

  return { valid: true, normalized };
}

export function buildUniqueSiblingKey(
  projectId: string,
  parentId: string | null | undefined,
  name: string
): string {
  const normalized = normalizeNodeName(name).toLowerCase();
  return `${projectId}:${parentId || "ROOT"}:${normalized}`;
}

/**
 * Normalizes a relative POSIX path inside a project and rejects any traversal or absolute path.
 */
export function sanitizeProjectRelativePath(rawPath: string): string {
  if (typeof rawPath !== "string" || rawPath.includes("\0")) {
    throw new Error("Invalid file path.");
  }

  const normalizedSlashes = rawPath.replace(/\\/g, "/").replace(/^\/+/, "").normalize("NFC");
  if (!normalizedSlashes) {
    throw new Error("Empty file path.");
  }

  const segments = normalizedSlashes.split("/").filter((s) => s.length > 0 && s !== ".");
  if (segments.length === 0) {
    throw new Error("Empty file path.");
  }

  for (const seg of segments) {
    if (seg === "..") {
      throw new Error("Path traversal ('..') is forbidden.");
    }
    const check = validateNodeName(seg);
    if (!check.valid) {
      throw new Error(check.error || `Invalid path segment: ${seg}`);
    }
  }

  return segments.join("/");
}
