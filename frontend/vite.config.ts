import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";
import { APP_NAME } from "../appConfig.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

export default defineConfig({
  envDir: rootDir,
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "anvil-html-title",
      transformIndexHtml(html) {
        return html.replace(/__APP_NAME__/g, APP_NAME);
      },
    },
  ],
  server: {
    port: 5173,
    fs: {
      allow: [rootDir],
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4001",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://127.0.0.1:4001",
        ws: true,
      },
      "/yjs": {
        target: "ws://127.0.0.1:4001",
        ws: true,
      },
    },
  },
  optimizeDeps: {
    include: ["yjs", "y-monaco", "y-websocket", "monaco-editor"],
  },
});
