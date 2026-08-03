/**
 * Plugins — optional distributable bundles that group modules, extensions,
 * event subscribers, and link definitions into a single unit.
 *
 * A plugin is the unit of "distribution" in Voyant: a customer, vendor, or
 * integrator ships a plugin package and it can be registered alongside core
 * modules without touching the framework itself. It is not the default runtime
 * customization unit — modules, providers, extensions, subscribers, and jobs should be
 * preferred when a smaller seam fits.
 *
 * Core plugins do not carry HTTP routes — they contain {@link Module} and
 * {@link Extension} values. The API runtime in `@voyant-travel/hono` layers
 * {@link ApiBundle}-style route contributions on top of this contract.
 */

import type { EventBus, EventHandler, EventMetadata } from "./events.js"
import type { LinkDefinition } from "./links.js"
import type { BootstrapHandler, Extension, Module } from "./module.js"

/**
 * A single event subscription contributed by a plugin.
 *
 * When the plugin is registered, `handler` is attached to the provided
 * {@link EventBus} for the given `event` name.
 */
export interface Subscriber<
  TData = unknown,
  TMetadata extends EventMetadata | undefined = EventMetadata | undefined,
> {
  /** Event name, following `<resource>.<pastTenseAction>` convention. */
  event: string
  /** Callback invoked when the event is emitted. */
  handler: EventHandler<TData, TMetadata>
  /**
   * When `true`, the handler completes before `emit()` resolves even on
   * runtimes that defer subscriber work past the HTTP response. Reserve
   * for handlers whose side effects must be read-your-writes visible
   * within the emitting request. Default deferrable.
   */
  inline?: boolean
}

/**
 * A transport-agnostic plugin bundle.
 *
 * Plugins contribute any combination of:
 * - {@link Module} values (core domain primitives)
 * - {@link Extension} values (hook attachments to existing modules)
 * - {@link Subscriber} values (event listeners)
 * - {@link LinkDefinition} values (cross-module associations)
 *
 * The server API runtime intersects this shape with its route fields; see
 * `ApiBundle` in `@voyant-travel/hono`.
 */
export interface Plugin {
  /** Unique identifier (e.g. "netopia", "bokun"). */
  name: string
  /** Optional version tag for diagnostics. */
  version?: string
  /**
   * Optional lazy runtime bootstrap executed once per app/isolate, on the
   * first request where bindings are available.
   */
  bootstrap?: BootstrapHandler
  /** Modules contributed by the plugin. */
  modules?: Module[]
  /** Extensions contributed by the plugin. */
  extensions?: Extension[]
  /** Event subscribers wired to the caller's {@link EventBus} at registration. */
  subscribers?: Subscriber[]
  /** Link definitions contributed by the plugin. */
  links?: LinkDefinition[]
}

/**
 * Identity helper that returns the plugin as-is. Exists purely so authors
 * can write `definePlugin({ ... })` and get inference + IDE help without
 * casting.
 */
export function definePlugin<P extends Plugin>(plugin: P): P {
  return plugin
}

/**
 * Result of flattening a set of plugins.
 */
export interface RegisteredPlugins {
  /** All modules contributed by the supplied plugins, in registration order. */
  modules: Module[]
  /** All extensions contributed by the supplied plugins. */
  extensions: Extension[]
  /** All link definitions contributed by the supplied plugins. */
  links: LinkDefinition[]
  /** All subscribers contributed, in registration order. */
  subscribers: Subscriber[]
  /** Subscription handles for subscribers attached to the event bus. */
  subscriptions: Array<{ unsubscribe(): void }>
}

export interface RegisterPluginsOptions {
  /** Event bus to attach subscribers to. If omitted, subscribers are collected but not wired. */
  eventBus?: EventBus
}

/**
 * Flatten a list of plugins into their constituent pieces and optionally
 * attach event subscribers to an {@link EventBus}.
 *
 * Throws if two plugins declare the same `name`.
 */
export function registerPlugins(
  plugins: ReadonlyArray<Plugin>,
  options: RegisterPluginsOptions = {},
): RegisteredPlugins {
  const seen = new Set<string>()
  const modules: Module[] = []
  const extensions: Extension[] = []
  const links: LinkDefinition[] = []
  const subscribers: Subscriber[] = []
  const subscriptions: Array<{ unsubscribe(): void }> = []

  for (const plugin of plugins) {
    if (seen.has(plugin.name)) {
      throw new Error(`Duplicate plugin name: "${plugin.name}"`)
    }
    seen.add(plugin.name)

    if (plugin.modules) modules.push(...plugin.modules)
    if (plugin.extensions) extensions.push(...plugin.extensions)
    if (plugin.links) links.push(...plugin.links)
    if (plugin.subscribers) {
      for (const sub of plugin.subscribers) {
        subscribers.push(sub)
        if (options.eventBus) {
          subscriptions.push(
            options.eventBus.subscribe(sub.event, sub.handler, { inline: sub.inline ?? false }),
          )
        }
      }
    }
  }

  return { modules, extensions, links, subscribers, subscriptions }
}
