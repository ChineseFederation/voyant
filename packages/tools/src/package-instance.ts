/**
 * Identity for one loaded copy of this package.
 *
 * Handler admission authenticity is proved by membership in a module-level
 * `WeakSet` (see `handler-action-policy.ts`). That is unforgeable, but it is
 * also *per module evaluation*: a deployment whose dependency graph resolves
 * two copies of `@voyant-travel/tools` gets two independent registries, so an
 * admission minted by one copy is not authentic to the other. Every
 * handler-owned action then fails closed despite correct configuration.
 *
 * That is a packaging fault, not a forgery, and the two must not be reported
 * identically. This module gives each loaded copy a stable identity recorded on
 * a well-known global, so a minted admission can be stamped with the copy that
 * produced it and a failing assertion can name the real cause.
 */

/** Package name, carried on the brand so a stamped admission is self-describing. */
export const TOOLS_PACKAGE_NAME = "@voyant-travel/tools"

/**
 * Well-known key, so every loaded copy shares one ledger. `Symbol.for` is
 * deliberate: a module-private symbol would defeat the entire point.
 */
const INSTANCE_LEDGER_KEY = Symbol.for("@voyant-travel/tools.loadedInstances")

export interface ToolsPackageInstance {
  /** Always {@link TOOLS_PACKAGE_NAME}. */
  readonly package: string
  /** 1-based load order of this module evaluation within the process. */
  readonly instance: number
}

interface ToolsPackageInstanceLedger {
  readonly instances: ToolsPackageInstance[]
}

function instanceLedger(): ToolsPackageInstanceLedger {
  const host = globalThis as typeof globalThis & {
    [INSTANCE_LEDGER_KEY]?: ToolsPackageInstanceLedger
  }
  const existing = host[INSTANCE_LEDGER_KEY]
  if (existing) return existing
  const created: ToolsPackageInstanceLedger = { instances: [] }
  Object.defineProperty(host, INSTANCE_LEDGER_KEY, {
    value: created,
    enumerable: false,
    configurable: false,
    writable: false,
  })
  return created
}

function registerThisInstance(): ToolsPackageInstance {
  const ledger = instanceLedger()
  const identity: ToolsPackageInstance = Object.freeze({
    package: TOOLS_PACKAGE_NAME,
    instance: ledger.instances.length + 1,
  })
  ledger.instances.push(identity)
  return identity
}

/**
 * This module evaluation's identity. Distinct for every loaded copy of the
 * package, and stable for the life of the process.
 */
export const TOOLS_PACKAGE_INSTANCE: ToolsPackageInstance = registerThisInstance()

/** How many copies of this package have been evaluated in this process. */
export function loadedToolsPackageInstanceCount(): number {
  return instanceLedger().instances.length
}

/**
 * Whether this process has evaluated more than one copy of the package.
 *
 * Only copies carrying this module can be counted. A copy predating it is
 * invisible here, which is why the admission brand is also checked directly.
 */
export function isToolsPackageDuplicated(): boolean {
  return loadedToolsPackageInstanceCount() > 1
}

export const DUPLICATE_TOOLS_INSTANCE_REMEDIATION = [
  `This deployment resolves more than one copy of ${TOOLS_PACKAGE_NAME}. Handler-owned action admissions are authentic only to the copy that minted them, so they fail closed across copies.`,
  `Deduplicate the install (\`pnpm why ${TOOLS_PACKAGE_NAME}\` / inspect the lockfile) so every package resolves the same copy, then redeploy.`,
] as const

let warned = false

/**
 * Report a duplicated install once per loaded copy.
 *
 * This warns rather than throws. A duplicated graph can be entirely functional
 * — it only breaks where an admission crosses copies — and refusing to boot
 * would turn a latent packaging fault into an outage. Deployments that want the
 * stricter posture call {@link assertSingleToolsPackageInstance} at startup.
 */
export function warnOnDuplicateToolsPackageInstance(): void {
  if (warned || !isToolsPackageDuplicated()) return
  warned = true
  console.error(
    `[${TOOLS_PACKAGE_NAME}] ${loadedToolsPackageInstanceCount()} copies of this package are loaded. ${DUPLICATE_TOOLS_INSTANCE_REMEDIATION.join(" ")}`,
  )
}

/**
 * Fail loudly at boot when the package is duplicated.
 *
 * Intended for a deployment's startup path, where failing on a packaging fault
 * is better than failing on the first destructive Tool call.
 */
export function assertSingleToolsPackageInstance(): void {
  if (!isToolsPackageDuplicated()) return
  throw new Error(
    `${loadedToolsPackageInstanceCount()} copies of ${TOOLS_PACKAGE_NAME} are loaded. ${DUPLICATE_TOOLS_INSTANCE_REMEDIATION.join(" ")}`,
  )
}
