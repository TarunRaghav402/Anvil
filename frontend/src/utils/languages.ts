/**
 * Maps filenames and extensions to Monaco Editor language IDs and readable display labels
 * across all languages bundled with monaco-editor.
 */

const EXACT_FILENAME_LANGUAGES: Record<string, string> = {
  dockerfile: "dockerfile",
  makefile: "shell",
  gnumakefile: "shell",
  procfile: "yaml",
  gemfile: "ruby",
  rakefile: "ruby",
  podfile: "ruby",
  vagrantfile: "ruby",
  ".gitignore": "ini",
  ".gitattributes": "ini",
  ".dockerignore": "ini",
  ".editorconfig": "ini",
  ".npmrc": "ini",
  ".env": "ini",
  ".env.example": "ini",
  ".prettierrc": "json",
  ".eslintrc": "json",
  "go.mod": "go",
  "go.sum": "plaintext",
  "cargo.toml": "ini",
  "cargo.lock": "ini",
  "requirements.txt": "plaintext",
};

const EXTENSION_LANGUAGES: Record<string, string> = {
  // Web & markup
  ".html": "html",
  ".htm": "html",
  ".xhtml": "html",
  ".vue": "html",
  ".svelte": "html",
  ".astro": "html",
  ".css": "css",
  ".scss": "scss",
  ".sass": "scss",
  ".less": "less",
  ".pug": "pug",
  ".jade": "pug",
  ".hbs": "handlebars",
  ".handlebars": "handlebars",
  ".twig": "twig",
  ".liquid": "liquid",
  ".razor": "razor",
  ".cshtml": "razor",
  ".xml": "xml",
  ".svg": "xml",
  ".xsl": "xml",
  ".xslt": "xml",
  ".plist": "xml",
  ".md": "markdown",
  ".markdown": "markdown",
  ".mdx": "mdx",
  ".rst": "restructuredtext",

  // JavaScript / TypeScript
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".jsx": "javascript",
  ".ts": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".tsx": "typescript",
  ".coffee": "coffee",
  ".tsp": "typespec",

  // JSON / Config
  ".json": "json",
  ".jsonc": "json",
  ".json5": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "ini",
  ".ini": "ini",
  ".cfg": "ini",
  ".conf": "ini",
  ".properties": "ini",

  // Systems & compiled languages
  ".c": "cpp",
  ".h": "cpp",
  ".cc": "cpp",
  ".cpp": "cpp",
  ".cxx": "cpp",
  ".hh": "cpp",
  ".hpp": "cpp",
  ".hxx": "cpp",
  ".ino": "cpp",
  ".m": "objective-c",
  ".mm": "objective-c",
  ".cs": "csharp",
  ".csx": "csharp",
  ".vb": "vb",
  ".vbs": "vb",
  ".fs": "fsharp",
  ".fsx": "fsharp",
  ".fsi": "fsharp",
  ".java": "java",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".scala": "scala",
  ".sc": "scala",
  ".go": "go",
  ".rs": "rust",
  ".pas": "pascal",
  ".pp": "pascal",
  ".sv": "systemverilog",
  ".svh": "systemverilog",
  ".s": "mips",
  ".asm": "mips",

  // Dynamic, scripting & scientific
  ".py": "python",
  ".pyw": "python",
  ".pyi": "python",
  ".rb": "ruby",
  ".rake": "ruby",
  ".gemspec": "ruby",
  ".php": "php",
  ".phtml": "php",
  ".swift": "swift",
  ".dart": "dart",
  ".lua": "lua",
  ".gd": "python",
  ".pl": "perl",
  ".pm": "perl",
  ".r": "r",
  ".rmd": "r",
  ".jl": "julia",
  ".ex": "elixir",
  ".exs": "elixir",
  ".clj": "clojure",
  ".cljs": "clojure",
  ".cljc": "clojure",
  ".edn": "clojure",
  ".scm": "scheme",
  ".ss": "scheme",
  ".rkt": "scheme",
  ".tcl": "tcl",
  ".qs": "qsharp",
  ".sol": "solidity",
  ".cls": "apex",
  ".abap": "abap",

  // Shell & DevOps
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".fish": "shell",
  ".ksh": "shell",
  ".ps1": "powershell",
  ".psm1": "powershell",
  ".psd1": "powershell",
  ".bat": "bat",
  ".cmd": "bat",
  ".dockerfile": "dockerfile",
  ".tf": "hcl",
  ".tfvars": "hcl",
  ".hcl": "hcl",
  ".bicep": "bicep",
  ".azcli": "azcli",

  // Queries, schemas & shaders
  ".sql": "sql",
  ".pgsql": "pgsql",
  ".mysql": "mysql",
  ".cyp": "cypher",
  ".cypher": "cypher",
  ".graphql": "graphql",
  ".gql": "graphql",
  ".proto": "protobuf",
  ".rq": "sparql",
  ".sparql": "sparql",
  ".wgsl": "wgsl",
  ".glsl": "cpp",
  ".vert": "cpp",
  ".frag": "cpp",
  ".comp": "cpp",
  ".hlsl": "cpp",
};

const DISPLAY_NAMES: Record<string, string> = {
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  less: "Less",
  javascript: "JavaScript",
  typescript: "TypeScript",
  json: "JSON",
  markdown: "Markdown",
  mdx: "MDX",
  xml: "XML",
  yaml: "YAML",
  python: "Python",
  java: "Java",
  cpp: "C / C++",
  csharp: "C#",
  go: "Go",
  rust: "Rust",
  ruby: "Ruby",
  php: "PHP",
  swift: "Swift",
  kotlin: "Kotlin",
  dart: "Dart",
  scala: "Scala",
  lua: "Lua",
  perl: "Perl",
  r: "R",
  julia: "Julia",
  elixir: "Elixir",
  clojure: "Clojure",
  scheme: "Scheme",
  fsharp: "F#",
  "objective-c": "Objective-C",
  shell: "Shell",
  powershell: "PowerShell",
  bat: "Batch",
  dockerfile: "Dockerfile",
  hcl: "HCL / Terraform",
  bicep: "Bicep",
  ini: "Config / TOML",
  sql: "SQL",
  pgsql: "PostgreSQL",
  mysql: "MySQL",
  graphql: "GraphQL",
  protobuf: "Protobuf",
  solidity: "Solidity",
  wgsl: "WGSL",
  plaintext: "Plain Text",
};

export function detectMonacoLanguage(filename: string): string {
  const base = filename.split("/").pop()?.toLowerCase() ?? "";
  if (EXACT_FILENAME_LANGUAGES[base]) {
    return EXACT_FILENAME_LANGUAGES[base]!;
  }
  const dotIdx = base.lastIndexOf(".");
  if (dotIdx >= 0) {
    const ext = base.slice(dotIdx);
    if (EXTENSION_LANGUAGES[ext]) {
      return EXTENSION_LANGUAGES[ext]!;
    }
  }
  if (base.endsWith(".dockerfile")) return "dockerfile";
  return "plaintext";
}

export function formatLanguageLabel(languageId: string, filename: string): string {
  const base = filename.toLowerCase();
  if (base.endsWith(".c")) return "C";
  if (base.endsWith(".h")) return "C / Header";
  if (base.endsWith(".cpp") || base.endsWith(".cc") || base.endsWith(".cxx") || base.endsWith(".hpp")) {
    return "C++";
  }
  if (base.endsWith(".tsx")) return "TypeScript React";
  if (base.endsWith(".jsx")) return "JavaScript React";
  if (base.endsWith(".toml")) return "TOML";
  if (base.endsWith(".gd")) return "GDScript";
  if (base.endsWith(".vue")) return "Vue";
  if (base.endsWith(".svelte")) return "Svelte";
  return DISPLAY_NAMES[languageId] ?? languageId;
}
