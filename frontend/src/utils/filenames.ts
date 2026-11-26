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

export function normalizeNodeName(rawName: string): string {
  return rawName.normalize("NFC");
}

export function validateNodeNameClient(rawName: string): { valid: boolean; normalized: string; error?: string } {
  const normalized = normalizeNodeName(rawName);
  if (!normalized) {
    return { valid: false, normalized, error: "Name cannot be empty." };
  }
  if (normalized.length > 200) {
    return { valid: false, normalized, error: "Name must be 200 characters or fewer." };
  }
  if (normalized === "." || normalized === "..") {
    return { valid: false, normalized, error: "'.' and '..' are not allowed." };
  }
  if (normalized.startsWith(" ") || normalized.endsWith(" ")) {
    return { valid: false, normalized, error: "Name cannot start or end with a space." };
  }
  if (normalized.endsWith(".")) {
    return { valid: false, normalized, error: "Name cannot end with a dot (Windows incompatible)." };
  }
  if (FORBIDDEN_CHARS_REGEX.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Name contains forbidden characters (< > : " / \\ | ? *).',
    };
  }
  const baseName = normalized.split(".")[0]?.toUpperCase() ?? "";
  if (WINDOWS_RESERVED_BASENAMES.has(baseName)) {
    return {
      valid: false,
      normalized,
      error: `Name "${normalized}" uses a Windows-reserved device name.`,
    };
  }
  return { valid: true, normalized };
}
