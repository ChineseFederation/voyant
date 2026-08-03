import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import test from "node:test"

const checker = resolve("scripts/check-booking-v1-lifecycle-contract.mjs")

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "voyant-booking-lifecycle-contract-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return root
}

function write(root, path, source) {
  const target = join(root, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, source)
}

function run(root) {
  return execFileSync("node", ["--import", "tsx", checker, "--root", root], {
    encoding: "utf8",
  })
}

function failure(root) {
  try {
    run(root)
  } catch (error) {
    return `${error.stdout ?? ""}${error.stderr ?? ""}`
  }
  assert.fail("expected lifecycle checker to fail")
}

function writeMinimumFixture(root, overrides = {}) {
  write(
    root,
    "docs/adr/0019-booking-v1-commitment-point-policies.md",
    overrides.adr ??
      [
        "# ADR-0019: Booking v1 commitment-point policies",
        "- **Status:** Accepted (2026-08-01)",
        "@voyant-travel/catalog-contracts/booking-engine/lifecycle-conformance",
        "runBookingLifecycleConformanceV1",
        "assertBookingLifecycleConformanceV1",
        "Finance state never becomes Booking status",
      ].join("\n"),
  )
  write(
    root,
    "UBIQUITOUS_LANGUAGE.md",
    overrides.language ??
      [
        "| **Booking** | Durable commitment | |",
        "| **Commit** | Commitment point | |",
        "| **Supplier Operation** | Supplier intent | |",
        "Sourced-inventory **Commit** defaults to supplier-first",
      ].join("\n"),
  )
  write(
    root,
    "packages/catalog-contracts/package.json",
    JSON.stringify(
      overrides.packageJson ?? {
        exports: {
          "./booking-engine/lifecycle-conformance": "./src/booking-engine/lifecycle-conformance.ts",
        },
        publishConfig: {
          exports: {
            "./booking-engine/lifecycle-conformance": {
              types: "./dist/booking-engine/lifecycle-conformance.d.ts",
            },
          },
        },
      },
    ),
  )
  write(root, "packages/bookings/src/routes-public.ts", overrides.publicRoutes ?? "overview")
  write(
    root,
    "packages/bookings/src/index.ts",
    overrides.bookingsEntryPoint ?? "publicBookingRoutes",
  )
  write(root, "packages/bookings/src/schema-operations.ts", overrides.bookingSchema ?? "bookings")
  write(
    root,
    "packages/storefront-sdk/package.json",
    JSON.stringify(
      overrides.storefrontSdkPackage ?? { exports: {}, publishConfig: { exports: {} } },
    ),
  )
  write(
    root,
    "docs/architecture/custom-storefront-sdk.md",
    overrides.storefrontSdkDocs ?? "Booking Session v1",
  )
}

test("accepts the booking v1 lifecycle contract anchors", (t) => {
  const root = fixture(t)
  writeMinimumFixture(root)
  assert.match(run(root), /OK booking v1 lifecycle contract/)
})

test("rejects missing ADR status and package export anchors", (t) => {
  const root = fixture(t)
  writeMinimumFixture(root, {
    adr: "# ADR-0019\nDraft\n",
    packageJson: { exports: {}, publishConfig: { exports: {} } },
  })

  const output = failure(root)
  assert.match(output, /Status/)
  assert.match(output, /source lifecycle-conformance export/)
  assert.match(output, /published lifecycle-conformance export/)
})

test("rejects legacy Booking-backed session surfaces", (t) => {
  const root = fixture(t)
  writeMinimumFixture(root, {
    publicRoutes: 'app.get("/sessions/:id")',
    bookingsEntryPoint: "createSelfServiceBookingRoutes bookingsSelfServiceCreateRuntimePort",
    bookingSchema: "export const bookingSessionStates = table()",
    storefrontSdkPackage: {
      exports: { "./booking-engine": "./src/booking-engine.ts" },
      publishConfig: { exports: { "./engine-state": {} } },
    },
    storefrontSdkDocs: "/v1/public/bookings/sessions bookingEngine.getSnapshot",
  })

  const output = failure(root)
  assert.match(output, /forbidden.*sessions/)
  assert.match(output, /createSelfServiceBookingRoutes/)
  assert.match(output, /bookingsSelfServiceCreateRuntimePort/)
  assert.match(output, /bookingSessionStates/)
  assert.match(output, /forbidden export \.\/booking-engine/)
  assert.match(output, /forbidden published export \.\/engine-state/)
})
