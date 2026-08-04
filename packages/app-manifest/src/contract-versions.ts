/**
 * The contract versions a Voyant runtime implements, in one place.
 *
 * An app is compatible with a runtime along several independent axes, each
 * versioned in its own currency: the HTTP surface it calls, the manifest it
 * authored, the admin extension protocol its frame speaks, and the event
 * contracts its webhooks receive. A publisher pins these; the platform checks
 * them when it admits a release.
 *
 * Every value here is derived from the constant that owns it. That is the
 * point of the file: these versions were previously restated as literals
 * wherever a check needed them — including in a different repository, where
 * `"2026-07-01"` and `"1"` were typed by hand next to the Framework version —
 * so nothing connected a bump to the checks that were supposed to enforce it.
 * Read this object instead of writing the string.
 *
 * Two axes a release also declares are deliberately absent:
 *
 * - the **release envelope format** belongs to the Marketplace, which produces
 *   the artifact. The runtime never authors one.
 * - the **Framework version** is an internal build identity. It is recorded in
 *   a release's provenance and it must not gate anything a publisher declares:
 *   it moves every release, and no publisher can tell which of those releases
 *   touched anything they depend on.
 */
// The narrow subpath, not the package root: this module is read by the control
// plane inside a Worker, which has no use for the SDK's iframe client.
import { ADMIN_UI_EXTENSION_API_VERSION } from "@voyant-travel/admin-extension-sdk/version"
import { VOYANT_EVENT_CATALOG_SCHEMA_VERSION } from "@voyant-travel/graph-contracts"
import { APP_MANIFEST_SCHEMA_VERSION } from "./contracts.js"

/**
 * The dated `/v1/app/*` surface an installed app calls.
 *
 * Dated rather than semver because it is consumed over HTTP by publishers who
 * install no packages, so a package range would describe nothing they have.
 * Bump by publishing a new date and supporting both until the old one retires;
 * a release declares the dates it was built against and the runtime honours
 * any it still serves.
 */
export const APP_API_VERSION = "2026-07-01"

/**
 * The admin UI-extension protocol major an extension frame negotiates.
 *
 * The SDK carries a full semver (`ADMIN_UI_EXTENSION_API_VERSION`) because a
 * manifest declares a *range* against it and the host evaluates that range at
 * render time. Compatibility between a release and a runtime is coarser: it is
 * the major, because that is what a breaking protocol change moves. Deriving
 * it here means the two can never claim different numbers.
 */
export const ADMIN_UI_EXTENSION_API_MAJOR = extractMajor(ADMIN_UI_EXTENSION_API_VERSION)

function extractMajor(version: string): string {
  const major = version.split(".")[0]
  if (!major || !/^\d+$/.test(major)) {
    throw new Error(`Admin UI extension API version "${version}" is not a semver version.`)
  }
  return major
}

/** Every contract version this runtime implements, keyed by axis. */
export const VOYANT_APP_CONTRACT_VERSIONS = {
  appApiVersion: APP_API_VERSION,
  manifestSchemaVersion: APP_MANIFEST_SCHEMA_VERSION,
  eventSchemaVersion: VOYANT_EVENT_CATALOG_SCHEMA_VERSION,
  adminExtensionVersion: ADMIN_UI_EXTENSION_API_MAJOR,
} as const

export type VoyantAppContractVersions = typeof VOYANT_APP_CONTRACT_VERSIONS
