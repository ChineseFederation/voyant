import assert from "node:assert/strict"
import test from "node:test"
import {
  inspectBookingsRuntimeAuthority,
  simulateDirectMergeCycles,
} from "../lib/bookings-runtime-authority.mjs"

const policy = {
  packageName: "@test/bookings",
  removedPackageName: "@test/bookings-node-adapter",
  runtimeFactory: "createBookingsRuntimePortContribution",
  forbiddenProductionDependencies: [
    "@test/accommodations",
    "@test/finance",
    "@test/inventory",
    "@test/relationships",
    "@test/commerce",
    "@test/distribution",
  ],
  providers: [
    ["bookingsAccommodationRuntimePort", "accommodations"],
    ["bookingsFinanceRuntimePort", "finance"],
    ["bookingsInventoryRuntimePort", "inventory"],
    ["bookingsRelationshipsRuntimePort", "relationships"],
  ].map(([port, name]) => ({ port, file: `packages/${name}/src/runtime-contributor.ts` })),
}

test("accepts package-owned authority with static domain providers", () => {
  assert.deepEqual(
    inspectBookingsRuntimeAuthority({ files: validFiles(), manifests: validManifests(), policy }),
    [],
  )
})

test("simulates every direct-merge cycle and rejects the dependency edges", () => {
  const manifests = validManifests()
  const cycles = simulateDirectMergeCycles(
    manifests,
    policy.packageName,
    policy.forbiddenProductionDependencies,
  )
  assert.deepEqual(
    cycles.map((cycle) => cycle[1]),
    policy.forbiddenProductionDependencies,
  )

  const bookings = manifests.find(({ name }) => name === policy.packageName)
  bookings.dependencies = Object.fromEntries(
    policy.forbiddenProductionDependencies.map((name) => [name, "workspace:^"]),
  )
  const violations = inspectBookingsRuntimeAuthority({ files: validFiles(), manifests, policy })
  for (const dependency of policy.forbiddenProductionDependencies) {
    assert(violations.includes(`Bookings must not depend on provider package ${dependency}`))
  }
})

test("rejects a host module loader or starter-owned provider", () => {
  const files = validFiles()
  files.set("packages/core/src/runtime-host.ts", "modules: { import(specifier) {} }")
  files.set("packages/runtime/src/deployment-resources.ts", "bookingsFinanceRuntimePort")
  const violations = inspectBookingsRuntimeAuthority({ files, manifests: validManifests(), policy })
  assert(violations.includes("Runtime composition must not use a host module loader"))
  assert(violations.includes("Operator host must not bind bookingsFinanceRuntimePort"))
})

function validManifests() {
  return [
    {
      name: policy.packageName,
      dependencies: { "@test/core": "workspace:^" },
      exports: { "./runtime-contributor": "./src/runtime-contributor.ts" },
      voyant: {
        runtime: { entry: "./runtime-contributor", export: policy.runtimeFactory },
      },
    },
    { name: "@test/accommodations", dependencies: { "@test/finance": "workspace:^" } },
    { name: "@test/finance", dependencies: { "@test/bookings": "workspace:^" } },
    { name: "@test/inventory", dependencies: { "@test/relationships": "workspace:^" } },
    { name: "@test/relationships", dependencies: { "@test/commerce": "workspace:^" } },
    { name: "@test/commerce", dependencies: { "@test/distribution": "workspace:^" } },
    { name: "@test/distribution", dependencies: { "@test/bookings": "workspace:^" } },
    { name: "@test/core" },
  ]
}

function validFiles() {
  const files = new Map([
    [
      "packages/bookings/src/runtime-contributor.ts",
      "actionLedgerBookingDriftRuntimePort createBookingsRuntimePortContribution",
    ],
    [
      "packages/bookings/src/runtime.ts",
      "createBookingsRuntime createBookingRequirementsRuntime customFields.resolveRegistry relationships.upsertPersonFromContact accommodation.enrichOverviewItems inventory.resolveProductSnapshot",
    ],
    [
      "packages/bookings/src/runtime-port.ts",
      policy.providers.map(({ port }) => `export const ${port}`).join("\n"),
    ],
    [
      "packages/bookings/src/voyant.ts",
      policy.providers.map(({ port }) => `requirePort(${port})`).join("\n"),
    ],
    ["packages/runtime/src/deployment-resources.ts", "generic primitives"],
    ["packages/core/src/runtime-host.ts", "database env storage events config"],
  ])
  for (const { port, file } of policy.providers) files.set(file, `[${port}.id]`)
  return files
}
