import { db, newUuid } from "./db.js";

export async function createCanvasStarterFiles(projectId: string, projectName: string): Promise<void> {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(projectName)}</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <div class="hud">
    <span id="title">${escapeHtml(projectName)}</span>
    <span id="score">Score: 0</span>
  </div>
  <canvas id="game" width="640" height="400"></canvas>
  <script src="main.js"></script>
</body>
</html>
`;

  const css = `* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  background: #141416;
  color: #e5e5e5;
  font-family: system-ui, -apple-system, sans-serif;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  gap: 10px;
}

.hud {
  width: 640px;
  max-width: 95vw;
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  font-weight: 600;
}

canvas {
  border: 1px solid #3c3c3c;
  background: #1e1e1e;
  max-width: 95vw;
}
`;

  const js = `const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");

const player = { x: 80, y: 200, vx: 3.2, vy: 2.4, size: 28 };
const target = { x: 420, y: 180, radius: 14 };
let score = 0;

function tick() {
  player.x += player.vx;
  player.y += player.vy;

  if (player.x < 0 || player.x + player.size > canvas.width) player.vx *= -1;
  if (player.y < 0 || player.y + player.size > canvas.height) player.vy *= -1;

  const dx = player.x + player.size / 2 - target.x;
  const dy = player.y + player.size / 2 - target.y;
  if (Math.hypot(dx, dy) < player.size / 2 + target.radius) {
    score += 1;
    scoreEl.textContent = "Score: " + score;
    target.x = 40 + Math.random() * (canvas.width - 80);
    target.y = 40 + Math.random() * (canvas.height - 80);
  }

  ctx.fillStyle = "#1e1e1e";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#4ec9b0";
  ctx.beginPath();
  ctx.arc(target.x, target.y, target.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#007acc";
  ctx.fillRect(player.x, player.y, player.size, player.size);

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
`;

  await db.createProjectNode({
    id: newUuid(),
    projectId,
    parentId: null,
    name: "index.html",
    nodeType: "text_file",
    contentText: html,
    storagePath: null,
    mimeType: "text/html",
  });

  await db.createProjectNode({
    id: newUuid(),
    projectId,
    parentId: null,
    name: "style.css",
    nodeType: "text_file",
    contentText: css,
    storagePath: null,
    mimeType: "text/css",
  });

  await db.createProjectNode({
    id: newUuid(),
    projectId,
    parentId: null,
    name: "main.js",
    nodeType: "text_file",
    contentText: js,
    storagePath: null,
    mimeType: "application/javascript",
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
