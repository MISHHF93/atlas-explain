/**
 * The live site's rewrites (firebase.json → hosting.rewrites), matched the way Firebase Hosting
 * matches them for these simple patterns: an exact path, or a "/prefix/**" glob. vite.config.ts
 * applies them in the dev and preview servers, so local routes are the live routes.
 */
export interface HostingRewrite {
  source: string;
  destination: string;
}

export function rewriteFor(pathname: string, rewrites: readonly HostingRewrite[]): string | null {
  for (const r of rewrites) {
    const hit = r.source.endsWith("/**") ? pathname.startsWith(r.source.slice(0, -2)) : pathname === r.source || pathname === `${r.source}/`;
    if (hit) return r.destination;
  }
  return null;
}
