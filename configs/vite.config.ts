import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { resolveAppVersion } from "./appVersion";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  root: rootDir,
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(resolveAppVersion()),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
