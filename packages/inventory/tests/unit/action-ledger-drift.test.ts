import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"

import { __test__, buildProductActionLedgerDriftQueries } from "../../src/action-ledger-drift.js"

describe("product action ledger drift checks", () => {
  it("builds drift queries for core product records", () => {
    const queries = buildProductActionLedgerDriftQueries({
      createdAtFrom: "2026-05-17T00:00:00.000Z",
      sampleLimit: 5,
    })
    const dialect = new PgDialect()
    const product = dialect.sqlToQuery(queries.product)
    const option = dialect.sqlToQuery(queries.product_option)
    const optionUnit = dialect.sqlToQuery(queries.option_unit)
    const itinerary = dialect.sqlToQuery(queries.product_itinerary)

    expect(product.sql).toContain('"products"')
    expect(product.sql).toContain('"action_ledger_entries"')
    expect(product.sql).toContain('"products"."created_at" >= ')
    expect(product.params).toEqual(expect.arrayContaining(["product.create", "product"]))

    expect(option.sql).toContain('"product_options"')
    expect(option.params).toEqual(expect.arrayContaining(["product.option.create", "product"]))

    expect(optionUnit.sql).toContain('INNER JOIN "product_options"')
    expect(optionUnit.params).toEqual(
      expect.arrayContaining(["product.option_unit.create", "product"]),
    )

    expect(itinerary.sql).toContain('"product_itineraries"')
    expect(itinerary.params).toEqual(
      expect.arrayContaining(["product.itinerary.create", "product.itinerary.duplicate"]),
    )
  })

  it("builds drift queries for itinerary, media, and configuration records", () => {
    const queries = buildProductActionLedgerDriftQueries({ sampleLimit: 2 })
    const dialect = new PgDialect()
    const day = dialect.sqlToQuery(queries.product_day)
    const dayService = dialect.sqlToQuery(queries.product_day_service)
    const media = dialect.sqlToQuery(queries.product_media)
    const capability = dialect.sqlToQuery(queries.product_capability)
    const deliveryFormat = dialect.sqlToQuery(queries.product_delivery_format)

    expect(day.sql).toContain('INNER JOIN "product_itineraries"')
    expect(day.params).toEqual(expect.arrayContaining(["product.day.create", "product"]))

    expect(dayService.sql).toContain('INNER JOIN "product_days"')
    expect(dayService.sql).toContain('INNER JOIN "product_itineraries"')
    expect(dayService.params).toEqual(
      expect.arrayContaining(["product.day_service.create", "product"]),
    )

    expect(media.sql).toContain("CASE")
    expect(media.sql).toContain('"product_media"."day_id" IS NOT NULL')
    expect(media.params).toEqual(
      expect.arrayContaining([
        "product.media.create",
        "product.day_media.create",
        "product.brochure.create",
        "product",
      ]),
    )

    expect(capability.sql).toContain('"product_capabilities"')
    expect(capability.params).toEqual(
      expect.arrayContaining(["product.capability.create", "product"]),
    )

    expect(deliveryFormat.sql).toContain('"product_delivery_formats"')
    expect(deliveryFormat.params).toEqual(
      expect.arrayContaining(["product.delivery_format.create", "product"]),
    )
  })

  it("clamps the sample limit and normalizes rows", () => {
    const query = new PgDialect().sqlToQuery(
      buildProductActionLedgerDriftQueries({ sampleLimit: 999 }).product,
    )

    expect(query.params).toContain(100)
    expect(
      __test__.normalizeRow({
        check: "product",
        missing_count: "2",
        sample_ids: ["prod_2", "prod_1"],
      }),
    ).toEqual({
      check: "product",
      missingCount: 2,
      sampleIds: ["prod_2", "prod_1"],
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
        buildProductActionLedgerDriftQueries({ createdAtFrom: value }).product,
      )
      expect(query.params).toContain("2026-05-17T00:00:00.000Z")
      expect(query.params.some((param) => param instanceof Date)).toBe(false)
    }
  })

  it("rejects invalid createdAtFrom values while building queries", () => {
    expect(() => buildProductActionLedgerDriftQueries({ createdAtFrom: "not-a-date" })).toThrow(
      "createdAtFrom must be a valid date",
    )
  })
})
