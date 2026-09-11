/** Resolve a root-relative path (e.g. `/models/atlas.json`) against Vite's
 * configured `base`, so the same JSON/JS keeps working whether the app is
 * served from a domain root (Vercel, `vite dev`) or a subpath (a GitHub
 * Pages project site at `<user>.github.io/<repo>/`).
 *
 * Model chunk URLs are baked into the atlas JSON files as root-absolute
 * strings, so this has to run at fetch time rather than at build time. */
export function withBase(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return base + (path.startsWith('/') ? path : `/${path}`);
}
