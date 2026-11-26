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
