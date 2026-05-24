import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const packageDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(packageDir, "../..");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@anilkrblt/runtime": resolve(rootDir, "packages/runtime/src/index.tsx"),
    },
    dedupe: ["react", "react-dom"],
  },
  server: {
    fs: {
      allow: [rootDir],
    },
  },
});
