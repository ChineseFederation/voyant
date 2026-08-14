import type { Hono } from "hono"

import type { ApiExtension, ApiModule } from "./module.js"
import { resolveSurfaceMountPath } from "./mount-paths.js"

/**
 * Assemble the anonymous-access allow-list (ADR-0008) from module/extension
 * `anonymous` declarations, unioned with any explicit `publicPaths` the
 * deployment still passes (the escape hatch — e.g. plugin/webhook routes that
 * aren't owned by a module, like a payment-processor callback).
 *
 * For each declaring unit the public mount is `resolveSurfaceMountPath` of its
 * `publicPath`/name under `/v1/public`. `anonymous: true` opens the whole mount;
 * a string array opens specific sub-paths relative to it. Pure and sorted for a
 * deterministic, snapshot-auditable result; the global list is what `requireAuth`
 * matches to skip auth and mark the request as explicitly anonymous.
 */
export function assembleAnonymousPaths(
  modules: readonly ApiModule[],
  extensions: readonly ApiExtension[],
  explicit: readonly string[] = [],
): string[] {
  const paths = new Set<string>(explicit)

  const add = (mount: string, anonymous: boolean | readonly string[] | undefined): void => {
    if (!anonymous) return
    if (anonymous === true) {
      paths.add(mount)
      return
    }
    for (const sub of anonymous) {
      const trimmed = sub.trim().replace(/^\/+|\/+$/g, "")
      paths.add(trimmed ? `${mount}/${trimmed}` : mount)
    }
  }

  // Inbound webhook routes are unauthenticated by construction (the handler
  // verifies the provider signature), so their concrete absolute paths are
  // auto-added to the allow-list — no per-deployment `publicPaths` entry. Mounted
  // at `/v1/{name}`, matching the mount in `app.ts`. Parameterized/wildcard paths
  // are skipped (the literal `matchesPublicPath` matcher can't match them) and
  // must be declared via `anonymous` if ever needed.
  // biome-ignore lint/suspicious/noExplicitAny: Hono sub-apps have varied env generics -- owner: hono; mirrors the ApiModule.webhookRoutes suppression.
  const addWebhooks = (name: string, routes: Hono<any> | undefined): void => {
    if (!routes) return
    for (const route of routes.routes) {
      const path = route.path
      if (path.includes(":") || path.includes("*")) continue
      const trimmed = path.replace(/\/+$/g, "")
      paths.add(`/v1/${name}${trimmed === "/" ? "" : trimmed}`)
    }
  }

  for (const m of modules) {
    add(resolveSurfaceMountPath("/v1/public", m.publicPath, m.module.name), m.anonymous)
    addWebhooks(m.module.name, m.webhookRoutes)
  }
  for (const e of extensions) {
    add(resolveSurfaceMountPath("/v1/public", e.publicPath, e.extension.module), e.anonymous)
    addWebhooks(e.extension.module, e.webhookRoutes)
  }

  return [...paths].sort()
}

/**
 * Assemble the publishable-key allow-list from module/extension `publishable`
 * declarations, unioned with any absolute paths the deployment declares
 * explicitly (the same escape hatch `publicPaths` is for — an unowned route,
 * such as a processor callback mounted outside a module).
 *
 * This list is the ONLY thing that makes a route reachable with a `vpk_` key.
 * Unlike {@link assembleAnonymousPaths}, an empty result is meaningful rather
 * than merely quiet: it denies the whole public surface to publishable keys.
 * That is the fail-closed default the capability line depends on — a route
 * nobody classified must not be callable with a credential that ships in a
 * browser bundle.
 */
export function assemblePublishablePaths(
  modules: readonly ApiModule[],
  extensions: readonly ApiExtension[],
  explicit: readonly string[] = [],
): string[] {
  return assemblePublicMountDeclaration(modules, extensions, (unit) => unit.publishable, explicit)
}

/**
 * Assemble the guarded-intake list: public paths that capture person data with
 * nothing challenging the submitter. A publishable key reaches these only on a
 * deployment that has an intake guard configured, so they are deliberately NOT
 * part of {@link assemblePublishablePaths} — a deployment with no guard must
 * see them as secret-key-only without anyone having to remember to remove them.
 */
export function assembleGuardedIntakePaths(
  modules: readonly ApiModule[],
  extensions: readonly ApiExtension[],
  explicit: readonly string[] = [],
): string[] {
  return assemblePublicMountDeclaration(modules, extensions, (unit) => unit.guardedIntake, explicit)
}

/**
 * Resolve one `boolean | string[]` declaration across every unit into absolute
 * paths under `/v1/public`. Shared so `anonymous`, `publishable` and
 * `guardedIntake` cannot drift in how they interpret the same shape.
 */
function assemblePublicMountDeclaration(
  modules: readonly ApiModule[],
  extensions: readonly ApiExtension[],
  select: (unit: ApiModule | ApiExtension) => boolean | readonly string[] | undefined,
  explicit: readonly string[],
): string[] {
  const paths = new Set<string>(explicit)

  const add = (mount: string, declaration: boolean | readonly string[] | undefined): void => {
    if (!declaration) return
    if (declaration === true) {
      paths.add(mount)
      return
    }
    for (const sub of declaration) {
      const trimmed = sub.trim().replace(/^\/+|\/+$/g, "")
      paths.add(trimmed ? `${mount}/${trimmed}` : mount)
    }
  }

  for (const m of modules) {
    add(resolveSurfaceMountPath("/v1/public", m.publicPath, m.module.name), select(m))
  }
  for (const e of extensions) {
    add(resolveSurfaceMountPath("/v1/public", e.publicPath, e.extension.module), select(e))
  }

  return [...paths].sort()
}

/**
 * Assemble anonymous paths that use mixed auth: valid customer sessions are
 * resolved, while requests without a valid session continue as explicit guests.
 */
export function assembleOptionalCustomerAuthPaths(
  modules: readonly ApiModule[],
  extensions: readonly ApiExtension[],
): string[] {
  const paths = new Set<string>()
  const add = (mount: string, declaration: boolean | readonly string[] | undefined): void => {
    if (!declaration) return
    if (declaration === true) {
      paths.add(mount)
      return
    }
    for (const sub of declaration) {
      const trimmed = sub.trim().replace(/^\/+|\/+$/g, "")
      paths.add(trimmed ? `${mount}/${trimmed}` : mount)
    }
  }
  for (const module of modules) {
    add(
      resolveSurfaceMountPath("/v1/public", module.publicPath, module.module.name),
      module.optionalCustomerAuth,
    )
  }
  for (const extension of extensions) {
    add(
      resolveSurfaceMountPath("/v1/public", extension.publicPath, extension.extension.module),
      extension.optionalCustomerAuth,
    )
  }
  return [...paths].sort()
}
