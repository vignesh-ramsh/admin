import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// base MUST match the prefix admin mounts this SPA under
// (arc.gateway.mount_spa(dist, prefix="admin") in admin/__init__.py).
const apiTarget = process.env.VITE_ARC_API || "http://127.0.0.1:8000";

export default defineConfig({
  base: "/admin/",
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": apiTarget,
      "/login": apiTarget,
      "/logout": apiTarget,
      "/whoami": apiTarget,
      "/refresh": apiTarget,
      "/me": apiTarget,
      "/impersonate": apiTarget,
      "/files": apiTarget,
      "/forgot-password": apiTarget,
      "/reset-password": apiTarget,
    },
  },
});
