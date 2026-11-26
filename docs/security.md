# Anvil Security Architecture & Best Practices

## 1. Public Web Config vs. Server Secrets

Understanding the boundary between Firebase client identifiers and server credentials is critical:

- **Firebase Web Config (`VITE_FIREBASE_*`)**: Variables such as `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, and `VITE_FIREBASE_APP_ID` are **not secrets**. They identify your Firebase project in the browser bundle and are protected by Firebase Authentication, backend API verification, Data Connect `@auth(level: NO_ACCESS)` policies, and `storage.rules`. Even so, Anvil keeps them in `.env` so each fork/environment configures its own Firebase project cleanly.
- **Server-Side Credentials (TRUE SECRETS — NEVER COMMIT OR EXPOSE)**:
  - `service-account.json`, `*-adminsdk-*.json`, `serviceAccountKey*.json`, `GOOGLE_APPLICATION_CREDENTIALS`, `FIREBASE_SERVICE_ACCOUNT_JSON`
  - `PREVIEW_TOKEN_SECRET` (HMAC-SHA256 signing key for preview capability tokens)
  - `.env` / `.env.*` (except `.env.example`), `.runtimeconfig.json`, `*.pem`, `*.key`, `*.p12`
  - Never prefix a server secret with `VITE_` — Vite bundles every `VITE_*` variable into public browser JavaScript.

## 2. GitHub PAT Lifecycle (Commit & Push)

Anvil's one-click **Commit & Push** feature allows any project member to push cloud project files to GitHub:

- Each collaborator types their own GitHub Personal Access Token (PAT) in the Source Control sidebar at runtime.
- The PAT is held **only in React component memory** for the request and **never written** to PostgreSQL, disk, `localStorage`, `sessionStorage`, or cookies.
- On the backend (`backend/src/services/gitService.ts`), the PAT is passed into a temporary remote URL inside an ephemeral OS temp directory (`anvil-git-*`), scrubbed from all `stdout`, `stderr`, and thrown error messages via `scrubPatFromText()`, and the temp directory is deleted in a `finally` block.
- Non-fast-forward pushes are rejected cleanly instead of force-pushing (`Remote has newer commits. Push to a new branch or pull manually.`).

## 3. Access Control & Session Isolation

- **Email Verification Gate**: Unverified accounts receive `403 EMAIL_NOT_VERIFIED` across REST routes, Socket.io handshakes, and Yjs WebSockets.
- **Membership Enforcement**: `assertProjectAccess()` validates ownership, permanent membership, or active session membership on every API call, preview request, and WebSocket upgrade.
- **Session End Revocation**: When the host clicks **End Session** or exceeds `SESSION_HOST_GRACE_MS` (30s default), pending Yjs docs flush to SQL, the 6-character code is invalidated, temporary guests are disconnected (`403`), and issued preview capability tokens are revoked.
- **Backend-Mediated Data & Storage**: `dataconnect/connector/*.gql` uses `@auth(level: NO_ACCESS)` and `storage.rules` uses `allow read, write: if false;`, ensuring no client can query SQL or Storage directly without passing backend authorization.
- **Sandboxed Live Preview**: Runs inside `<iframe sandbox="allow-scripts allow-forms allow-modals">` without `allow-same-origin`, preventing previewed user scripts from reading parent cookies, tokens, or DOM state.

## 4. Automated Secret Scanning

- `.gitignore` blocks `.env`, `.env.*` (except `.env.example`), `.firebaserc`, service account JSON files, private keys, and local emulator databases.
- `.githooks/pre-commit` invokes `scripts/pre-commit.mjs` (cross-platform Node runner for Windows, macOS, and Linux) to block sensitive filenames and run `gitleaks` on staged changes.
- `.github/workflows/ci.yml` runs `gitleaks/gitleaks-action@v2` on every push and pull request to `main`.
