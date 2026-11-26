# Anvil Verification & Test Checklist

Use this checklist to verify every functional, security, and cross-OS requirement before release.

## 1. Authentication & Email Verification Gate
- [ ] Register a new user with only **Username**, **Email**, and **Password**.
- [ ] Attempt registering a second account with the same **Username** (different case, e.g. `Alice` vs `alice`) — verify clear `"Username is already taken."` error.
- [ ] Verify the **Verification Gate** blocks access to projects/sessions while unverified.
- [ ] Click **Resend Verification Email** and confirm a new link is dispatched (visible in Firebase Emulator UI `http://127.0.0.1:4000/auth` or terminal logs).
- [ ] Click **Check Verification Status** before opening the link — verify clear unverified message.
- [ ] Open the verification link, then click **Check Verification Status** — confirm immediate entry to the Lobby.
- [ ] Sign out and test login with a wrong password — confirm clear `"Wrong email or password."` error.

## 2. Cloud Project Tree & Cross-OS Rules
- [ ] Create a new cloud project and verify files persist in SQL (`project_nodes`) without any local project folder.
- [ ] Right-click in Explorer to test **New File**, **New Folder**, **Rename**, **Delete**, and **Upload**.
- [ ] Drag and drop `PNG`, `SVG`, `JSON`, `WAV`, and `MP3` files directly onto Explorer and onto a subfolder.
- [ ] Open an uploaded `PNG`/`SVG` in the **Asset & Sprite Previewer** — verify zoom (`+`/`-`/reset) and **Checkerboard** toggle work.
- [ ] Open an uploaded `WAV`/`MP3` — verify **Play/Pause**, interactive **Seek Bar**, and mute toggle work.
- [ ] **Cross-OS filename rules check:**
  - [ ] Attempt creating `A.js` and `a.js` in the same folder — confirm the second is rejected (`409` case-insensitive sibling enforcement).
  - [ ] Attempt creating `CON.txt`, `nul`, `LPT1.png`, `bad?.js`, or `trailing.` — confirm immediate rejection (`400`).

## 3. Session Lifecycle & Access Control
- [ ] Host opens a project and clicks **Start Session** — confirm a 6-character uppercase code and shareable invite URL are generated.
- [ ] User 2 logs in (verified) and joins via the 6-character code (or `?session=CODE` invite link) selecting a role (`Designer`, `Animator`, `Tester`, or `Coder`).
- [ ] Confirm a 3rd verified user who does **not** have the code and is not a project member gets `403` on REST API, Live Preview, Socket.io, and Yjs WebSocket.
- [ ] Host refreshes the browser page (`< 30s` grace timeout) — confirm the session stays alive and User 2 is not kicked.
- [ ] Host clicks **End Session** (or closes tab and waits `> 30s` grace timeout):
  - [ ] Confirm session status becomes `ended`, old code is invalidated, and User 2 (if temporary guest) is immediately disconnected and receives `403` on reload.
  - [ ] Confirm `ENABLE_PAID_TIERS=false` causes `canSessionPersist(session)` to always return `false`.

## 4. Real-Time Editing, Shortcuts & Live Preview
- [ ] Edit the same file simultaneously in Window A and Window B — confirm conflict-free CRDT merging via Yjs.
- [ ] Confirm other users' cursors and selections render in their assigned color with `"username · Role"` labels.
- [ ] Confirm the **Collaborators** sidebar lists online users, their roles, and which file each user has open.
- [ ] Confirm edits save to SQL after ~2s debounce and when `Ctrl/Cmd+S` is pressed, updating the Status Bar sync indicator.
- [ ] Confirm `Ctrl/Cmd+P` opens Quick Open and `Ctrl/Cmd+B` toggles the Sidebar.
- [ ] Confirm **Live Preview** hot-reloads automatically when code or assets change, and **Open in New Tab** loads the sandboxed project.

## 5. Contextual Comments
- [ ] Pin a comment to a specific code line in Monaco (using toolbar button or editor context menu) and verify the gutter marker appears.
- [ ] Pin a comment to a binary asset (`ship.svg` / `hero.png`).
- [ ] Reply from a second user window — confirm live update.
- [ ] Click a comment in the **Comments** panel — confirm editor jumps directly to that file & line.
- [ ] Mark a thread **Resolved** and **Reopen** — confirm state updates live for all users.

## 6. Zip Export
- [ ] Click **Export (.zip)** — verify download completes with all SQL text files and Firebase Storage binaries.
- [ ] Extract the `.zip` using Windows Explorer, macOS Archive Utility, or Linux `unzip` — verify UTF-8 filenames, relative folder hierarchy, and zero OS-specific metadata errors.

## 7. One-Click GitHub Commit & Push (Non-Host Member)
- [ ] Add User 2 as a permanent project member (or join active session as non-host).
- [ ] In User 2's **Git** sidebar, enter a GitHub HTTPS Origin URL (`https://github.com/<owner>/<repo>.git`), Branch (`main`), Personal Access Token (PAT), and Commit Message.
- [ ] Click **Commit & Push** — confirm live Git logs stream to **Output / Git Log** and commit author matches User 2's username and email.
- [ ] Verify the PAT is NOT stored in SQL, disk, `localStorage`, or logs/responses.
- [ ] Push an external commit directly to the remote branch on GitHub, then click **Commit & Push** in Anvil — confirm push is NOT force-pushed and shows `"Remote has newer commits. Push to a new branch or pull manually."`.
- [ ] **Cross-OS Git check:** Push from Windows/macOS, clone on Linux (or vice versa), run `git status` and `git diff` — confirm zero line-ending (`CRLF`/`LF`) or permission (`fileMode`) diffs.
