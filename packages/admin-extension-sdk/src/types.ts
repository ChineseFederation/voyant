/**
 * Shared value types for the admin UI-extension contract.
 *
 * These shapes are the cross-repo contract between the framework host, the
 * cloud platform (which resolves manifests into {@link UiExtensionDescriptor}),
 * and the author SDK. Keep them dependency-free and serializable — every value
 * here crosses the `postMessage` boundary or is embedded in a resolved
 * descriptor.
 */

/** The organization an extension is rendered for. */
export interface UiExtensionOrg {
  slug: string
  name: string
}

/** The admin user viewing the surface an extension is mounted in. */
export interface UiExtensionViewer {
  id: string
  displayName: string
}

/** The domain record a detail surface is scoped to (null on list/dashboard surfaces). */
export interface UiExtensionEntity {
  type: string
  id: string
}

export type UiExtensionTheme = "light" | "dark"

/** Text direction the host resolved for the active/app locale. */
export type UiExtensionTextDirection = "ltr" | "rtl"

/**
 * Read-only host context handed to an extension at init and on every update.
 * Never carries secrets — the frame is cross-origin and source-checked only.
 */
export interface UiExtensionContext {
  org: UiExtensionOrg
  viewer: UiExtensionViewer
  entity: UiExtensionEntity | null
  theme: UiExtensionTheme
  /**
   * The staff member's active admin locale as a canonical BCP 47 tag. The app
   * may localize its in-frame UI more precisely than the host resolves below.
   */
  locale: string
  /**
   * The locale the host resolved against the installed release's declared
   * locales (exact → language → app default). Host-rendered labels use this.
   */
  appLocale: string
  /** Text direction resolved for {@link appLocale}, so the app need not infer it. */
  direction: UiExtensionTextDirection
}

/**
 * The slots an admin UI extension may target.
 *
 * This is the canonical list. It lives here, in the dependency-free contract
 * package an extension author already installs, because it is part of the
 * public extension surface rather than an internal detail of the shell: the
 * host renders these, the manifest schema validates against them, and an
 * author needs to know them to target one.
 *
 * `@voyant-travel/admin` and `@voyant-travel/apps` both derive from this
 * rather than restating it. Adding a slot is a contract change — it widens
 * what a published manifest may declare, so it belongs to this package's
 * version.
 */
export const ADMIN_UI_EXTENSION_SLOTS = [
  "dashboard.header",
  "dashboard.after-kpis",
  "dashboard.footer",
  "booking.details.header",
  "booking.details.after-summary",
  "invoice.details.header",
  "invoice.details.after-summary",
  "workspace.header.actions",
] as const

/** A slot id from the public UI-extension registry. */
export type AdminUiExtensionSlot = (typeof ADMIN_UI_EXTENSION_SLOTS)[number]

/**
 * A manifest resolved into the shape the host consumes. The cloud platform
 * resolves and validates extension manifests into this; the framework host
 * never parses raw manifests.
 */
export interface UiExtensionDescriptor {
  key: string
  version: string
  displayName: string
  /** Semver RANGE the extension supports (e.g. `"^1"`, `"1.x"`, `"1.2.3"`). */
  extensionApi: string
  /** Absolute URL of the extension bundle mounted in the sandboxed iframe. */
  entryUrl: string
  /** Slot ids this extension targets. */
  slots: string[]
  /** Opaque per-install configuration forwarded to the extension at init. */
  config?: Record<string, unknown>
}

export type UiExtensionToastIntent = "info" | "success" | "error"
