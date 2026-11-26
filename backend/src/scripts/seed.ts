import { adminAuth } from "../config/firebase.js";
import { env } from "../config/env.js";
import { db, newUuid } from "../services/db.js";
import { downloadAssetBuffer, uploadAssetBuffer } from "../services/storageService.js";
import { APP_NAME } from "../../../appConfig.js";

if (!env.USE_FIREBASE_EMULATORS) {
  console.error(`[${APP_NAME}] Seed script is intended for local Firebase Emulator testing only.`);
  process.exit(1);
}

async function ensureUser(username: string, email: string, password: string): Promise<string> {
  const existingSql = await db.getUserByEmail(email);

  let authUser: Awaited<ReturnType<typeof adminAuth.getUserByEmail>> | null;
  try {
    authUser = await adminAuth.getUserByEmail(email);
  } catch {
    authUser = null;
  }

  // If SQL persisted across an Auth Emulator restart, recreate Auth user with the SQL UID
  // so project ownership, memberships, and comments stay linked cleanly.
  if (existingSql && authUser && authUser.uid !== existingSql.id) {
    await adminAuth.deleteUser(authUser.uid);
    authUser = null;
  }

  let uid: string;
  if (authUser) {
    uid = authUser.uid;
    if (!authUser.emailVerified || authUser.displayName !== username) {
      await adminAuth.updateUser(uid, { emailVerified: true, displayName: username });
    }
  } else {
    const created = await adminAuth.createUser({
      ...(existingSql ? { uid: existingSql.id } : {}),
      email,
      password,
      displayName: username,
      emailVerified: true,
    });
    uid = created.uid;
  }

  if (!existingSql) {
    await db.createUser({
      id: uid,
      username,
      email,
      planTier: "free",
    });
  }

  return uid;
}

async function runSeed(): Promise<void> {
  console.log(`[${APP_NAME}] Seeding local Firebase Emulators...`);

  const aliceId = await ensureUser("alice", "alice@anvil.local", "AnvilTest!123");
  const bobId = await ensureUser("bob", "bob@anvil.local", "AnvilTest!123");

  const existingProjects = await db.listProjectsForUser(aliceId);
  const shipSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <polygon points="32,4 58,56 32,44 6,56" fill="#007acc" />
  <polygon points="32,14 44,44 32,37 20,44" fill="#9cdcfe" />
</svg>
`;

  const existing = existingProjects.find((p) => p.name === "Space Dodge");
  if (existing) {
    const existingNodes = await db.listProjectNodes(existing.id);
    const shipNode = existingNodes.find((n) => n.name === "ship.svg" && n.storagePath);
    if (shipNode?.storagePath) {
      try {
        await downloadAssetBuffer(shipNode.storagePath);
      } catch {
        await uploadAssetBuffer(shipNode.storagePath, Buffer.from(shipSvg, "utf8"), "image/svg+xml");
      }
    }
    console.log(`[${APP_NAME}] Seed project "Space Dodge" (${existing.id}) already exists.`);
    console.log(`  User 1: alice@anvil.local / AnvilTest!123`);
    console.log(`  User 2: bob@anvil.local / AnvilTest!123`);
    return;
  }

  const projectId = newUuid();
  await db.createProject({
    id: projectId,
    ownerId: aliceId,
    name: "Space Dodge",
    defaultBranch: "main",
    entryFile: "index.html",
  });

  await db.upsertProjectMember({
    projectId,
    userId: aliceId,
    addedBy: aliceId,
    permanent: true,
  });

  await db.upsertProjectMember({
    projectId,
    userId: bobId,
    addedBy: aliceId,
    permanent: true,
  });

  const assetsFolderId = newUuid();
  const dataFolderId = newUuid();

  await db.createProjectNode({
    id: assetsFolderId,
    projectId,
    parentId: null,
    name: "assets",
    nodeType: "folder",
    contentText: null,
    storagePath: null,
    mimeType: "inode/directory",
  });

  await db.createProjectNode({
    id: dataFolderId,
    projectId,
    parentId: null,
    name: "data",
    nodeType: "folder",
    contentText: null,
    storagePath: null,
    mimeType: "inode/directory",
  });

  const shipNodeId = newUuid();
  const shipStoragePath = `projects/${projectId}/assets/${shipNodeId}/ship.svg`;
  await uploadAssetBuffer(shipStoragePath, Buffer.from(shipSvg, "utf8"), "image/svg+xml");

  await db.createProjectNode({
    id: shipNodeId,
    projectId,
    parentId: assetsFolderId,
    name: "ship.svg",
    nodeType: "binary_asset",
    contentText: null,
    storagePath: shipStoragePath,
    mimeType: "image/svg+xml",
  });

  await db.createProjectNode({
    id: newUuid(),
    projectId,
    parentId: dataFolderId,
    name: "config.json",
    nodeType: "text_file",
    contentText: JSON.stringify({ asteroidSpeed: 2.8, spawnRateMs: 900 }, null, 2) + "\n",
    storagePath: null,
    mimeType: "application/json",
  });

  await db.createProjectNode({
    id: newUuid(),
    projectId,
    parentId: null,
    name: "index.html",
    nodeType: "text_file",
    contentText: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Space Dodge</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <div class="hud">
    <span>Space Dodge</span>
    <span id="score">Score: 0</span>
  </div>
  <canvas id="stage" width="640" height="380"></canvas>
  <script src="main.js"></script>
</body>
</html>
`,
    storagePath: null,
    mimeType: "text/html",
  });

  await db.createProjectNode({
    id: newUuid(),
    projectId,
    parentId: null,
    name: "style.css",
    nodeType: "text_file",
    contentText: `* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: #141416;
  color: #cccccc;
  font-family: system-ui, sans-serif;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  gap: 8px;
}
.hud {
  width: 640px;
  max-width: 95vw;
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
}
canvas {
  border: 1px solid #3c3c3c;
  background: #1e1e1e;
  max-width: 95vw;
}
`,
    storagePath: null,
    mimeType: "text/css",
  });

  const mainJsId = newUuid();
  await db.createProjectNode({
    id: mainJsId,
    projectId,
    parentId: null,
    name: "main.js",
    nodeType: "text_file",
    contentText: `const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");

const shipImg = new Image();
shipImg.src = "assets/ship.svg";

const player = { x: 300, y: 310, w: 36, h: 36, vx: 0 };
const rocks = [];
let config = { asteroidSpeed: 2.8, spawnRateMs: 900 };
let score = 0;

fetch("data/config.json")
  .then((r) => r.json())
  .then((c) => { config = c; })
  .catch(() => {});

window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft" || e.key === "a") player.vx = -5;
  if (e.key === "ArrowRight" || e.key === "d") player.vx = 5;
});
window.addEventListener("keyup", () => { player.vx = 0; });

setInterval(() => {
  rocks.push({ x: Math.random() * (canvas.width - 20), y: -20, r: 10 + Math.random() * 10 });
}, 900);

function loop() {
  player.x = Math.max(0, Math.min(canvas.width - player.w, player.x + player.vx));
  ctx.fillStyle = "#1e1e1e";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (shipImg.complete) {
    ctx.drawImage(shipImg, player.x, player.y, player.w, player.h);
  } else {
    ctx.fillStyle = "#007acc";
    ctx.fillRect(player.x, player.y, player.w, player.h);
  }

  ctx.fillStyle = "#ce9178";
  for (let i = rocks.length - 1; i >= 0; i--) {
    const r = rocks[i];
    r.y += config.asteroidSpeed;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
    ctx.fill();
    if (r.y > canvas.height + 20) {
      rocks.splice(i, 1);
      score += 1;
      scoreEl.textContent = "Score: " + score;
    }
  }
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
`,
    storagePath: null,
    mimeType: "application/javascript",
  });

  await db.createComment({
    id: newUuid(),
    projectId,
    nodeId: mainJsId,
    authorId: bobId,
    parentCommentId: null,
    lineNumber: 25,
    body: "Use config.spawnRateMs here instead of hardcoded 900ms once level tuning is ready.",
  });

  console.log(`[${APP_NAME}] Seed completed! Project "Space Dodge" ID: ${projectId}`);
  console.log(`  User 1 (owner): alice@anvil.local / AnvilTest!123`);
  console.log(`  User 2 (member): bob@anvil.local / AnvilTest!123`);
}

runSeed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[${APP_NAME}] Seed failed:`, err);
    process.exit(1);
  });
