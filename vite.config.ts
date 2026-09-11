import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/planning-ai": { target: "http://127.0.0.1:11435", rewrite: path => path.replace(/^\/planning-ai/, "") },
      "/ollama": {
        target: "http://127.0.0.1:11434",
        rewrite: (path) => path.replace(/^\/ollama/, ""),
      },
    },
  },
  preview: {
    proxy: {
      "/planning-ai": { target: "http://127.0.0.1:11435", rewrite: path => path.replace(/^\/planning-ai/, "") },
      "/ollama": {
        target: "http://127.0.0.1:11434",
        rewrite: (path) => path.replace(/^\/ollama/, ""),
      },
    },
  },
  build: { rollupOptions: { output: { manualChunks: { three: ["three"] } } } },
});
