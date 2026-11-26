import { db, type DbProjectNode } from "./db.js";
import { buildUniqueSiblingKey, normalizeNodeName, validateNodeName } from "../utils/filenames.js";
import { deleteAssetFile } from "./storageService.js";

export interface TreeNodeWithPath extends DbProjectNode {
  relativePath: string;
}

export function buildNodePathMap(nodes: DbProjectNode[]): Map<string, string> {
  const byId = new Map<string, DbProjectNode>();
  for (const node of nodes) {
    byId.set(node.id, node);
  }

  const cache = new Map<string, string>();

  function resolvePath(nodeId: string, seen = new Set<string>()): string {
    const existing = cache.get(nodeId);
    if (existing !== undefined) return existing;

    const node = byId.get(nodeId);
    if (!node) return "";
    if (seen.has(nodeId)) {
      throw new Error(`Cycle detected in project tree at node ${nodeId}`);
    }
    seen.add(nodeId);

    const safeName = normalizeNodeName(node.name);
    if (!node.parentId) {
      cache.set(nodeId, safeName);
      return safeName;
    }

    const parentPath = resolvePath(node.parentId, seen);
    const full = parentPath ? `${parentPath}/${safeName}` : safeName;
    cache.set(nodeId, full);
    return full;
  }

  for (const node of nodes) {
    resolvePath(node.id);
  }

  return cache;
}

export function attachRelativePaths(nodes: DbProjectNode[]): TreeNodeWithPath[] {
  const pathMap = buildNodePathMap(nodes);
  return nodes.map((node) => ({
    ...node,
    relativePath: pathMap.get(node.id) ?? normalizeNodeName(node.name),
  }));
}

export function assertValidAndUniqueSiblingName(
  nodes: DbProjectNode[],
  projectId: string,
  parentId: string | null,
  rawName: string,
  excludeNodeId?: string
): { valid: true; normalizedName: string; uniqueSiblingKey: string } | { valid: false; error: string; statusCode: number } {
  const nameCheck = validateNodeName(rawName);
  if (!nameCheck.valid) {
    return { valid: false, error: nameCheck.error || "Invalid file name.", statusCode: 400 };
  }

  const normalizedName = nameCheck.normalized;
  const candidateLower = normalizedName.toLowerCase();

  for (const node of nodes) {
    if (excludeNodeId && node.id === excludeNodeId) continue;
    const nodeParent = node.parentId ?? null;
    if (nodeParent === (parentId ?? null) && normalizeNodeName(node.name).toLowerCase() === candidateLower) {
      return {
        valid: false,
        error: `A file or folder named "${node.name}" already exists in this directory (case-insensitive names are enforced for Windows/macOS/Linux compatibility).`,
        statusCode: 409,
      };
    }
  }

  return {
    valid: true,
    normalizedName,
    uniqueSiblingKey: buildUniqueSiblingKey(projectId, parentId, normalizedName),
  };
}

export function isDescendantNode(
  nodes: DbProjectNode[],
  candidateParentId: string,
  movingNodeId: string
): boolean {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let currentId: string | null = candidateParentId;
  const visited = new Set<string>();
  while (currentId) {
    if (currentId === movingNodeId) return true;
    if (visited.has(currentId)) break;
    visited.add(currentId);
    currentId = byId.get(currentId)?.parentId ?? null;
  }
  return false;
}

/**
 * Returns nodes in bottom-up (children before parents) order for safe deletion.
 */
export function collectSubtreeBottomUp(nodes: DbProjectNode[], rootId: string): DbProjectNode[] {
  const childrenByParent = new Map<string, DbProjectNode[]>();
  const byId = new Map<string, DbProjectNode>();

  for (const n of nodes) {
    byId.set(n.id, n);
    if (n.parentId) {
      const list = childrenByParent.get(n.parentId) ?? [];
      list.push(n);
      childrenByParent.set(n.parentId, list);
    }
  }

  const root = byId.get(rootId);
  if (!root) return [];

  const result: DbProjectNode[] = [];
  function visit(node: DbProjectNode) {
    const children = childrenByParent.get(node.id) ?? [];
    for (const child of children) {
      visit(child);
    }
    result.push(node);
  }
  visit(root);
  return result;
}

export async function deleteSubtreeFromProject(
  nodes: DbProjectNode[],
  rootId: string,
  onBeforeDeleteFile?: (node: DbProjectNode) => Promise<void> | void
): Promise<DbProjectNode[]> {
  const targets = collectSubtreeBottomUp(nodes, rootId);
  const allComments = targets.length > 0 ? await db.listProjectComments(targets[0]!.projectId) : [];
  const targetIds = new Set(targets.map((t) => t.id));

  // Delete comments on deleted nodes (replies before parent comments)
  const commentsToDelete = allComments.filter((c) => targetIds.has(c.nodeId));
  const childComments = commentsToDelete.filter((c) => c.parentCommentId !== null);
  const rootComments = commentsToDelete.filter((c) => c.parentCommentId === null);

  for (const c of childComments) {
    await db.deleteComment(c.id).catch(() => undefined);
  }
  for (const c of rootComments) {
    await db.deleteComment(c.id).catch(() => undefined);
  }

  for (const node of targets) {
    if (onBeforeDeleteFile) {
      await onBeforeDeleteFile(node);
    }
    if (node.nodeType === "binary_asset" && node.storagePath) {
      await deleteAssetFile(node.storagePath).catch(() => undefined);
    }
    await db.deleteProjectNode(node.id);
  }

  return targets;
}
