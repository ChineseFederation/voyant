import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, it } from "node:test"

import {
  packageRecordsFromPnpmLockfile,
  readPnpmLockfilePackageRecords,
} from "../lib/deployment-graph-provenance.mjs"

const lockfile = `
lockfileVersion: '9.0'

importers:
  packages/framework:
    dependencies:
      '@voyant-travel/bookings':
        specifier: workspace:*
        version: link:../bookings
      '@voyant-travel/cloud-sdk':
        specifier: ^0.11.0
        version: 0.11.0(typesense@3.0.6)
  apps/operator:
    dependencies:
      '@voyant-travel/plugin-netopia':
        specifier: ^0.105.18
        version: 0.105.18(@types/pg@8.20.0)(postgres@3.4.9)

packages:
  '@voyant-travel/cloud-sdk@0.11.0':
    resolution: {integrity: sha512-cloud}
  '@voyant-travel/plugin-netopia@0.105.18':
    resolution: {integrity: sha512-netopia}
`

describe("deployment graph package provenance", () => {
  it("derives workspace and registry package records from pnpm lockfile importers", () => {
    const records = packageRecordsFromPnpmLockfile(lockfile, {
      packageNames: [
        "@voyant-travel/plugin-netopia",
        "@voyant-travel/bookings",
        "@acme/custom-module",
      ],
      workspacePackageVersions: {
        "@voyant-travel/bookings": "0.149.0",
      },
    })

    assert.deepEqual(records, [
      {
        packageName: "@acme/custom-module",
        source: { kind: "unknown" },
      },
      {
        packageName: "@voyant-travel/bookings",
        version: "0.149.0",
        source: { kind: "workspace", reference: "link:../bookings" },
      },
      {
        packageName: "@voyant-travel/plugin-netopia",
        version: "0.105.18",
        source: {
          kind: "registry",
          reference:
            "pnpm-lock:@voyant-travel/plugin-netopia@0.105.18(@types/pg@8.20.0)(postgres@3.4.9)",
          integrity: "sha512-netopia",
        },
      },
    ])
  })

  it("can scope provenance to selected pnpm importers", () => {
    const records = packageRecordsFromPnpmLockfile(lockfile, {
      packageNames: ["@voyant-travel/plugin-netopia"],
      importerPaths: ["packages/framework"],
    })

    assert.deepEqual(records, [
      {
        packageName: "@voyant-travel/plugin-netopia",
        source: { kind: "unknown" },
      },
    ])
  })

  it("attaches normalized v1 workspace package metadata and ignores legacy voyant blocks", () => {
    const records = packageRecordsFromPnpmLockfile(lockfile, {
      packageNames: [
        "@voyant-travel/bookings",
        "@voyant-travel/legacy",
        "@voyant-travel/plugin-netopia",
      ],
      workspacePackageVersions: {
        "@voyant-travel/bookings": "0.149.0",
        "@voyant-travel/legacy": "0.1.0",
      },
      workspacePackageMetadata: {
        "@voyant-travel/bookings": {
          schemaVersion: "voyant.package.v1",
          kind: "module",
          manifest: " ./voyant ",
          runtime: {
            entry: " ./runtime-contributor ",
            export: " createBookingsRuntimePortContribution ",
          },
          compatibleWith: {
            framework: " ^0.24.0 ",
            targets: " node ",
            modes: ["self-hosted", "invalid", 42, "managed-cloud", "self-hosted"],
          },
          requires: {
            capabilities: ["booking.records", "", "booking.records", 42],
            ports: [
              "db.transaction",
              { id: "payment.provider", optional: true },
              { id: "ignored.optional", optional: "yes" },
              { id: "" },
            ],
          },
          schema: " ./schema ",
          requiresSchemas: ["@voyant-travel/db", "", "@voyant-travel/db"],
        },
        "@voyant-travel/legacy": {
          schema: "./schema",
          requiresSchemas: ["@voyant-travel/db"],
        },
        "@voyant-travel/plugin-netopia": {
          schemaVersion: "voyant.package.v1",
          kind: "adapter",
          compatibleWith: { targets: ["node"] },
        },
      },
    })

    assert.deepEqual(records, [
      {
        packageName: "@voyant-travel/bookings",
        version: "0.149.0",
        source: { kind: "workspace", reference: "link:../bookings" },
        metadata: {
          schemaVersion: "voyant.package.v1",
          kind: "module",
          manifest: "./voyant",
          runtime: {
            entry: "./runtime-contributor",
            export: "createBookingsRuntimePortContribution",
          },
          compatibleWith: {
            framework: "^0.24.0",
            targets: ["node"],
            modes: ["self-hosted", "managed-cloud"],
          },
          requires: {
            capabilities: ["booking.records"],
            ports: [
              { id: "db.transaction" },
              { id: "payment.provider", optional: true },
              { id: "ignored.optional" },
            ],
          },
          schema: "./schema",
          requiresSchemas: ["@voyant-travel/db"],
        },
      },
      {
        packageName: "@voyant-travel/legacy",
        version: "0.1.0",
        source: { kind: "unknown" },
      },
      {
        packageName: "@voyant-travel/plugin-netopia",
        version: "0.105.18",
        source: {
          kind: "registry",
          reference:
            "pnpm-lock:@voyant-travel/plugin-netopia@0.105.18(@types/pg@8.20.0)(postgres@3.4.9)",
          integrity: "sha512-netopia",
        },
        metadata: {
          schemaVersion: "voyant.package.v1",
          kind: "adapter",
          compatibleWith: {
            targets: ["node"],
          },
        },
      },
    ])
  })

  it("attaches explicit v1 metadata overrides to registry package records", () => {
    const records = packageRecordsFromPnpmLockfile(lockfile, {
      packageNames: ["@voyant-travel/plugin-netopia"],
      packageMetadata: {
        "@voyant-travel/plugin-netopia": {
          schemaVersion: "voyant.package.v1",
          kind: "plugin",
          compatibleWith: {
            framework: ">=0.26.0",
            targets: ["node", "voyant-cloud"],
            modes: ["local", "managed-cloud", "self-hosted"],
          },
        },
      },
    })

    assert.deepEqual(records, [
      {
        packageName: "@voyant-travel/plugin-netopia",
        version: "0.105.18",
        source: {
          kind: "registry",
          reference:
            "pnpm-lock:@voyant-travel/plugin-netopia@0.105.18(@types/pg@8.20.0)(postgres@3.4.9)",
          integrity: "sha512-netopia",
        },
        metadata: {
          schemaVersion: "voyant.package.v1",
          kind: "plugin",
          compatibleWith: {
            framework: ">=0.26.0",
            targets: ["node", "voyant-cloud"],
            modes: ["local", "managed-cloud", "self-hosted"],
          },
        },
      },
    ])
  })

  it("reads manifest metadata from an installed registry package", () => {
    const repoRoot = mkdtempSync(path.join(tmpdir(), "voyant-provenance-"))
    const projectRoot = path.join(repoRoot, "apps", "operator")
    const packageRoot = path.join(projectRoot, "node_modules", "@acme", "registry-module")
    mkdirSync(packageRoot, { recursive: true })
    writeFileSync(
      path.join(repoRoot, "pnpm-lock.yaml"),
      lockfile.replaceAll("@voyant-travel/plugin-netopia", "@acme/registry-module"),
    )
    writeFileSync(
      path.join(packageRoot, "package.json"),
      JSON.stringify({
        name: "@acme/registry-module",
        version: "0.105.18",
        voyant: {
          schemaVersion: "voyant.package.v1",
          kind: "module",
          manifest: "./voyant",
        },
      }),
    )

    const records = readPnpmLockfilePackageRecords({
      repoRoot,
      projectRoot,
      packageNames: ["@acme/registry-module"],
    })

    assert.equal(records[0]?.metadata?.manifest, "./voyant")
    assert.equal(records[0]?.metadata?.kind, "module")
    assert.equal(records[0]?.source.kind, "registry")
  })

  it("does not attach installed metadata to a different locked registry version", () => {
    const records = packageRecordsFromPnpmLockfile(lockfile, {
      packageNames: ["@voyant-travel/plugin-netopia"],
      installedPackageVersions: {
        "@voyant-travel/plugin-netopia": "9.9.9",
      },
      installedPackageMetadata: {
        "@voyant-travel/plugin-netopia": {
          schemaVersion: "voyant.package.v1",
          kind: "plugin",
          manifest: "./voyant",
        },
      },
    })

    assert.equal(records[0]?.version, "0.105.18")
    assert.equal(records[0]?.metadata, undefined)
  })

  it("reads v1 voyant package metadata from package.json files", () => {
    const repoRoot = mkdtempSync(path.join(tmpdir(), "voyant-provenance-"))
    mkdirSync(path.join(repoRoot, "packages", "v1-module"), { recursive: true })
    mkdirSync(path.join(repoRoot, "packages", "legacy-module"), { recursive: true })
    writeFileSync(
      path.join(repoRoot, "pnpm-lock.yaml"),
      `
lockfileVersion: '9.0'

importers:
  apps/operator:
    dependencies:
      '@acme/voyant-loyalty':
        specifier: workspace:*
        version: link:../../packages/v1-module
      '@acme/legacy':
        specifier: workspace:*
        version: link:../../packages/legacy-module
`,
    )
    writeFileSync(
      path.join(repoRoot, "packages", "v1-module", "package.json"),
      JSON.stringify(
        {
          name: "@acme/voyant-loyalty",
          version: "1.2.3",
          voyant: {
            schemaVersion: "voyant.package.v1",
            kind: "plugin",
            compatibleWith: {
              targets: ["node", "voyant-cloud"],
              modes: "self-hosted",
            },
            requires: {
              capabilities: "identity.people",
            },
          },
        },
        null,
        2,
      ),
    )
    writeFileSync(
      path.join(repoRoot, "packages", "legacy-module", "package.json"),
      JSON.stringify(
        {
          name: "@acme/legacy",
          version: "0.1.0",
          voyant: {
            schema: "./schema",
            requiresSchemas: ["@voyant-travel/db"],
          },
        },
        null,
        2,
      ),
    )

    const records = readPnpmLockfilePackageRecords({
      repoRoot,
      packageNames: ["@acme/legacy", "@acme/voyant-loyalty"],
    })

    assert.deepEqual(records, [
      {
        packageName: "@acme/legacy",
        version: "0.1.0",
        source: { kind: "workspace", reference: "link:../../packages/legacy-module" },
      },
      {
        packageName: "@acme/voyant-loyalty",
        version: "1.2.3",
        source: { kind: "workspace", reference: "link:../../packages/v1-module" },
        metadata: {
          schemaVersion: "voyant.package.v1",
          kind: "plugin",
          compatibleWith: {
            targets: ["node", "voyant-cloud"],
            modes: ["self-hosted"],
          },
          requires: {
            capabilities: ["identity.people"],
          },
        },
      },
    ])
  })

  it("reads substrate package metadata kinds from package.json files", () => {
    const repoRoot = mkdtempSync(path.join(tmpdir(), "voyant-provenance-"))
    mkdirSync(path.join(repoRoot, "packages", "framework"), { recursive: true })
    writeFileSync(
      path.join(repoRoot, "pnpm-lock.yaml"),
      `
lockfileVersion: '9.0'

importers:
  apps/operator:
    dependencies:
      '@voyant-travel/framework':
        specifier: workspace:*
        version: link:../../packages/framework
`,
    )
    writeFileSync(
      path.join(repoRoot, "packages", "framework", "package.json"),
      JSON.stringify(
        {
          name: "@voyant-travel/framework",
          version: "0.29.4",
          voyant: {
            schemaVersion: "voyant.package.v1",
            kind: "framework",
            compatibleWith: {
              framework: ">=0.26.0",
              targets: ["node"],
              modes: ["local"],
            },
          },
        },
        null,
        2,
      ),
    )

    const records = readPnpmLockfilePackageRecords({
      repoRoot,
      packageNames: ["@voyant-travel/framework"],
    })

    assert.deepEqual(records, [
      {
        packageName: "@voyant-travel/framework",
        version: "0.29.4",
        source: { kind: "workspace", reference: "link:../../packages/framework" },
        metadata: {
          schemaVersion: "voyant.package.v1",
          kind: "framework",
          compatibleWith: {
            framework: ">=0.26.0",
            targets: ["node"],
            modes: ["local"],
          },
        },
      },
    ])
  })
})
