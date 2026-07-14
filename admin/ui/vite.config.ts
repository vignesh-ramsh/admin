import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base MUST match the prefix admin mounts this SPA under (arc.gateway
// .mount_spa(dist, prefix="admin-desk") in admin/__init__.py). It makes
// the built index.html reference its assets as /admin-desk/assets/...
// rather than /assets/..., so they resolve through Gateway's SPA mount
// instead of 404ing at the site root.
export default defineConfig({
  base: "/admin-desk/",
  plugins: [react()],
  server: {
    // Dev-mode convenience: `npm run dev` proxies API calls straight to a
    // running `arc gateway serve` (default :8000), so the SPA can talk to
    // real endpoints without CORS while iterating. Production serves the
    // built dist/ through Gateway itself, where same-origin makes this moot.
    proxy: {
      "/api": "http://127.0.0.1:8000",
      "/login": "http://127.0.0.1:8000",
    },
  },
});
