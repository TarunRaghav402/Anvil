export const APP_NAME = "Anvil";
export const APP_TAGLINE = "Collaborative Cloud Workspace";
export const APP_VERSION = "1.0.0";
export const APP_EMAIL_VERIFICATION_SUBJECT = `Verify your email for ${APP_NAME}`;

export const PROJECT_ROLES = ["coder", "designer", "animator", "tester"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const ROLE_LABELS: Record<ProjectRole, string> = {
  coder: "Coder",
  designer: "Designer",
  animator: "Animator",
  tester: "Tester",
};

/**
 * Intentionally empty in source control so personal email addresses are never
 * exposed in the public repository or compiled client bundle.
 * Server-side admins are configured via the backend `ADMIN_EMAILS` env variable.
 */
export const ADMIN_EMAILS: string[] = [];

export type PlanTier = "admin" | "pro" | "free";

export interface PlanTierResolveOptions {
  adminEmails?: readonly string[];
  trustAdminTier?: boolean;
}

export function resolveUserPlanTier(
  identifier?: { username?: string; email?: string } | null,
  rawTier?: string | null,
  options?: PlanTierResolveOptions
): PlanTier {
  const cleanTier = rawTier?.trim().toLowerCase();
  const emailLower = identifier?.email?.trim().toLowerCase();
  const adminList = options?.adminEmails ?? ADMIN_EMAILS;

  if (
    emailLower &&
    adminList.some((adminEmail) => adminEmail.trim().toLowerCase() === emailLower)
  ) {
    return "admin";
  }

  if (options?.trustAdminTier !== false && cleanTier === "admin") {
    return "admin";
  }

  if (cleanTier === "pro" || cleanTier === "premium") {
    return "pro";
  }

  return "free";
}
