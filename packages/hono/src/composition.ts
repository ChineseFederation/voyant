import type { ApiExtension, ApiModule } from "./module.js"

/**
 * Manifest-driven runtime composition.
 *
 * The `voyant.config.ts` manifest already drives the migration/schema side
 * (see `@voyant-travel/cli` `db doctor` and `docs/architecture/migration-resilience-rfc.md`).
 * This module lets the SAME manifest drive runtime composition: instead of a
 * template hand-listing `createApp({ modules, extensions })`, it registers a
 * factory per manifest entry and derives the arrays from the manifest.
 *
 * The factories receive a typed **capability container** — the template's
 * deployment-specific capabilities (storage, FX, notification providers,
 * document-download resolvers, …) gathered in one place. Because Voyant runs
 * on Cloudflare Workers (per-request `bindings`), capabilities are typically
 * bindings-deferred closures (`(bindings) => T`), so the container is a plain
 * typed value resolved per request rather than a boot-time singleton.
 */

/** A manifest entry: a bare specifier or `{ resolve, options }`. */
export type CompositionEntry = string | { resolve: string; options?: Record<string, unknown> }

/** The subset of `VoyantConfig` this composer reads. */
export interface CompositionManifest {
  modules?: CompositionEntry[]
  extensions?: CompositionEntry[]
}

/** Context handed to every factory: the capability container + per-entry options. */
export interface CompositionContext<TCapabilities> {
  capabilities: TCapabilities
  options: Record<string, unknown>
}

export type ModuleFactory<TCapabilities> = (
  ctx: CompositionContext<TCapabilities>,
) => ApiModule | ApiModule[]
export type ExtensionFactory<TCapabilities> = (
  ctx: CompositionContext<TCapabilities>,
) => ApiExtension

/**
 * Maps manifest specifiers to the factory that builds the runtime unit. Keys
 * MUST match the `voyant.config.ts` `modules` / `extensions` specifiers.
 */
export interface CompositionRegistry<TCapabilities> {
  modules: Record<string, ModuleFactory<TCapabilities>>
  extensions?: Record<string, ExtensionFactory<TCapabilities>>
}

export interface ComposedApp {
  modules: ApiModule[]
  extensions: ApiExtension[]
}

function normalizeEntry(entry: CompositionEntry): {
  resolve: string
  options: Record<string, unknown>
} {
  if (typeof entry === "string") return { resolve: entry, options: {} }
  return { resolve: entry.resolve, options: entry.options ?? {} }
}

/**
 * Derive the `createApp({ modules, extensions })` arrays from a manifest by
 * looking each entry up in the registry, **preserving manifest order** (mount
 * + hook-registration order is significant). Throws if the manifest lists an
 * entry the registry has no factory for — so "added to the manifest but not
 * wired" fails loudly at boot rather than silently dropping a module.
 */
export function composeFromManifest<TCapabilities>(
  manifest: CompositionManifest,
  registry: CompositionRegistry<TCapabilities>,
  capabilities: TCapabilities,
): ComposedApp {
  const modules = (manifest.modules ?? []).flatMap((entry) => {
    const { resolve, options } = normalizeEntry(entry)
    const factory = registry.modules[resolve]
    if (!factory) {
      throw new Error(
        `composeFromManifest: no module factory registered for "${resolve}". ` +
          "Add it to the composition registry, or remove it from voyant.config modules.",
      )
    }
    return factory({ capabilities, options })
  })

  const extensions = (manifest.extensions ?? []).map((entry) => {
    const { resolve, options } = normalizeEntry(entry)
    const factory = registry.extensions?.[resolve]
    if (!factory) {
      throw new Error(
        `composeFromManifest: no extension factory registered for "${resolve}". ` +
          "Add it to the composition registry, or remove it from voyant.config extensions.",
      )
    }
    return factory({ capabilities, options })
  })

  return { modules, extensions }
}

export interface ManifestRegistryDiff {
  /** In the manifest but with no registered factory. */
  missingFactories: string[]
  /** Registered factories not referenced by the manifest. */
  orphanFactories: string[]
}

/**
 * Pure parity check between a manifest's entries and a registry's keys, for
 * tooling (`voyant db doctor`). Reports manifest entries with no factory and
 * factories the manifest never references.
 */
export function diffManifestRegistry(
  manifestEntries: CompositionEntry[],
  registryKeys: string[],
): ManifestRegistryDiff {
  const manifest = new Set(manifestEntries.map((e) => normalizeEntry(e).resolve))
  const registry = new Set(registryKeys)
  return {
    missingFactories: [...manifest].filter((name) => !registry.has(name)).sort(),
    orphanFactories: [...registry].filter((name) => !manifest.has(name)).sort(),
  }
}
