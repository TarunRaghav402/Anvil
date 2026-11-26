import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUniqueSiblingKey,
  normalizeNodeName,
  sanitizeProjectRelativePath,
  validateNodeName,
} from "../src/utils/filenames.js";
import {
  scrubPatFromText,
  validateCommitMessage,
  validateGitBranchName,
  validateGitHubOriginUrl,
} from "../src/services/gitService.js";
import { canSessionPersist } from "../src/services/db.js";
import {
  issuePreviewToken,
  revokePreviewTokensForUser,
  verifyPreviewToken,
} from "../src/services/previewTokens.js";
import { generateOtpCode, storeOtp, verifyOtp } from "../src/services/emailOtpService.js";
import { resolveUserPlanTier } from "../../appConfig.js";

test("Cross-OS filename validation rejects Windows reserved names and illegal characters", () => {
  for (const bad of [
    "CON",
    "con.txt",
    "PRN.js",
    "aux.png",
    "nul",
    "COM1",
    "com9.json",
    "LPT1.html",
    "bad<name>.js",
    "bad:name.js",
    'bad"name.js',
    "bad|name.js",
    "bad?name.js",
    "bad*name.js",
    "bad\\name.js",
    "trailing.",
    "trailing ",
    " leading.js",
    ".",
    "..",
    "",
  ]) {
    const res = validateNodeName(bad);
    assert.equal(res.valid, false, `Expected "${bad}" to be rejected`);
  }

  assert.equal(validateNodeName("main.js").valid, true);
  assert.equal(validateNodeName("player-sprite_01.png").valid, true);
});

test("Unicode NFD (macOS) normalizes to NFC and produces identical sibling keys case-insensitively", () => {
  const nfd = "cafe\u0301.txt";
  const nfc = "caf\u00e9.txt";
  assert.equal(normalizeNodeName(nfd), nfc);

  const keyA = buildUniqueSiblingKey("proj-1", null, "Player.js");
  const keyB = buildUniqueSiblingKey("proj-1", null, "player.js");
  assert.equal(keyA, keyB);

  const keyNfd = buildUniqueSiblingKey("proj-1", "folder-1", nfd);
  const keyNfc = buildUniqueSiblingKey("proj-1", "folder-1", nfc);
  assert.equal(keyNfd, keyNfc);
});

test("Relative path sanitizer prevents traversal and normalizes slashes", () => {
  assert.equal(sanitizeProjectRelativePath("assets\\sprites\\hero.png"), "assets/sprites/hero.png");
  assert.equal(sanitizeProjectRelativePath("/index.html"), "index.html");

  for (const evil of ["../secret.txt", "assets/../../etc/passwd", "foo/\0bar.txt", "CON.txt"]) {
    assert.throws(() => sanitizeProjectRelativePath(evil));
  }
});

test("Git URL, branch, commit message validation and PAT scrubbing", () => {
  assert.equal(
    validateGitHubOriginUrl("https://github.com/acme-studio/space-dodge"),
    "https://github.com/acme-studio/space-dodge.git"
  );
  assert.equal(
    validateGitHubOriginUrl("https://github.com/acme-studio/space-dodge.git"),
    "https://github.com/acme-studio/space-dodge.git"
  );

  for (const badUrl of [
    "http://github.com/acme/repo.git",
    "ssh://git@github.com/acme/repo.git",
    "https://evil.com/acme/repo.git",
    "https://token@github.com/acme/repo.git",
    "ext::sh -c whoami",
  ]) {
    assert.throws(() => validateGitHubOriginUrl(badUrl));
  }

  assert.equal(validateGitBranchName("feature/netcode-v2"), "feature/netcode-v2");
  for (const badBranch of ["-u", "main..dev", "main.lock", "bad branch", "a@{0}"]) {
    assert.throws(() => validateGitBranchName(badBranch));
  }

  assert.equal(validateCommitMessage("  Add player physics  "), "Add player physics");
  assert.throws(() => validateCommitMessage("   "));

  const pat = "ghp_SuperSecretToken12345+abc";
  const dirtyLog = `fatal: unable to access 'https://x-access-token:${encodeURIComponent(
    pat
  )}@github.com/acme/repo.git/': Failed with ${pat}`;
  const clean = scrubPatFromText(dirtyLog, pat);
  assert.equal(clean.includes(pat), false);
  assert.equal(clean.includes(encodeURIComponent(pat)), false);
  assert.equal(clean.includes("x-access-token"), false);
});

test("canSessionPersist enforces ENABLE_PAID_TIERS=false free mode", () => {
  assert.equal(canSessionPersist({ isPersistent: false }), false);
  assert.equal(canSessionPersist({ isPersistent: true }), false);
});

test("Preview capability tokens verify project binding and revoke cleanly", () => {
  const token = issuePreviewToken("project-123", "user-abc");
  assert.deepEqual(verifyPreviewToken(token, "project-123"), { uid: "user-abc" });
  assert.equal(verifyPreviewToken(token, "other-project"), null);
  assert.equal(verifyPreviewToken(`${token}tamper`, "project-123"), null);

  revokePreviewTokensForUser("project-123", "user-abc");
  assert.equal(verifyPreviewToken(token, "project-123"), null);
});

test("Email OTP generation, verification, single-use consumption, and attempt lockout", () => {
  const code = generateOtpCode();
  assert.match(code, /^\d{6}$/);

  storeOtp("verify_email", "Tester@Anvil.local", code, 60_000);
  // Wrong code increments attempts
  const bad1 = verifyOtp("verify_email", "tester@anvil.local", "000000");
  assert.equal(bad1.valid, false);
  // Valid code succeeds (case-insensitive email) and clears OTP (single-use)
  const ok = verifyOtp("verify_email", "tester@anvil.local", code);
  assert.equal(ok.valid, true);
  const reuse = verifyOtp("verify_email", "tester@anvil.local", code);
  assert.equal(reuse.valid, false);

  // Attempt lockout after 5 wrong guesses
  storeOtp("reset_password", "lock@anvil.local", "654321", 60_000);
  for (let i = 0; i < 5; i++) {
    assert.equal(verifyOtp("reset_password", "lock@anvil.local", "111111").valid, false);
  }
  assert.equal(verifyOtp("reset_password", "lock@anvil.local", "654321").valid, false);
});

test("resolveUserPlanTier enforces server-side ADMIN_EMAILS allowlist when trustAdminTier is false", () => {
  assert.equal(
    resolveUserPlanTier(
      { email: "regular@example.com" },
      "admin",
      { adminEmails: ["owner@example.com"], trustAdminTier: false }
    ),
    "free"
  );
  assert.equal(
    resolveUserPlanTier(
      { email: "Owner@Example.com" },
      "free",
      { adminEmails: ["owner@example.com"], trustAdminTier: false }
    ),
    "admin"
  );
  // Client UI trusts authoritative planTier returned from backend /api/auth/me
  assert.equal(resolveUserPlanTier({ email: "owner@example.com" }, "admin"), "admin");
});
