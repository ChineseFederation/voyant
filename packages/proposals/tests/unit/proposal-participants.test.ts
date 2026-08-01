import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { Hono } from "hono"
import { describe, expect, it } from "vitest"

import { createProposalsRoutes } from "../../src/routes/index.js"
import { proposalsService } from "../../src/service/index.js"

const noInsertDb = {
  insert() {
    throw new Error("insert should not be called")
  },
} as PostgresJsDatabase

function createInsertDb(row: Record<string, unknown>, insertedValues: unknown[]) {
  return {
    insert() {
      return {
        values(values: unknown) {
          insertedValues.push(values)
          return {
            async returning() {
              return [row]
            },
          }
        },
      }
    },
  } as PostgresJsDatabase
}

describe("proposal participant creation", () => {
  it("creates through default routes without a participant person resolver", async () => {
    const insertedValues: unknown[] = []
    const row = {
      id: "prpt_1",
      proposalId: "prps_1",
      personId: "missing_mr073yt6",
      role: "traveler",
      isPrimary: false,
    }
    const db = createInsertDb(row, insertedValues)

    const app = new Hono()
    app.use("*", async (c, next) => {
      c.set("db" as never, db)
      await next()
    })
    app.route("/", createProposalsRoutes())

    const res = await app.request(`/proposals/${row.proposalId}/participants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personId: row.personId, role: row.role }),
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data).toEqual(row)
    expect(insertedValues).toEqual([
      {
        personId: row.personId,
        role: row.role,
        isPrimary: row.isPrimary,
        proposalId: row.proposalId,
      },
    ])
  })

  it("rejects a missing person before inserting when a resolver is configured", async () => {
    await expect(
      proposalsService.createProposalParticipant(
        noInsertDb,
        "prps_1",
        { personId: "missing_mr073yt6", role: "traveler", isPrimary: false },
        { resolveParticipantPersonById: async () => false },
      ),
    ).rejects.toMatchObject({
      status: 400,
      code: "invalid_request",
      message: "Proposal participant personId does not reference an existing person",
    })
  })

  it("creates a participant when the configured resolver finds the person", async () => {
    const insertedValues: unknown[] = []
    const row = {
      id: "prpt_1",
      proposalId: "prps_1",
      personId: "pers_proposal_participant_1",
      role: "traveler",
      isPrimary: false,
    }

    const db = createInsertDb(row, insertedValues)

    await expect(
      proposalsService.createProposalParticipant(
        db,
        row.proposalId,
        { personId: row.personId, role: row.role, isPrimary: row.isPrimary },
        { resolveParticipantPersonById: async () => true },
      ),
    ).resolves.toBe(row)

    expect(insertedValues).toEqual([
      {
        personId: row.personId,
        role: row.role,
        isPrimary: row.isPrimary,
        proposalId: row.proposalId,
      },
    ])
  })
})
