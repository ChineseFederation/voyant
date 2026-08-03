import type { ApiExtension, ApiModule } from "./module.js"
import { resolveSurfaceMountPath } from "./mount-paths.js"

/**
 * Assemble the absolute paths whose public POST reads participate in the
 * body-keyed response cache (ADR 0021 §2).
 *
 * A `Cache-Control` header cannot carry this declaration on its own: the
 * middleware has to decide whether to read and canonicalize the request body
 * BEFORE the route runs, and the header only exists on the way back. So
 * participation is declared at mount time next to the routes it describes —
 * the same shape as `anonymous` and `optionalCustomerAuth` — while the policy
 * itself (TTL, stale-while-revalidate) still lives on the response, which is
 * what lets an edge tier honour the same declaration.
 *
 * Declaring a path only makes it eligible. A response that does not mark
 * itself `public, s-maxage=…` is still never stored.
 */
export function assembleBodyKeyedCachePaths(
  modules: readonly ApiModule[],
  extensions: readonly ApiExtension[],
): string[] {
  const paths = new Set<string>()

  const add = (mount: string, declaration: readonly string[] | undefined): void => {
    if (!declaration) return
    for (const sub of declaration) {
      const trimmed = sub.trim().replace(/^\/+|\/+$/g, "")
      paths.add(trimmed ? `${mount}/${trimmed}` : mount)
    }
  }

  for (const m of modules) {
    add(resolveSurfaceMountPath("/v1/public", m.publicPath, m.module.name), m.bodyKeyedCache)
  }
  for (const e of extensions) {
    add(resolveSurfaceMountPath("/v1/public", e.publicPath, e.extension.module), e.bodyKeyedCache)
  }

  return [...paths].sort()
}
