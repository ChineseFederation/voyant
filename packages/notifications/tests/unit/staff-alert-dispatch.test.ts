import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { describe, expect, it, vi } from "vitest"

import type { StaffAlertBrand } from "../../src/emails/brand.js"
import {
  dispatchStaffAlert,
  type StaffAlertRuntime,
} from "../../src/service-staff-alert-dispatch.js"
import type { StaffAlertContextResolver } from "../../src/staff-alert-registry.js"

const brand: StaffAlertBrand = {
  operatorName: "Eturia",
  brandColor: "#f26522",
  cornerRadius: "0.625rem",
  logoUrl: null,
  supportEmail: null,
  adminBaseUrl: "https://admin.eturia.ro",
  locale: "en",
}

const resolver: StaffAlertContextResolver<"staff.booking.confirmed"> = {
  eventKey: "staff.booking.confirmed",
  resolve: async () => ({
    adminPath: "/bookings/bk_1",
    assigneeUserId: null,
    actorUserId: null,
    bookingId: "bk_1",
    bookingNumber: "VOY-1042",
    customer: { name: "Ana Popescu", email: "ana@example.com" },
    total: { amountCents: 249900, currency: "EUR" },
    travelStartDate: null,
    travelEndDate: null,
    travelerCount: null,
  }),
}

/**
 * `dispatchStaffAlert` reads its settings and opt-outs through Drizzle. The
 * fake answers those two selects in call order: the settings row, then the
 * opt-out rows, then the staff user rows for recipient resolution.
 */
function fakeDb(rowsByCall: unknown[][]): PostgresJsDatabase {
  let call = 0
  const rowsFor = () => rowsByCall[Math.min(call++, rowsByCall.length - 1)] ?? []
  return {
    select: vi.fn(() => {
      const rows = rowsFor()
      // Some call sites await `.where(...)` directly and others chain
      // `.limit(1)` onto it, so the builder is a real Promise carrying a
      // `limit` method — an object literal with a `then` key would be an
      // accidental thenable.
      const where = vi.fn(() =>
        Object.assign(Promise.resolve(rows), { limit: vi.fn(async () => rows) }),
      )
      return {
        from: vi.fn(() => ({
          where,
          leftJoin: vi.fn(async () => rows),
          limit: vi.fn(async () => rows),
        })),
      }
    }),
  } as unknown as PostgresJsDatabase
}

function runtime(): StaffAlertRuntime {
  return {
    dispatcher: {} as StaffAlertRuntime["dispatcher"],
    resolvers: { "staff.booking.confirmed": resolver },
    resolveBrand: async () => brand,
    resolveAdminDestination: () => "/",
  }
}

describe("dispatchStaffAlert", () => {
  it("enqueues one logical staff intent for an inquiry event identity", async () => {
    const enqueue = vi.fn(async () => ({}) as never)
    const db = fakeDb([
      [
        {
          eventKey: "staff.booking.inquiry-created",
          enabled: true,
          routeToAssignee: false,
          routeToRoles: [],
          extraAddresses: ["ops@op.ro"],
        },
      ],
      [],
    ])
    const inquiryResolver: StaffAlertContextResolver<"staff.booking.inquiry-created"> = {
      eventKey: "staff.booking.inquiry-created",
      resolve: async () => ({
        adminPath: "/bookings/inquiries/bkin_1",
        assigneeUserId: null,
        actorUserId: null,
        inquiryId: "bkin_1",
        contact: { name: "Ana Popescu", email: "ana@example.com" },
        contactPhone: null,
        productId: "prod_1",
        departureId: null,
        locale: "en",
        message: "Is this available?",
      }),
    }

    await dispatchStaffAlert({
      db,
      runtime: {
        ...runtime(),
        resolvers: { "staff.booking.inquiry-created": inquiryResolver },
      },
      eventKey: "staff.booking.inquiry-created",
      payload: { inquiryId: "bkin_1" },
      eventId: "evt_booking_inquiry_created_bkin_1",
      enqueue,
    })

    const sent = enqueue.mock.calls[0]?.[0] as unknown as { input: Record<string, unknown> }
    expect(sent.input).toMatchObject({
      idempotencyKey:
        "staff-alert:evt_booking_inquiry_created_bkin_1:staff.booking.inquiry-created:ops@op.ro",
      templateLabel: "staff.booking.inquiry-created",
      targetType: "other",
      targetId: "bkin_1",
    })
  })

  it("labels the send instead of naming a template row that cannot exist", async () => {
    // Staff templates are React Email components, not `notification_templates`
    // rows. Passing `templateSlug` makes `enqueueNotification` look the slug up
    // and throw "Notification template not found" for every staff alert — the
    // failure this test exists to prevent.
    const enqueue = vi.fn(async () => ({}) as never)
    const db = fakeDb([
      [
        {
          eventKey: "staff.booking.confirmed",
          enabled: true,
          routeToAssignee: false,
          routeToRoles: [],
          extraAddresses: ["ops@op.ro"],
        },
      ],
      [],
    ])

    const result = await dispatchStaffAlert({
      db,
      runtime: runtime(),
      eventKey: "staff.booking.confirmed",
      payload: { bookingId: "bk_1" },
      eventId: "evt_1",
      enqueue,
    })

    expect(result).toMatchObject({ skipped: null, enqueued: 1 })
    const sent = enqueue.mock.calls[0]?.[0] as unknown as { input: Record<string, unknown> }
    expect(sent.input.templateLabel).toBe("staff.booking.confirmed")
    expect(sent.input.templateSlug).toBeUndefined()
    expect(sent.input.templateId).toBeUndefined()
  })

  it("derives the idempotency key from the event id so redelivery collapses", async () => {
    const enqueue = vi.fn(async () => ({}) as never)
    const db = fakeDb([
      [
        {
          eventKey: "staff.booking.confirmed",
          enabled: true,
          routeToAssignee: false,
          routeToRoles: [],
          extraAddresses: ["ops@op.ro"],
        },
      ],
      [],
    ])

    await dispatchStaffAlert({
      db,
      runtime: runtime(),
      eventKey: "staff.booking.confirmed",
      payload: { bookingId: "bk_1" },
      eventId: "evt_abc",
      enqueue,
    })

    const sent = enqueue.mock.calls[0]?.[0] as unknown as { input: Record<string, unknown> }
    expect(sent.input.idempotencyKey).toBe("staff-alert:evt_abc:staff.booking.confirmed:ops@op.ro")
  })

  it("sends nothing when the alert is disabled", async () => {
    const enqueue = vi.fn(async () => ({}) as never)
    const db = fakeDb([
      [
        {
          eventKey: "staff.booking.confirmed",
          enabled: false,
          routeToAssignee: false,
          routeToRoles: [],
          extraAddresses: [],
        },
      ],
    ])

    const result = await dispatchStaffAlert({
      db,
      runtime: runtime(),
      eventKey: "staff.booking.confirmed",
      payload: { bookingId: "bk_1" },
      eventId: "evt_1",
      enqueue,
    })

    expect(result.skipped).toBe("disabled")
    expect(enqueue).not.toHaveBeenCalled()
  })

  it("sends nothing when routing resolves to no recipient", async () => {
    const enqueue = vi.fn(async () => ({}) as never)
    const db = fakeDb([
      [
        {
          eventKey: "staff.booking.confirmed",
          enabled: true,
          routeToAssignee: false,
          routeToRoles: [],
          extraAddresses: [],
        },
      ],
      [],
    ])

    const result = await dispatchStaffAlert({
      db,
      runtime: runtime(),
      eventKey: "staff.booking.confirmed",
      payload: { bookingId: "bk_1" },
      eventId: "evt_1",
      enqueue,
    })

    expect(result.skipped).toBe("no-recipients")
    expect(enqueue).not.toHaveBeenCalled()
  })

  it("sends nothing when the deployment registered no resolver for the event", async () => {
    const enqueue = vi.fn(async () => ({}) as never)
    const db = fakeDb([
      [
        {
          eventKey: "staff.booking.confirmed",
          enabled: true,
          routeToAssignee: false,
          routeToRoles: [],
          extraAddresses: ["ops@op.ro"],
        },
      ],
    ])

    const result = await dispatchStaffAlert({
      db,
      runtime: { ...runtime(), resolvers: {} },
      eventKey: "staff.booking.confirmed",
      payload: { bookingId: "bk_1" },
      eventId: "evt_1",
      enqueue,
    })

    expect(result.skipped).toBe("no-resolver")
    expect(enqueue).not.toHaveBeenCalled()
  })
})
