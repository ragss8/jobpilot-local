import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/ollama": {
        target: "http://127.0.0.1:11434",
        rewrite: (path) => path.replace(/^\/ollama/, ""),
      },
    },
  },
  preview: {
    proxy: {
      "/ollama": {
        target: "http://127.0.0.1:11434",
        rewrite: (path) => path.replace(/^\/ollama/, ""),
      },
    },
  },
  build: { rollupOptions: { output: { manualChunks: { three: ["three"] } } } },
});
