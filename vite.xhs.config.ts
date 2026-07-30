import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "xhs",
  base: "./",
  publicDir: false,
  define: {
    fetch:
      "((..._arguments) => Promise.reject(new Error('Network requests are unavailable in the XHS container')))",
    "process.env.NEXT_PUBLIC_BASE_PATH": JSON.stringify(""),
    "process.env.NEXT_PUBLIC_DEFAULT_LOCALE": JSON.stringify("zh-CN"),
    "process.env.NEXT_PUBLIC_XHS_BUILD": JSON.stringify("true"),
  },
  plugins: [react()],
  build: {
    outDir: "../dist/xhs",
    emptyOutDir: true,
    assetsInlineLimit: 0,
    sourcemap: false,
    target: "es2017",
  },
});
