import { OpenAPIHono } from "@hono/zod-openapi"
import type { Extension } from "@voyant-travel/core"
import { parseJsonBody } from "@voyant-travel/hono"
import type { ApiExtension } from "@voyant-travel/hono/module"
import { eq } from "drizzle-orm"
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { z } from "zod"

// ---------- schema ----------

export const bookingProposalDetails = pgTable(
  "booking_proposal_details",
  {
    bookingId: text("booking_id").primaryKey(),
    proposalId: text("proposal_id"),
    proposalVersionId: text("proposal_version_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_booking_proposal_details_proposal").on(t.proposalId),
    index("idx_booking_proposal_details_proposal_version").on(t.proposalVersionId),
  ],
)

export type BookingProposalDetail = typeof bookingProposalDetails.$inferSelect
export type NewBookingProposalDetail = typeof bookingProposalDetails.$inferInsert

// ---------- validation ----------

const bookingProposalDetailSchema = z.object({
  proposalId: z.string().optional().nullable(),
  proposalVersionId: z.string().optional().nullable(),
})

// ---------- service ----------

export const bookingProposalExtensionService = {
  async get(db: PostgresJsDatabase, bookingId: string) {
    const [row] = await db
      .select()
      .from(bookingProposalDetails)
      .where(eq(bookingProposalDetails.bookingId, bookingId))
      .limit(1)
    return row ?? null
  },

  async upsert(
    db: PostgresJsDatabase,
    bookingId: string,
    data: z.infer<typeof bookingProposalDetailSchema>,
  ) {
    const [row] = await db
      .insert(bookingProposalDetails)
      .values({
        bookingId,
        proposalId: data.proposalId ?? null,
        proposalVersionId: data.proposalVersionId ?? null,
      })
      .onConflictDoUpdate({
        target: bookingProposalDetails.bookingId,
        set: {
          proposalId: data.proposalId ?? null,
          proposalVersionId: data.proposalVersionId ?? null,
          updatedAt: new Date(),
        },
      })
      .returning()
    return row ?? null
  },

  async remove(db: PostgresJsDatabase, bookingId: string) {
    const [row] = await db
      .delete(bookingProposalDetails)
      .where(eq(bookingProposalDetails.bookingId, bookingId))
      .returning({ bookingId: bookingProposalDetails.bookingId })
    return row ?? null
  },
}

// ---------- routes ----------

type Env = {
  Variables: {
    db: PostgresJsDatabase
    userId?: string
  }
}

export const PROPOSALS_BOOKING_OPENAPI_API_ID = "@voyant-travel/proposals#booking-extension.api"

export const bookingProposalExtensionRoutes = new OpenAPIHono<Env>()

bookingProposalExtensionRoutes
  .get("/:bookingId/proposal-details", async (c) => {
    const row = await bookingProposalExtensionService.get(c.get("db"), c.req.param("bookingId"))
    if (!row) {
      return c.json({ data: null })
    }
    return c.json({ data: row })
  })

  .put("/:bookingId/proposal-details", async (c) => {
    const data = await parseJsonBody(c, bookingProposalDetailSchema)
    const row = await bookingProposalExtensionService.upsert(
      c.get("db"),
      c.req.param("bookingId"),
      data,
    )
    return c.json({ data: row })
  })

  .delete("/:bookingId/proposal-details", async (c) => {
    const row = await bookingProposalExtensionService.remove(c.get("db"), c.req.param("bookingId"))
    if (!row) {
      return c.json({ error: "Not found" }, 404)
    }
    return c.json({ success: true })
  })

for (const [method, path] of [
  ["get", "/{bookingId}/proposal-details"],
  ["put", "/{bookingId}/proposal-details"],
  ["delete", "/{bookingId}/proposal-details"],
] as const) {
  bookingProposalExtensionRoutes.openAPIRegistry.registerPath({
    method,
    path,
    responses: { 200: { description: "Proposal booking detail response." } },
    "x-voyant-api-id": PROPOSALS_BOOKING_OPENAPI_API_ID,
  })
}

// ---------- extension export ----------

const proposalsBookingExtensionDef: Extension = {
  name: "proposals-booking",
  module: "bookings",
}

export const proposalsBookingExtension: ApiExtension = {
  extension: proposalsBookingExtensionDef,
  adminRoutes: bookingProposalExtensionRoutes,
}
