import { auth } from "../config/firebase";
import type { ProjectRole } from "../../../appConfig";
import type {
  AnvilComment,
  AnvilProject,
  AnvilProjectMember,
  AnvilProjectNode,
  AnvilSession,
  AnvilSessionMember,
  AnvilUser,
  OnlinePresenceEntry,
} from "../types/anvil";

export const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export function getWsBaseUrl(): string {
  if (import.meta.env.VITE_WS_URL) {
    return `${String(import.meta.env.VITE_WS_URL).replace(/\/+$/, "")}/yjs`;
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/yjs`;
}

export async function getIdToken(forceRefresh = false): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("You are not signed in.");
  }
  return user.getIdToken(forceRefresh);
}

async function request<T>(path: string, init: RequestInit = {}, authRequired = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (authRequired) {
    const token = await getIdToken();
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(apiUrl(path), {
    ...init,
    headers,
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const json = (await res.json()) as { error?: string };
      if (json.error) message = json.error;
    } catch {
      const txt = await res.text().catch(() => "");
      if (txt) message = txt;
    }
    const error = Object.assign(new Error(message), { status: res.status });
    throw error;
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export const api = {
  checkUsername(username: string): Promise<{ available: boolean; error?: string }> {
    return request(`/api/auth/check-username?username=${encodeURIComponent(username)}`, {}, false);
  },

  registerProfile(username: string): Promise<{ user: AnvilUser }> {
    return request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username }),
    });
  },

  loginWithUsername(username: string, password: string): Promise<{ email: string; username: string }> {
    return request(
      "/api/auth/login-username",
      {
        method: "POST",
        body: JSON.stringify({ username, password }),
      },
      false
    );
  },

  sendVerificationCode(): Promise<{
    sent: boolean;
    alreadyVerified?: boolean;
    delivery: "smtp" | "emulator";
    canQuickVerify?: boolean;
    emulatorCode?: string;
  }> {
    return request("/api/auth/send-verification-code", { method: "POST" });
  },

  verifyEmailCode(input: { code?: string; emulatorQuickVerify?: boolean }): Promise<{ verified: boolean }> {
    return request("/api/auth/verify-email-code", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  forgotPassword(email: string): Promise<{
    sent: boolean;
    delivery: "smtp" | "emulator";
    message: string;
    emulatorCode?: string;
  }> {
    return request(
      "/api/auth/forgot-password",
      {
        method: "POST",
        body: JSON.stringify({ email }),
      },
      false
    );
  },

  resetPassword(
    email: string,
    code: string,
    newPassword: string
  ): Promise<{ reset: boolean; username: string }> {
    return request(
      "/api/auth/reset-password",
      {
        method: "POST",
        body: JSON.stringify({ email, code, newPassword }),
      },
      false
    );
  },

  updateProfile(input: { username?: string; role?: string }): Promise<{ user: AnvilUser; message: string }> {
    return request("/api/auth/profile", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  subscribe(planTier: "pro" | "free"): Promise<{ user: AnvilUser; message: string }> {
    return request("/api/auth/subscribe", {
      method: "POST",
      body: JSON.stringify({ planTier }),
    });
  },

  getMe(): Promise<{ uid: string; email: string; emailVerified: boolean; user: AnvilUser | null }> {
    return request("/api/auth/me");
  },

  listProjects(): Promise<{ projects: AnvilProject[] }> {
    return request("/api/projects");
  },

  createProject(input: {
    name: string;
    defaultBranch?: string;
    entryFile?: string;
    template?: "canvas-game" | "blank";
  }): Promise<{ project: AnvilProject }> {
    return request("/api/projects", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  getProjectOverview(projectId: string): Promise<{
    project: AnvilProject;
    isOwner: boolean;
    members: AnvilProjectMember[];
    activeSession: AnvilSession | null;
    sessionMembers: AnvilSessionMember[];
    presence: OnlinePresenceEntry[];
    nodes: AnvilProjectNode[];
  }> {
    return request(`/api/projects/${projectId}`);
  },

  updateProjectSettings(
    projectId: string,
    patch: {
      name?: string;
      githubOriginUrl?: string | null;
      defaultBranch?: string;
      entryFile?: string;
    }
  ): Promise<{ project: AnvilProject }> {
    return request(`/api/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },

  addProjectMember(projectId: string, identifier: string): Promise<{ members: AnvilProjectMember[] }> {
    return request(`/api/projects/${projectId}/members`, {
      method: "POST",
      body: JSON.stringify({ identifier }),
    });
  },

  removeProjectMember(projectId: string, userId: string): Promise<{ removed: boolean }> {
    return request(`/api/projects/${projectId}/members/${userId}`, {
      method: "DELETE",
    });
  },

  listNodes(projectId: string): Promise<{ nodes: AnvilProjectNode[] }> {
    return request(`/api/projects/${projectId}/nodes`);
  },

  createNode(
    projectId: string,
    input: { parentId: string | null; name: string; nodeType: "folder" | "text_file"; contentText?: string }
  ): Promise<{ node: AnvilProjectNode }> {
    return request(`/api/projects/${projectId}/nodes`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  renameOrMoveNode(
    projectId: string,
    nodeId: string,
    patch: { name?: string; parentId?: string | null }
  ): Promise<{ node: AnvilProjectNode }> {
    return request(`/api/projects/${projectId}/nodes/${nodeId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },

  deleteNode(projectId: string, nodeId: string): Promise<{ deletedIds: string[] }> {
    return request(`/api/projects/${projectId}/nodes/${nodeId}`, {
      method: "DELETE",
    });
  },

  uploadFiles(
    projectId: string,
    files: File[],
    parentId: string | null,
    overwrite = true
  ): Promise<{ uploaded: AnvilProjectNode[] }> {
    const form = new FormData();
    if (parentId) form.append("parentId", parentId);
    form.append("overwrite", overwrite ? "true" : "false");
    for (const file of files) {
      form.append("files", file);
    }
    return request(`/api/projects/${projectId}/nodes/upload`, {
      method: "POST",
      body: form,
    });
  },

  getNodeTextContent(
    projectId: string,
    nodeId: string
  ): Promise<{ nodeId: string; name: string; mimeType: string; contentText: string }> {
    return request(`/api/projects/${projectId}/nodes/${nodeId}/content`);
  },

  async fetchNodeBlobUrl(projectId: string, nodeId: string): Promise<string> {
    const token = await getIdToken();
    const res = await fetch(apiUrl(`/api/projects/${projectId}/nodes/${nodeId}/content`), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch asset (${res.status})`);
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  forceSync(projectId: string): Promise<{ synced: boolean; timestamp: number }> {
    return request(`/api/projects/${projectId}/sync`, { method: "POST" });
  },

  issuePreviewToken(projectId: string): Promise<{ token: string }> {
    return request(`/api/projects/${projectId}/preview-token`, { method: "POST" });
  },

  async downloadProjectZip(projectId: string, projectName: string): Promise<void> {
    const token = await getIdToken();
    const res = await fetch(apiUrl(`/api/projects/${projectId}/export`), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(json.error || `Export failed (${res.status})`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName.replace(/[^a-zA-Z0-9._-]+/g, "-") || "anvil-project"}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },

  startSession(projectId: string, role: ProjectRole): Promise<{
    session: AnvilSession;
    sessionMembers: AnvilSessionMember[];
  }> {
    return request("/api/sessions/start", {
      method: "POST",
      body: JSON.stringify({ projectId, role }),
    });
  },

  joinSession(sessionCode: string, role: ProjectRole): Promise<{
    session: AnvilSession;
    projectId: string;
    role: ProjectRole;
  }> {
    return request("/api/sessions/join", {
      method: "POST",
      body: JSON.stringify({ sessionCode, role }),
    });
  },

  endSession(sessionId: string): Promise<{ ended: boolean }> {
    return request(`/api/sessions/${sessionId}/end`, { method: "POST" });
  },

  updateSessionRole(sessionId: string, role: ProjectRole): Promise<{ ok: boolean }> {
    return request(`/api/sessions/${sessionId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
  },

  listComments(projectId: string): Promise<{ comments: AnvilComment[] }> {
    return request(`/api/projects/${projectId}/comments`);
  },

  createComment(
    projectId: string,
    input: {
      nodeId: string;
      parentCommentId?: string | null;
      lineNumber?: number | null;
      body: string;
    }
  ): Promise<{ comment: AnvilComment }> {
    return request(`/api/projects/${projectId}/comments`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  setCommentResolved(
    projectId: string,
    commentId: string,
    resolved: boolean
  ): Promise<{ comment: AnvilComment }> {
    return request(`/api/projects/${projectId}/comments/${commentId}`, {
      method: "PATCH",
      body: JSON.stringify({ resolved }),
    });
  },

  deleteComment(projectId: string, commentId: string): Promise<{ deleted: boolean }> {
    return request(`/api/projects/${projectId}/comments/${commentId}`, {
      method: "DELETE",
    });
  },

  commitAndPush(
    projectId: string,
    input: {
      originUrl: string;
      branch: string;
      pat: string;
      commitMessage: string;
    }
  ): Promise<{
    commitSha: string;
    branch: string;
    originUrl: string;
    filesCommitted: number;
    message: string;
  }> {
    return request(`/api/projects/${projectId}/git/commit-push`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
};
