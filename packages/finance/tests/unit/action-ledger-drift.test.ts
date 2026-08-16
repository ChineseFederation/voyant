import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"

import { __test__, buildFinanceActionLedgerDriftQueries } from "../../src/action-ledger-drift.js"

describe("finance action ledger drift checks", () => {
  it("builds drift queries for invoices, payments, and payment sessions", () => {
    const queries = buildFinanceActionLedgerDriftQueries({
      createdAtFrom: "2026-05-17T00:00:00.000Z",
      sampleLimit: 5,
    })
    const dialect = new PgDialect()
    const invoice = dialect.sqlToQuery(queries.invoice)
    const payment = dialect.sqlToQuery(queries.payment)
    const paymentSession = dialect.sqlToQuery(queries.payment_session)

    expect(invoice.sql).toContain('"invoices"')
    expect(invoice.sql).toContain('"action_ledger_entries"')
    expect(invoice.sql).toContain('"action_ledger_entries"."action_name" =')
    expect(invoice.sql).toContain('"invoices"."created_at" >= ')
    expect(invoice.params).toContain("finance.invoice.issue_from_booking")
    expect(invoice.params).toContain("draft")
    expect(invoice.params).toContain("booking")

    expect(payment.sql).toContain('INNER JOIN "invoices"')
    expect(payment.params).toContain("finance.payment.record")
    expect(payment.params).toContain("booking")

    expect(paymentSession.sql).toContain("CASE")
    expect(paymentSession.sql).toContain('"payment_sessions"."booking_id" IS NOT NULL')
    expect(paymentSession.params).toEqual(
      expect.arrayContaining([
        "finance.payment_session.create",
        "finance.payment_session.complete",
        "finance.payment_session.update",
        "finance.payment_session.requires_redirect",
        "finance.payment_session.fail",
        "finance.payment_session.cancel",
        "finance.payment_session.expire",
        "payment_session",
        "other",
      ]),
    )
  })

  it("clamps the sample limit and normalizes rows", () => {
    const query = new PgDialect().sqlToQuery(
      buildFinanceActionLedgerDriftQueries({ sampleLimit: 999 }).invoice,
    )

    expect(query.params).toContain(100)
    expect(
      __test__.normalizeRow({
        check: "invoice",
        missing_count: "2",
        sample_ids: ["inv_2", "inv_1"],
      }),
    ).toEqual({
      check: "invoice",
      missingCount: 2,
      sampleIds: ["inv_2", "inv_1"],
    })
  })

  // voyant#4696: a `Date` interpolated into a `sql` fragment reaches the driver
  // unencoded and postgres-js throws while binding it, so the check crashed for
  // every caller that narrowed by date. Building the query proves nothing on
  // its own — what the parameter *is* decides whether the query can be sent.
  it("binds createdAtFrom as an encoded timestamp rather than a Date", () => {
    const dialect = new PgDialect()
    for (const value of [new Date("2026-05-17T00:00:00.000Z"), "2026-05-17T00:00:00.000Z"]) {
      const query = dialect.sqlToQuery(
        buildFinanceActionLedgerDriftQueries({ createdAtFrom: value }).invoice,
      )
      expect(query.params).toContain("2026-05-17T00:00:00.000Z")
      expect(query.params.some((param) => param instanceof Date)).toBe(false)
    }
  })

  it("rejects invalid createdAtFrom values while building queries", () => {
    expect(() => buildFinanceActionLedgerDriftQueries({ createdAtFrom: "not-a-date" })).toThrow(
      "createdAtFrom must be a valid date",
    )
  })
})
