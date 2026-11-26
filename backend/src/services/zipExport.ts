import archiver from "archiver";
import type { Response } from "express";
import type { DbProject, DbProjectNode } from "./db.js";
import { buildNodePathMap } from "./projectTree.js";
import { downloadAssetBuffer } from "./storageService.js";

export interface LiveContentResolver {
  getLiveText(projectId: string, nodeId: string, fallback: string | null): string;
}

function sanitizeZipFilename(name: string): string {
  const clean = name
    .normalize("NFC")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean || "anvil-project";
}

export async function streamProjectZip(
  project: DbProject,
  nodes: DbProjectNode[],
  res: Response,
  liveContent: LiveContentResolver
): Promise<void> {
  const pathMap = buildNodePathMap(nodes);
  const folderHasChildren = new Set<string>();
  for (const n of nodes) {
    if (n.parentId) {
      folderHasChildren.add(n.parentId);
    }
  }

  const safeZipName = sanitizeZipFilename(project.name);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${safeZipName}.zip"`);
  res.setHeader("Cache-Control", "no-store");

  const archive = archiver("zip", { zlib: { level: 6 } });

  archive.on("error", (err) => {
    if (!res.headersSent) {
      res.status(500).json({ error: `Failed to generate zip archive: ${err.message}` });
    } else {
      res.end();
    }
  });

  archive.pipe(res);

  // Sort deterministically by POSIX path
  const sorted = [...nodes].sort((a, b) => {
    const pa = pathMap.get(a.id) ?? a.name;
    const pb = pathMap.get(b.id) ?? b.name;
    return pa.localeCompare(pb);
  });

  for (const node of sorted) {
    const relPath = pathMap.get(node.id);
    if (!relPath) continue;

    if (node.nodeType === "folder") {
      if (!folderHasChildren.has(node.id)) {
        // Explicit empty directory entry with forward slash
        archive.append(Buffer.alloc(0), { name: `${relPath}/` });
      }
      continue;
    }

    if (node.nodeType === "text_file") {
      const content = liveContent.getLiveText(project.id, node.id, node.contentText);
      archive.append(Buffer.from(content, "utf8"), { name: relPath });
      continue;
    }

    if (node.nodeType === "binary_asset" && node.storagePath) {
      try {
        const buffer = await downloadAssetBuffer(node.storagePath);
        archive.append(buffer, { name: relPath });
      } catch (err) {
        console.warn(`[Anvil] Skipping missing storage asset ${node.storagePath}:`, err);
      }
    }
  }

  await archive.finalize();
}
