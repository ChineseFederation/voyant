import type { Extension } from "@voyant-travel/core"
import { parseJsonBody } from "@voyant-travel/hono"
import type { ApiExtension } from "@voyant-travel/hono/module"
import { asc, eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { Hono } from "hono"
import { z } from "zod"

import { bookingActivityLog, bookingSupplierStatuses, bookings } from "../schema.js"

// ---------- validation ----------

const supplierConfirmationStatusSchema = z.enum(["pending", "confirmed", "rejected", "cancelled"])

const supplierStatusCoreSchema = z.object({
  supplierServiceId: z.string().optional().nullable(),
  // Supplier snapshot — enables matching a received supplier invoice to this
  // commitment without an unreliable join (AP design §5.5).
  supplierId: z.string().optional().nullable(),
  serviceName: z.string().min(1).max(255),
  status: supplierConfirmationStatusSchema.default("pending"),
  supplierReference: z.string().max(255).optional().nullable(),
  costCurrency: z.string().min(3).max(3),
  costAmountCents: z.number().int().min(0),
  // Set when the actual supplier invoice line arrives (commitment → invoice).
  supplierInvoiceLineId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

const insertSupplierStatusSchema = supplierStatusCoreSchema
const updateSupplierStatusSchema = supplierStatusCoreSchema.partial().extend({
  confirmedAt: z.string().optional().nullable(),
})

// ---------- service ----------

async function touchBookingUpdatedAt(db: PostgresJsDatabase, bookingId: string, now = new Date()) {
  await db
    .update(bookings)
    .set({ revision: sql`${bookings.revision} + 1`, updatedAt: now })
    .where(eq(bookings.id, bookingId))
}

const supplierStatusService = {
  listSupplierStatuses(db: PostgresJsDatabase, bookingId: string) {
    return db
      .select()
      .from(bookingSupplierStatuses)
      .where(eq(bookingSupplierStatuses.bookingId, bookingId))
      .orderBy(asc(bookingSupplierStatuses.createdAt))
  },

  async createSupplierStatus(
    db: PostgresJsDatabase,
    bookingId: string,
    data: z.infer<typeof insertSupplierStatusSchema>,
    userId?: string,
  ) {
    const [booking] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1)

    if (!booking) {
      return null
    }

    const [row] = await db
      .insert(bookingSupplierStatuses)
      .values({ ...data, bookingId })
      .returning()

    await db.insert(bookingActivityLog).values({
      bookingId,
      actorId: userId ?? "system",
      activityType: "supplier_update",
      description: `Supplier status for "${data.serviceName}" added`,
    })
    await touchBookingUpdatedAt(db, bookingId)

    return row
  },

  async updateSupplierStatus(
    db: PostgresJsDatabase,
    bookingId: string,
    statusId: string,
    data: z.infer<typeof updateSupplierStatusSchema>,
    userId?: string,
  ) {
    const updateData: Record<string, unknown> = { ...data, updatedAt: new Date() }
    if (data.status === "confirmed" && !data.confirmedAt) {
      updateData.confirmedAt = new Date()
    }

    const [row] = await db
      .update(bookingSupplierStatuses)
      .set(updateData)
      .where(eq(bookingSupplierStatuses.id, statusId))
      .returning()

    if (!row) {
      return null
    }

    if (data.status) {
      await db.insert(bookingActivityLog).values({
        bookingId,
        actorId: userId ?? "system",
        activityType: "supplier_update",
        description: `Supplier "${row.serviceName}" status updated to ${data.status}`,
        metadata: { supplierStatusId: statusId, newStatus: data.status },
      })
    }
    await touchBookingUpdatedAt(db, bookingId)

    return row
  },
}

// ---------- routes ----------

type Env = {
  Variables: {
    db: PostgresJsDatabase
    userId?: string
  }
}

const supplierStatusRoutes = new Hono<Env>()

  .get("/:id/supplier-statuses", async (c) => {
    return c.json({
      data: await supplierStatusService.listSupplierStatuses(c.get("db"), c.req.param("id")),
    })
  })

  .post("/:id/supplier-statuses", async (c) => {
    const row = await supplierStatusService.createSupplierStatus(
      c.get("db"),
      c.req.param("id"),
      await parseJsonBody(c, insertSupplierStatusSchema),
      c.get("userId"),
    )

    if (!row) {
      return c.json({ error: "Booking not found" }, 404)
    }

    return c.json({ data: row }, 201)
  })

  .patch("/:id/supplier-statuses/:statusId", async (c) => {
    const row = await supplierStatusService.updateSupplierStatus(
      c.get("db"),
      c.req.param("id"),
      c.req.param("statusId"),
      await parseJsonBody(c, updateSupplierStatusSchema),
      c.get("userId"),
    )

    if (!row) {
      return c.json({ error: "Supplier status not found" }, 404)
    }

    return c.json({ data: row })
  })

// ---------- extension export ----------

const bookingsSupplierExtensionDef: Extension = {
  name: "bookings-suppliers",
  module: "bookings",
}

export const bookingsSupplierExtension: ApiExtension = {
  extension: bookingsSupplierExtensionDef,
  adminRoutes: supplierStatusRoutes,
}
