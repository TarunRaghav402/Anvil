import crypto from "crypto";
import { env } from "../config/env.js";
import { dataConnect } from "../config/firebase.js";
import { buildUniqueSiblingKey, normalizeNodeName } from "../utils/filenames.js";
import type { ProjectRole } from "../../../appConfig.js";

/**
 * Generates a 32-char lowercase hex UUID matching Firebase Data Connect's canonical UUID return format.
 */
export function newUuid(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export function sameUuid(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.replace(/-/g, "").toLowerCase() === b.replace(/-/g, "").toLowerCase();
}

export interface DbUser {
  id: string;
  username: string;
  usernameLower: string;
  email: string;
  planTier: string;
  createdAt: string;
}

export interface DbProject {
  id: string;
  ownerId: string;
  name: string;
  githubOriginUrl: string | null;
  defaultBranch: string;
  entryFile: string;
  updatedAt: string;
  owner?: { id: string; username: string; email?: string };
}

export interface DbProjectMember {
  projectId: string;
  userId: string;
  addedBy: string;
  permanent: boolean;
  createdAt: string;
  user?: { id: string; username: string; email: string; planTier?: string };
}

export interface DbProjectNode {
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
  uniqueSiblingKey: string;
  nodeType: "folder" | "text_file" | "binary_asset";
  contentText: string | null;
  storagePath: string | null;
  mimeType: string;
  updatedAt: string;
}

export interface DbSession {
  id: string;
  projectId: string;
  hostId: string;
  sessionCode: string;
  status: "active" | "ended";
  isPersistent: boolean;
  createdAt: string;
  endedAt: string | null;
  project?: DbProject;
}

export interface DbSessionMember {
  sessionId: string;
  userId: string;
  role: ProjectRole;
  joinedAt: string;
  user?: { id: string; username: string; email: string };
}

export interface DbComment {
  id: string;
  projectId: string;
  nodeId: string;
  authorId: string;
  parentCommentId: string | null;
  lineNumber: number | null;
  body: string;
  resolved: boolean;
  createdAt: string;
  author?: { id: string; username: string };
  node?: { id: string; name: string; nodeType: string; parentId: string | null };
}

export class DbError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function execRead<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  try {
    const res = await dataConnect.executeGraphqlRead<T, Record<string, unknown>>(query, {
      variables,
    });
    return res.data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new DbError(msg);
  }
}

async function execWrite<T>(mutation: string, variables?: Record<string, unknown>): Promise<T> {
  try {
    const res = await dataConnect.executeGraphql<T, Record<string, unknown>>(mutation, {
      variables,
    });
    return res.data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/unique|duplicate|already exists|constraint/i.test(msg)) {
      throw new DbError(msg, 409);
    }
    throw new DbError(msg);
  }
}

export const db = {
  async getUserById(id: string): Promise<DbUser | null> {
    const data = await execRead<{ user: DbUser | null }>(
      `query GetUserById($id: String!) {
        user(id: $id) {
          id username usernameLower email planTier createdAt
        }
      }`,
      { id }
    );
    return data.user ?? null;
  },

  async getUserByUsername(username: string): Promise<DbUser | null> {
    const usernameLower = normalizeNodeName(username).trim().toLowerCase();
    const data = await execRead<{ users: DbUser[] }>(
      `query GetUserByUsernameLower($usernameLower: String!) {
        users(where: { usernameLower: { eq: $usernameLower } }, limit: 1) {
          id username usernameLower email planTier createdAt
        }
      }`,
      { usernameLower }
    );
    return data.users[0] ?? null;
  },

  async getUserByEmail(email: string): Promise<DbUser | null> {
    const data = await execRead<{ users: DbUser[] }>(
      `query GetUserByEmail($email: String!) {
        users(where: { email: { eq: $email } }, limit: 1) {
          id username usernameLower email planTier createdAt
        }
      }`,
      { email: email.trim().toLowerCase() }
    );
    return data.users[0] ?? null;
  },

  async createUser(input: {
    id: string;
    username: string;
    email: string;
    planTier?: string;
  }): Promise<void> {
    const cleanUsername = normalizeNodeName(input.username).trim();
    await execWrite(
      `mutation CreateUser($id: String!, $username: String!, $usernameLower: String!, $email: String!, $planTier: String!) {
        user_insert(data: {
          id: $id,
          username: $username,
          usernameLower: $usernameLower,
          email: $email,
          planTier: $planTier
        })
      }`,
      {
        id: input.id,
        username: cleanUsername,
        usernameLower: cleanUsername.toLowerCase(),
        email: input.email.trim().toLowerCase(),
        planTier: input.planTier ?? "free",
      }
    );
  },

  async getProjectById(id: string): Promise<DbProject | null> {
    const data = await execRead<{ project: DbProject | null }>(
      `query GetProjectById($id: UUID!) {
        project(id: $id) {
          id ownerId name githubOriginUrl defaultBranch entryFile updatedAt
          owner { id username email }
        }
      }`,
      { id }
    );
    return data.project ?? null;
  },

  async listProjectsForUser(userId: string): Promise<Array<DbProject & { permanent: boolean }>> {
    const data = await execRead<{
      projectMembers: Array<{ permanent: boolean; project: DbProject }>;
    }>(
      `query ListProjectsForUser($userId: String!) {
        projectMembers(where: { userId: { eq: $userId } }) {
          permanent
          project {
            id ownerId name githubOriginUrl defaultBranch entryFile updatedAt
            owner { id username }
          }
        }
      }`,
      { userId }
    );
    return data.projectMembers.map((pm) => ({
      ...pm.project,
      permanent: pm.permanent,
    }));
  },

  async createProject(input: {
    id: string;
    ownerId: string;
    name: string;
    defaultBranch?: string;
    entryFile?: string;
  }): Promise<void> {
    await execWrite(
      `mutation CreateProject($id: UUID!, $ownerId: String!, $name: String!, $defaultBranch: String!, $entryFile: String!) {
        project_insert(data: {
          id: $id,
          ownerId: $ownerId,
          name: $name,
          defaultBranch: $defaultBranch,
          entryFile: $entryFile
        })
      }`,
      {
        id: input.id,
        ownerId: input.ownerId,
        name: input.name,
        defaultBranch: input.defaultBranch ?? "main",
        entryFile: input.entryFile ?? "index.html",
      }
    );
  },

  async updateProjectSettings(
    id: string,
    patch: {
      name?: string;
      githubOriginUrl?: string | null;
      defaultBranch?: string;
      entryFile?: string;
    }
  ): Promise<void> {
    const dataFields: string[] = [`updatedAt: $updatedAt`];
    const vars: Record<string, unknown> = { id, updatedAt: new Date().toISOString() };
    const varDefs: string[] = ["$id: UUID!", "$updatedAt: Timestamp!"];

    if (patch.name !== undefined) {
      varDefs.push("$name: String!");
      dataFields.push("name: $name");
      vars.name = patch.name;
    }
    if (patch.githubOriginUrl !== undefined) {
      varDefs.push("$githubOriginUrl: String");
      dataFields.push("githubOriginUrl: $githubOriginUrl");
      vars.githubOriginUrl = patch.githubOriginUrl;
    }
    if (patch.defaultBranch !== undefined) {
      varDefs.push("$defaultBranch: String!");
      dataFields.push("defaultBranch: $defaultBranch");
      vars.defaultBranch = patch.defaultBranch;
    }
    if (patch.entryFile !== undefined) {
      varDefs.push("$entryFile: String!");
      dataFields.push("entryFile: $entryFile");
      vars.entryFile = patch.entryFile;
    }

    await execWrite(
      `mutation UpdateProjectSettings(${varDefs.join(", ")}) {
        project_update(id: $id, data: { ${dataFields.join(", ")} })
      }`,
      vars
    );
  },

  async getProjectMember(projectId: string, userId: string): Promise<DbProjectMember | null> {
    const data = await execRead<{ projectMember: DbProjectMember | null }>(
      `query GetProjectMember($projectId: UUID!, $userId: String!) {
        projectMember(key: { projectId: $projectId, userId: $userId }) {
          projectId userId addedBy permanent createdAt
          user { id username email }
        }
      }`,
      { projectId, userId }
    );
    return data.projectMember ?? null;
  },

  async listProjectMembers(projectId: string): Promise<DbProjectMember[]> {
    const data = await execRead<{ projectMembers: DbProjectMember[] }>(
      `query ListProjectMembers($projectId: UUID!) {
        projectMembers(where: { projectId: { eq: $projectId } }) {
          projectId userId addedBy permanent createdAt
          user { id username email planTier }
        }
      }`,
      { projectId }
    );
    return data.projectMembers;
  },

  async upsertProjectMember(input: {
    projectId: string;
    userId: string;
    addedBy: string;
    permanent: boolean;
  }): Promise<void> {
    await execWrite(
      `mutation UpsertProjectMember($projectId: UUID!, $userId: String!, $addedBy: String!, $permanent: Boolean!) {
        projectMember_upsert(data: {
          projectId: $projectId,
          userId: $userId,
          addedBy: $addedBy,
          permanent: $permanent
        })
      }`,
      input
    );
  },

  async deleteProjectMember(projectId: string, userId: string): Promise<void> {
    await execWrite(
      `mutation DeleteProjectMember($projectId: UUID!, $userId: String!) {
        projectMember_delete(key: { projectId: $projectId, userId: $userId })
      }`,
      { projectId, userId }
    );
  },

  async listProjectNodes(projectId: string): Promise<DbProjectNode[]> {
    const data = await execRead<{ projectNodes: DbProjectNode[] }>(
      `query ListProjectNodes($projectId: UUID!) {
        projectNodes(
          where: { projectId: { eq: $projectId } }
          orderBy: [{ nodeType: ASC }, { name: ASC }]
        ) {
          id projectId parentId name uniqueSiblingKey nodeType contentText storagePath mimeType updatedAt
        }
      }`,
      { projectId }
    );
    return data.projectNodes;
  },

  async getProjectNodeById(id: string): Promise<DbProjectNode | null> {
    const data = await execRead<{ projectNode: DbProjectNode | null }>(
      `query GetProjectNodeById($id: UUID!) {
        projectNode(id: $id) {
          id projectId parentId name uniqueSiblingKey nodeType contentText storagePath mimeType updatedAt
        }
      }`,
      { id }
    );
    return data.projectNode ?? null;
  },

  async createProjectNode(input: {
    id: string;
    projectId: string;
    parentId: string | null;
    name: string;
    nodeType: "folder" | "text_file" | "binary_asset";
    contentText: string | null;
    storagePath: string | null;
    mimeType: string;
  }): Promise<void> {
    const normalizedName = normalizeNodeName(input.name);
    const uniqueSiblingKey = buildUniqueSiblingKey(input.projectId, input.parentId, normalizedName);
    await execWrite(
      `mutation CreateProjectNode(
        $id: UUID!,
        $projectId: UUID!,
        $parentId: UUID,
        $name: String!,
        $uniqueSiblingKey: String!,
        $nodeType: String!,
        $contentText: String,
        $storagePath: String,
        $mimeType: String!
      ) {
        projectNode_insert(data: {
          id: $id,
          projectId: $projectId,
          parentId: $parentId,
          name: $name,
          uniqueSiblingKey: $uniqueSiblingKey,
          nodeType: $nodeType,
          contentText: $contentText,
          storagePath: $storagePath,
          mimeType: $mimeType
        })
      }`,
      {
        ...input,
        name: normalizedName,
        uniqueSiblingKey,
      }
    );
  },

  async updateProjectNodeMeta(input: {
    id: string;
    projectId: string;
    parentId: string | null;
    name: string;
  }): Promise<void> {
    const normalizedName = normalizeNodeName(input.name);
    const uniqueSiblingKey = buildUniqueSiblingKey(input.projectId, input.parentId, normalizedName);
    await execWrite(
      `mutation UpdateProjectNodeMeta(
        $id: UUID!,
        $parentId: UUID,
        $name: String!,
        $uniqueSiblingKey: String!,
        $updatedAt: Timestamp!
      ) {
        projectNode_update(id: $id, data: {
          parentId: $parentId,
          name: $name,
          uniqueSiblingKey: $uniqueSiblingKey,
          updatedAt: $updatedAt
        })
      }`,
      {
        id: input.id,
        parentId: input.parentId,
        name: normalizedName,
        uniqueSiblingKey,
        updatedAt: new Date().toISOString(),
      }
    );
  },

  async updateProjectNodeContent(id: string, contentText: string): Promise<void> {
    await execWrite(
      `mutation UpdateProjectNodeContent($id: UUID!, $contentText: String!, $updatedAt: Timestamp!) {
        projectNode_update(id: $id, data: {
          contentText: $contentText,
          updatedAt: $updatedAt
        })
      }`,
      { id, contentText, updatedAt: new Date().toISOString() }
    );
  },

  async updateProjectNodeAsset(id: string, storagePath: string, mimeType: string): Promise<void> {
    await execWrite(
      `mutation UpdateProjectNodeAsset($id: UUID!, $storagePath: String!, $mimeType: String!, $updatedAt: Timestamp!) {
        projectNode_update(id: $id, data: {
          storagePath: $storagePath,
          mimeType: $mimeType,
          updatedAt: $updatedAt
        })
      }`,
      { id, storagePath, mimeType, updatedAt: new Date().toISOString() }
    );
  },

  async deleteProjectNode(id: string): Promise<void> {
    await execWrite(
      `mutation DeleteProjectNode($id: UUID!) {
        projectNode_delete(id: $id)
      }`,
      { id }
    );
  },

  async getSessionByCode(sessionCode: string): Promise<DbSession | null> {
    const data = await execRead<{ sessions: DbSession[] }>(
      `query GetSessionByCode($sessionCode: String!) {
        sessions(where: { sessionCode: { eq: $sessionCode } }, limit: 1) {
          id projectId hostId sessionCode status isPersistent createdAt endedAt
          project { id name ownerId githubOriginUrl defaultBranch entryFile updatedAt }
        }
      }`,
      { sessionCode: sessionCode.trim().toUpperCase() }
    );
    return data.sessions[0] ?? null;
  },

  async getSessionById(id: string): Promise<DbSession | null> {
    const data = await execRead<{ session: DbSession | null }>(
      `query GetSessionById($id: UUID!) {
        session(id: $id) {
          id projectId hostId sessionCode status isPersistent createdAt endedAt
        }
      }`,
      { id }
    );
    return data.session ?? null;
  },

  async getActiveSessionForProject(projectId: string): Promise<DbSession | null> {
    const data = await execRead<{ sessions: DbSession[] }>(
      `query GetActiveSessionForProject($projectId: UUID!) {
        sessions(
          where: { projectId: { eq: $projectId }, status: { eq: "active" } }
          orderBy: [{ createdAt: DESC }]
          limit: 1
        ) {
          id projectId hostId sessionCode status isPersistent createdAt endedAt
        }
      }`,
      { projectId }
    );
    return data.sessions[0] ?? null;
  },

  async listActiveSessions(): Promise<DbSession[]> {
    const data = await execRead<{ sessions: DbSession[] }>(
      `query ListActiveSessions {
        sessions(where: { status: { eq: "active" } }) {
          id projectId hostId sessionCode status isPersistent createdAt endedAt
        }
      }`
    );
    return data.sessions;
  },

  async createSession(input: {
    id: string;
    projectId: string;
    hostId: string;
    sessionCode: string;
    isPersistent: boolean;
  }): Promise<void> {
    await execWrite(
      `mutation CreateSession($id: UUID!, $projectId: UUID!, $hostId: String!, $sessionCode: String!, $status: String!, $isPersistent: Boolean!) {
        session_insert(data: {
          id: $id,
          projectId: $projectId,
          hostId: $hostId,
          sessionCode: $sessionCode,
          status: $status,
          isPersistent: $isPersistent
        })
      }`,
      {
        ...input,
        status: "active",
      }
    );
  },

  async endSession(id: string): Promise<void> {
    await execWrite(
      `mutation EndSession($id: UUID!, $endedAt: Timestamp!) {
        session_update(id: $id, data: {
          status: "ended",
          endedAt: $endedAt
        })
      }`,
      { id, endedAt: new Date().toISOString() }
    );
  },

  async upsertSessionMember(input: {
    sessionId: string;
    userId: string;
    role: ProjectRole;
  }): Promise<void> {
    await execWrite(
      `mutation UpsertSessionMember($sessionId: UUID!, $userId: String!, $role: String!) {
        sessionMember_upsert(data: {
          sessionId: $sessionId,
          userId: $userId,
          role: $role
        })
      }`,
      input
    );
  },

  async listSessionMembers(sessionId: string): Promise<DbSessionMember[]> {
    const data = await execRead<{ sessionMembers: DbSessionMember[] }>(
      `query ListSessionMembers($sessionId: UUID!) {
        sessionMembers(where: { sessionId: { eq: $sessionId } }) {
          sessionId userId role joinedAt
          user { id username email }
        }
      }`,
      { sessionId }
    );
    return data.sessionMembers;
  },

  async listProjectComments(projectId: string): Promise<DbComment[]> {
    const data = await execRead<{ comments: DbComment[] }>(
      `query ListProjectComments($projectId: UUID!) {
        comments(where: { projectId: { eq: $projectId } }, orderBy: [{ createdAt: ASC }]) {
          id projectId nodeId authorId parentCommentId lineNumber body resolved createdAt
          author { id username }
          node { id name nodeType parentId }
        }
      }`,
      { projectId }
    );
    return data.comments;
  },

  async getCommentById(id: string): Promise<DbComment | null> {
    const data = await execRead<{ comment: DbComment | null }>(
      `query GetCommentById($id: UUID!) {
        comment(id: $id) {
          id projectId nodeId authorId parentCommentId lineNumber body resolved createdAt
          author { id username }
          node { id name nodeType parentId }
        }
      }`,
      { id }
    );
    return data.comment ?? null;
  },

  async createComment(input: {
    id: string;
    projectId: string;
    nodeId: string;
    authorId: string;
    parentCommentId: string | null;
    lineNumber: number | null;
    body: string;
  }): Promise<void> {
    await execWrite(
      `mutation CreateComment(
        $id: UUID!,
        $projectId: UUID!,
        $nodeId: UUID!,
        $authorId: String!,
        $parentCommentId: UUID,
        $lineNumber: Int,
        $body: String!
      ) {
        comment_insert(data: {
          id: $id,
          projectId: $projectId,
          nodeId: $nodeId,
          authorId: $authorId,
          parentCommentId: $parentCommentId,
          lineNumber: $lineNumber,
          body: $body,
          resolved: false
        })
      }`,
      input
    );
  },

  async setCommentResolved(id: string, resolved: boolean): Promise<void> {
    await execWrite(
      `mutation SetCommentResolved($id: UUID!, $resolved: Boolean!) {
        comment_update(id: $id, data: { resolved: $resolved })
      }`,
      { id, resolved }
    );
  },

  async deleteComment(id: string): Promise<void> {
    await execWrite(
      `mutation DeleteComment($id: UUID!) {
        comment_delete(id: $id)
      }`,
      { id }
    );
  },
};

export function canSessionPersist(session: Pick<DbSession, "isPersistent">): boolean {
  return env.ENABLE_PAID_TIERS && Boolean(session.isPersistent);
}
