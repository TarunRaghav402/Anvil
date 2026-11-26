import type { ProjectRole } from "../../../appConfig";

export interface AnvilUser {
  id: string;
  username: string;
  usernameLower: string;
  email: string;
  planTier: string;
  createdAt: string;
}

export interface AnvilProject {
  id: string;
  ownerId: string;
  name: string;
  githubOriginUrl: string | null;
  defaultBranch: string;
  entryFile: string;
  updatedAt: string;
  permanent?: boolean;
  owner?: { id: string; username: string; email?: string };
  activeSession?: AnvilSession | null;
}

export interface AnvilSession {
  id: string;
  projectId: string;
  hostId: string;
  sessionCode: string;
  status: "active" | "ended";
  isPersistent: boolean;
  createdAt: string;
  endedAt: string | null;
}

export interface AnvilProjectMember {
  projectId: string;
  userId: string;
  addedBy: string;
  permanent: boolean;
  createdAt: string;
  user?: { id: string; username: string; email: string; planTier?: string };
}

export interface AnvilSessionMember {
  sessionId: string;
  userId: string;
  role: ProjectRole;
  joinedAt: string;
  user?: { id: string; username: string; email: string };
}

export interface AnvilProjectNode {
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
  relativePath: string;
  nodeType: "folder" | "text_file" | "binary_asset";
  storagePath: string | null;
  mimeType: string;
  updatedAt: string;
}

export interface OnlinePresenceEntry {
  userId: string;
  username: string;
  role: ProjectRole;
  activeNodeId: string | null;
  activeFilePath: string | null;
  color: string;
}

export interface AnvilComment {
  id: string;
  projectId: string;
  nodeId: string;
  authorId: string;
  parentCommentId: string | null;
  lineNumber: number | null;
  body: string;
  resolved: boolean;
  createdAt: string;
  nodePath?: string;
  author?: { id: string; username: string };
  node?: { id: string; name: string; nodeType: string; parentId: string | null };
}

export interface GitLogEntry {
  id: string;
  timestamp: string;
  stream: "stdout" | "stderr" | "info" | "error";
  line: string;
}

export interface ProblemEntry {
  nodeId: string;
  filePath: string;
  line: number;
  column: number;
  severity: "error" | "warning" | "info";
  message: string;
  source?: string;
}
