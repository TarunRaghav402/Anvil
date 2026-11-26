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
 * The 4 Designated Permanent Admin Emails.
 * Users signing in with these exact 4 email addresses ALWAYS receive "admin"
 * regardless of stored planTier or subscription calls. All other accounts
 * start as "free" and upgrade to "pro" when subscribed.
 */
export const ADMIN_EMAILS: readonly string[] = [
  "tarunraghav.in@gmail.com",
  "sarveshwaran.k2008@gmail.com",
  "sriram1080xp@gmail.com",
  "tilaksrinivas270208@gmail.com",
];

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

  // Designated admins always stay admin in every case
  const effectiveAdmins = options?.adminEmails
    ? [...ADMIN_EMAILS, ...options.adminEmails]
    : ADMIN_EMAILS;

  if (
    emailLower &&
    effectiveAdmins.some((adminEmail) => adminEmail.trim().toLowerCase() === emailLower)
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
