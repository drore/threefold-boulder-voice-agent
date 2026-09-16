import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const LOCAL_API_ORIGIN = "http://127.0.0.1:3001";
const LOCAL_WEB_PORT = 5173;

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/web",
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: LOCAL_WEB_PORT,
    strictPort: true,
    proxy: {
      "/api": LOCAL_API_ORIGIN,
    },
  },
});
