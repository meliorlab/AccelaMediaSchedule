import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Emit the production build to a top-level `public/` folder (Vercel's default
  // output directory) so no custom outputDirectory config is needed.
  build: {
    outDir: resolve(__dirname, "../public"),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "../shared/src"),
    },
  },
  server: {
    port: 5173,
    fs: {
      allow: [resolve(__dirname, ".."), resolve(__dirname, "../shared")],
    },
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
