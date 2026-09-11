import { connect } from "node:net";
import { defineConfig, type Connect, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// The fine-tuned planning model (training/serve.py on 127.0.0.1:11435) is
// optional. When it isn't running, report its health check as not ready so the
// studio falls back to Ollama without a proxy error in the console or terminal.
const planningAiHealth: Connect.NextHandleFunction = (_req, res, next) => {
  const socket = connect(11435, "127.0.0.1");
  socket.once("connect", () => {
    socket.destroy();
    next();
  });
  socket.once("error", () => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ready: false }));
  });
};
const optionalPlanningAi: Plugin = {
  name: "optional-planning-ai",
  configureServer: (server) => {
    server.middlewares.use("/planning-ai/health", planningAiHealth);
  },
  configurePreviewServer: (server) => {
    server.middlewares.use("/planning-ai/health", planningAiHealth);
  },
};

export default defineConfig({
  plugins: [react(), optionalPlanningAi],
  server: {
    // Sign In With Google needs this referrer policy when served over http://localhost.
    headers: { "Referrer-Policy": "no-referrer-when-downgrade" },
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/planning-ai": { target: "http://127.0.0.1:11435", rewrite: path => path.replace(/^\/planning-ai/, "") },
      "/ollama": {
        target: "http://127.0.0.1:11434",
        rewrite: (path) => path.replace(/^\/ollama/, ""),
      },
    },
  },
  preview: {
    headers: { "Referrer-Policy": "no-referrer-when-downgrade" },
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/planning-ai": { target: "http://127.0.0.1:11435", rewrite: path => path.replace(/^\/planning-ai/, "") },
      "/ollama": {
        target: "http://127.0.0.1:11434",
        rewrite: (path) => path.replace(/^\/ollama/, ""),
      },
    },
  },
  build: { rollupOptions: { output: { manualChunks: { three: ["three"] } } } },
});
