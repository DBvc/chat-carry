import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "chrome120",
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
  },
});
