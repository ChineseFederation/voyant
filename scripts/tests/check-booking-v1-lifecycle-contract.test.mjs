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
    "packages/bookings/src/schema-shared.ts",
    overrides.bookingSharedSchema ??
      'bookingStatusEnum ["confirmed", "in_progress", "completed", "cancelled"] supplierConfirmationStatusEnum bookingItemStatusEnum ["confirmed", "cancelled", "fulfilled"] bookingAllocationTypeEnum',
  )
  write(root, "packages/bookings/src/schema-items.ts", overrides.bookingItemsSchema ?? "status")
  write(root, "packages/bookings/src/schema-core.ts", overrides.bookingCoreSchema ?? "acceptedAt")
  write(
    root,
    "packages/finance/src/service-booking-create.ts",
    overrides.bookingCreateContract ??
      "status: \"confirmed\" WHERE b.status IN ('confirmed', 'in_progress')",
  )
  write(root, "packages/bookings/src/routes-admin.ts", overrides.bookingAdminRoutes ?? "cancel")
  write(
    root,
    "packages/admin-contracts/src/bookings.ts",
    overrides.adminBookingContracts ?? 'id: "bookings.cancel"',
  )
  write(
    root,
    "packages/admin-react/src/client/client.ts",
    overrides.adminClient ?? "bookingsOperations.cancel",
  )
  write(
    root,
    "packages/notifications/src/voyant.ts",
    overrides.notificationsManifest ?? 'eventType: "booking.confirmed"',
  )
  const bookingOpenApi = JSON.stringify({
    paths: {},
    components: {
      schemas: {
        BookingStatus: { enum: ["confirmed", "in_progress", "completed", "cancelled"] },
      },
    },
  })
  write(
    root,
    "packages/bookings/openapi/admin/bookings.json",
    overrides.bookingsAdminOpenApi ?? bookingOpenApi,
  )
  write(
    root,
    "packages/bookings/openapi/public-api/bookings.json",
    overrides.bookingsStorefrontOpenApi ?? bookingOpenApi,
  )
  write(
    root,
    "packages/catalog/src/booking-engine/operator-routes.ts",
    overrides.catalogRoutes ?? '"/v1/public/catalog/booking-sessions"',
  )
  write(root, "packages/catalog/src/schema.ts", overrides.catalogSchema ?? "bookingSessionsTable")
  write(
    root,
    "packages/catalog/openapi/admin/catalog-booking.json",
    overrides.adminBookingOpenApi ?? '{"/v1/admin/catalog/booking-sessions":{}}',
  )
  write(
    root,
    "packages/catalog/openapi/public-api/catalog-booking.json",
    overrides.storefrontBookingOpenApi ?? '{"/v1/public/catalog/booking-sessions":{}}',
  )
  write(
    root,
    "packages/catalog/migrations/20260802190000_booking_v1_beta_draft_cutover.sql",
    overrides.betaDraftCutover ??
      [
        "ambiguous external effect",
        "booking_v1_legacy_holds_to_release",
        "genuine_commitment",
        "resumable_staff_attempt",
        'DROP TABLE "booking_drafts"',
      ].join("\n"),
  )
  write(
    root,
    "packages/bookings/migrations/20260802200000_booking_v1_status_cutover.sql",
    overrides.betaBookingStatusCutover ??
      [
        "ambiguous supplier effect",
        "unresolved external payment effect",
        "booking_v1_legacy_allocations_to_release",
        "genuine_commitment",
        "abandoned_attempt",
        'DROP TABLE IF EXISTS "booking_session_states"',
        "CREATE TYPE \"booking_status\" AS ENUM ('confirmed', 'in_progress', 'completed', 'cancelled')",
      ].join("\n"),
  )
  write(
    root,
    "packages/public-api-client/package.json",
    JSON.stringify(
      overrides.storefrontSdkPackage ?? { exports: {}, publishConfig: { exports: {} } },
    ),
  )
  write(
    root,
    "docs/architecture/custom-public-api-client.md",
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

test("rejects retired beta routes in published Booking OpenAPI", (t) => {
  const root = fixture(t)
  writeMinimumFixture(root, {
    adminBookingOpenApi: '{"/v1/admin/catalog/drafts/{id}":{}}',
    storefrontBookingOpenApi: '{"/v1/public/catalog/drafts/{id}":{}}',
  })

  const output = failure(root)
  assert.match(output, /missing.*booking-sessions/)
  assert.match(output, /forbidden.*catalog\/drafts/)
})

test("rejects beta Booking lifecycle state in published Booking OpenAPI", (t) => {
  const root = fixture(t)
  writeMinimumFixture(root, {
    bookingsAdminOpenApi: JSON.stringify({
      paths: { "/v1/admin/bookings/{id}/confirm": {} },
      components: { schemas: { BookingStatus: { enum: ["on_hold", "confirmed"] } } },
    }),
  })

  const output = failure(root)
  assert.match(output, /forbidden.*on_hold/)
  assert.match(output, /forbidden.*confirm/)
})

test("rejects the retired confirm operation in authenticated admin clients", (t) => {
  const root = fixture(t)
  writeMinimumFixture(root, {
    adminBookingContracts:
      'confirmBookingSchema id: "bookings.confirm" pathTemplate: "/v1/admin/bookings/:id/confirm"',
    adminClient: "bookingsOperations.confirm",
  })

  const output = failure(root)
  assert.match(output, /admin-contracts.*confirmBookingSchema/)
  assert.match(output, /admin-contracts.*bookings\.confirm/)
  assert.match(output, /admin-react.*bookingsOperations\.confirm/)
})

test("rejects the retired Booking expiry event in Notifications", (t) => {
  const root = fixture(t)
  writeMinimumFixture(root, { notificationsManifest: 'eventType: "booking.expired"' })

  assert.match(failure(root), /notifications.*booking\.expired/)
})

test("rejects negative beta lifecycle predicates in duplicate detection", (t) => {
  const root = fixture(t)
  writeMinimumFixture(root, {
    bookingCreateContract: "WHERE b.status NOT IN ('cancelled', 'expired')",
  })

  const output = failure(root)
  assert.match(output, /missing.*confirmed.*in_progress/)
  assert.match(output, /forbidden.*b\.status NOT IN/)
})
