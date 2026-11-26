import path from "path";
import mime from "mime-types";

export const BINARY_ASSET_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".ico",
  ".wav",
  ".mp3",
  ".ogg",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
]);

export const DISALLOWED_BINARY_EXTENSIONS = new Set([
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".com",
  ".msi",
  ".dmg",
  ".iso",
  ".app",
  ".zip",
  ".tar",
  ".gz",
  ".tgz",
  ".bz2",
  ".xz",
  ".7z",
  ".rar",
  ".pdf",
  ".class",
  ".jar",
  ".war",
  ".pyc",
  ".pyo",
  ".o",
  ".a",
  ".lib",
  ".obj",
  ".wasm",
  ".mp4",
  ".mov",
  ".avi",
  ".mkv",
  ".webm",
  ".sqlite",
  ".db",
]);

export const TEXT_EXTENSIONS = new Set([
  // Web & markup
  ".html",
  ".htm",
  ".xhtml",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".styl",
  ".vue",
  ".svelte",
  ".astro",
  ".pug",
  ".jade",
  ".hbs",
  ".handlebars",
  ".twig",
  ".liquid",
  ".razor",
  ".cshtml",
  // JS / TS
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".ts",
  ".mts",
  ".cts",
  ".tsx",
  ".coffee",
  ".tsp",
  // Data / Docs / Config
  ".json",
  ".jsonc",
  ".json5",
  ".md",
  ".mdx",
  ".markdown",
  ".rst",
  ".txt",
  ".log",
  ".xml",
  ".xsl",
  ".xslt",
  ".plist",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
  ".properties",
  ".env",
  ".example",
  ".csv",
  ".tsv",
  // Systems & compiled languages
  ".c",
  ".h",
  ".cc",
  ".cpp",
  ".cxx",
  ".hh",
  ".hpp",
  ".hxx",
  ".ino",
  ".m",
  ".mm",
  ".cs",
  ".csx",
  ".vb",
  ".vbs",
  ".fs",
  ".fsx",
  ".fsi",
  ".java",
  ".kt",
  ".kts",
  ".scala",
  ".sc",
  ".groovy",
  ".gradle",
  ".go",
  ".mod",
  ".sum",
  ".rs",
  ".zig",
  ".nim",
  ".odin",
  ".v",
  ".sv",
  ".svh",
  ".pas",
  ".pp",
  ".s",
  ".asm",
  // Dynamic, scripting & scientific languages
  ".py",
  ".pyw",
  ".pyi",
  ".pyx",
  ".rb",
  ".rake",
  ".gemspec",
  ".php",
  ".phtml",
  ".swift",
  ".dart",
  ".lua",
  ".gd",
  ".gdshader",
  ".hx",
  ".pl",
  ".pm",
  ".r",
  ".rmd",
  ".jl",
  ".ex",
  ".exs",
  ".erl",
  ".hrl",
  ".clj",
  ".cljs",
  ".cljc",
  ".edn",
  ".scm",
  ".ss",
  ".rkt",
  ".hs",
  ".lhs",
  ".tcl",
  ".qs",
  ".sol",
  ".cls",
  ".abap",
  // Shell & DevOps
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".ksh",
  ".ps1",
  ".psm1",
  ".psd1",
  ".bat",
  ".cmd",
  ".dockerfile",
  ".tf",
  ".tfvars",
  ".hcl",
  ".bicep",
  ".nix",
  // Databases, schemas & shaders
  ".sql",
  ".pgsql",
  ".mysql",
  ".cyp",
  ".cypher",
  ".graphql",
  ".gql",
  ".proto",
  ".rq",
  ".sparql",
  ".glsl",
  ".vert",
  ".frag",
  ".comp",
  ".geom",
  ".tesc",
  ".tese",
  ".hlsl",
  ".wgsl",
  // Dotfiles
  ".gitattributes",
  ".gitignore",
  ".dockerignore",
  ".editorconfig",
  ".npmrc",
  ".nvmrc",
  ".prettierrc",
  ".prettierignore",
]);

export const EXTENSIONLESS_TEXT_FILENAMES = new Set([
  "dockerfile",
  "makefile",
  "gnumakefile",
  "cmakelists.txt",
  "procfile",
  "jenkinsfile",
  "vagrantfile",
  "gemfile",
  "rakefile",
  "podfile",
  "readme",
  "license",
  "changelog",
  "authors",
  "contributors",
  ".gitignore",
  ".gitattributes",
  ".dockerignore",
  ".editorconfig",
  ".npmrc",
  ".nvmrc",
  ".prettierrc",
  ".prettierignore",
]);

const CUSTOM_MIME_MAP: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".cjs": "application/javascript",
  ".ts": "application/typescript",
  ".tsx": "application/typescript",
  ".jsx": "application/javascript",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".py": "text/x-python",
  ".java": "text/x-java-source",
  ".c": "text/x-csrc",
  ".h": "text/x-chdr",
  ".cpp": "text/x-c++src",
  ".cc": "text/x-c++src",
  ".hpp": "text/x-c++hdr",
  ".cs": "text/x-csharp",
  ".go": "text/x-go",
  ".rs": "text/x-rustsrc",
  ".rb": "text/x-ruby",
  ".php": "text/x-php",
  ".swift": "text/x-swift",
  ".kt": "text/x-kotlin",
  ".sh": "text/x-shellscript",
  ".sql": "application/sql",
  ".yaml": "application/yaml",
  ".yml": "application/yaml",
  ".toml": "application/toml",
};

export function getLowerExtension(filename: string): string {
  const base = path.posix.basename(filename);
  const idx = base.lastIndexOf(".");
  return idx >= 0 ? base.slice(idx).toLowerCase() : "";
}

export function isValidUtf8TextBuffer(buffer: Buffer): boolean {
  if (buffer.includes(0)) {
    return false;
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

export function classifyUploadedFile(
  filename: string,
  buffer?: Buffer
): { allowed: true; kind: "binary_asset" | "text_file" } | { allowed: false; reason: string } {
  const baseLower = path.posix.basename(filename).toLowerCase();
  const ext = getLowerExtension(filename);

  if (BINARY_ASSET_EXTENSIONS.has(ext)) {
    return { allowed: true, kind: "binary_asset" };
  }
  if (DISALLOWED_BINARY_EXTENSIONS.has(ext)) {
    return {
      allowed: false,
      reason: `Unsupported binary or archive extension "${ext}". Upload media/font assets or UTF-8 source code files.`,
    };
  }
  if (TEXT_EXTENSIONS.has(ext) || EXTENSIONLESS_TEXT_FILENAMES.has(baseLower)) {
    return { allowed: true, kind: "text_file" };
  }

  // Allow any other programming language, config, or script file if it is valid UTF-8 text
  if (buffer && isValidUtf8TextBuffer(buffer)) {
    return { allowed: true, kind: "text_file" };
  }

  return {
    allowed: false,
    reason: `Unsupported file type "${ext || filename}". Allowed: source code in any programming language and supported media/font assets.`,
  };
}

export function resolveMimeType(filename: string, providedMime?: string): string {
  const ext = getLowerExtension(filename);
  if (CUSTOM_MIME_MAP[ext]) {
    return CUSTOM_MIME_MAP[ext]!;
  }
  const lookedUp = mime.lookup(filename);
  if (typeof lookedUp === "string") return lookedUp;
  if (providedMime && providedMime !== "application/octet-stream") return providedMime;
  return "text/plain";
}
