import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base MUST match the prefix admin mounts this SPA under (arc.gateway
// .mount_spa(dist, prefix="admin-desk") in admin/__init__.py). It makes
// the built index.html reference its assets as /admin-desk/assets/...
// rather than /assets/..., so they resolve through Gateway's SPA mount
// instead of 404ing at the site root.
// Dev-mode API target: a running `arc gateway serve`. Defaults to :8000
// (gateway's own default port); override with VITE_ARC_API when the
// backend runs elsewhere, e.g. `VITE_ARC_API=http://127.0.0.1:8812 npm run dev`.
const apiTarget = process.env.VITE_ARC_API || "http://127.0.0.1:8000";

export default defineConfig({
  base: "/admin-desk/",
  plugins: [react()],
  server: {
    // The SPA calls same-origin /api and /login; in dev these proxy to a
    // real gateway so it can talk to real endpoints without CORS while
    // iterating. Production serves the built dist/ through Gateway itself,
    // where same-origin makes this moot.
    proxy: {
      "/api": apiTarget,
      "/login": apiTarget,
      "/logout": apiTarget,
      "/forgot-password": apiTarget,
      "/reset-password": apiTarget,
    },
  },
});
