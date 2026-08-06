import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { describe, expect, it, vi } from "vitest"

import { resolveStaffAlertRecipients } from "../../src/service-staff-alert-recipients.js"
import type { ResolvedStaffAlertSetting } from "../../src/service-staff-alerts.js"
import { STAFF_ALERT_DEFINITIONS } from "../../src/staff-alert-registry.js"

const signalDefinition = STAFF_ALERT_DEFINITIONS.find(
  (entry) => entry.key === "staff.customer-signal.created",
)!

/**
 * `listStaffUsers` issues two selects and unions them. The fake answers them in
 * call order: local staff first, then cloud links.
 */
function fakeDb(localRows: unknown[], cloudRows: unknown[] = []): PostgresJsDatabase {
  let call = 0
  return {
    select: vi.fn(() => {
      const rows = call++ === 0 ? localRows : cloudRows
      const leftJoin = vi.fn(async () => rows)
      const where = vi.fn(async () => rows)
      // `leftJoin` and `where` are the awaited terminals in `listStaffUsers`,
      // so the builder itself never needs to be thenable.
      return { from: vi.fn(() => ({ leftJoin, where })) }
    }),
  } as unknown as PostgresJsDatabase
}

function setting(overrides: Partial<ResolvedStaffAlertSetting> = {}): ResolvedStaffAlertSetting {
  return {
    definition: signalDefinition,
    enabled: true,
    routeToAssignee: true,
    routeToRoles: ["admin"],
    extraAddresses: [],
    configured: true,
    ...overrides,
  }
}

const admin = { userId: "u_admin", email: "admin@op.ro", locale: "en", permissions: null }
const member = {
  userId: "u_member",
  email: "member@op.ro",
  locale: "ro",
  permissions: ["bookings:read"],
}

describe("resolveStaffAlertRecipients", () => {
  it("reaches a full-access user who was never explicitly assigned permissions", async () => {
    const recipients = await resolveStaffAlertRecipients({
      db: fakeDb([admin, member]),
      setting: setting({ routeToAssignee: false }),
      assigneeUserId: null,
      actorUserId: null,
      optedOutUserIds: new Set(),
    })

    expect(recipients.map((r) => r.email)).toEqual(["admin@op.ro"])
  })

  it("excludes the actor — telling someone what they just did is noise", async () => {
    const recipients = await resolveStaffAlertRecipients({
      db: fakeDb([admin, member]),
      setting: setting({ routeToAssignee: false }),
      assigneeUserId: null,
      actorUserId: "u_admin",
      optedOutUserIds: new Set(),
    })

    expect(recipients).toHaveLength(0)
  })

  it("subtracts users who explicitly opted out", async () => {
    const recipients = await resolveStaffAlertRecipients({
      db: fakeDb([admin, member]),
      setting: setting({ routeToAssignee: false }),
      assigneeUserId: null,
      actorUserId: null,
      optedOutUserIds: new Set(["u_admin"]),
    })

    expect(recipients).toHaveLength(0)
  })

  it("sends one email when a user is both assignee and role match", async () => {
    const recipients = await resolveStaffAlertRecipients({
      db: fakeDb([admin]),
      setting: setting(),
      assigneeUserId: "u_admin",
      actorUserId: null,
      optedOutUserIds: new Set(),
    })

    expect(recipients).toHaveLength(1)
    // The assignee framing must survive the merge, or the recipient loses the
    // "this is yours" callout.
    expect(recipients[0]?.isAssignee).toBe(true)
  })

  it("keeps extra addresses even though they cannot opt out", async () => {
    const recipients = await resolveStaffAlertRecipients({
      db: fakeDb([]),
      setting: setting({ routeToAssignee: false, routeToRoles: [], extraAddresses: ["ops@op.ro"] }),
      assigneeUserId: null,
      actorUserId: null,
      optedOutUserIds: new Set(["u_admin"]),
    })

    expect(recipients.map((r) => r.email)).toEqual(["ops@op.ro"])
    expect(recipients[0]?.userId).toBeNull()
  })

  it("dedupes a shared mailbox that is also a staff address, case-insensitively", async () => {
    const recipients = await resolveStaffAlertRecipients({
      db: fakeDb([admin]),
      setting: setting({ routeToAssignee: false, extraAddresses: ["ADMIN@OP.RO"] }),
      assigneeUserId: null,
      actorUserId: null,
      optedOutUserIds: new Set(),
    })

    expect(recipients).toHaveLength(1)
    // The user id must win, so the opt-out check still applies to this address.
    expect(recipients[0]?.userId).toBe("u_admin")
  })

  it("skips the user lookup entirely when routing is addresses-only", async () => {
    const db = fakeDb([admin])
    await resolveStaffAlertRecipients({
      db,
      setting: setting({ routeToAssignee: false, routeToRoles: [], extraAddresses: ["ops@op.ro"] }),
      assigneeUserId: null,
      actorUserId: null,
      optedOutUserIds: new Set(),
    })

    expect(db.select).not.toHaveBeenCalled()
  })
})
