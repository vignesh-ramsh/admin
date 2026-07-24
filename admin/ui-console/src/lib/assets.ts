/** Static asset URLs, resolved against Vite's configured `base` (the
 *  `/admin/` SPA mount prefix — see vite.config.ts) rather than the site
 *  root. A literal `"/arc.svg"` in JSX is NOT rewritten by Vite the way
 *  index.html's own asset references are (that rewrite only happens at
 *  HTML-transform time); at runtime it always resolves against `/`, which
 *  404s once this app is served from anywhere but the root. */
export const ARC_LOGO_URL = `${import.meta.env.BASE_URL}arc.svg`;
