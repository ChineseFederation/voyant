import { describe, expect, it } from "vitest"

import * as schema from "../../src/schema.js"

describe("distribution schema exports", () => {
  it("includes supplier and external reference tables in the public schema surface", () => {
    expect(schema.externalRefs).toBeDefined()
    expect(schema.suppliers).toBeDefined()
    expect(schema.supplierDirectoryProjections).toBeDefined()
    expect(schema.supplierServices).toBeDefined()
    expect(schema.supplierRates).toBeDefined()
    expect(schema.supplierNotes).toBeDefined()
    expect(schema.supplierAvailability).toBeDefined()
    expect(schema.supplierContracts).toBeDefined()
    expect(schema.channelProductPublications).toBeDefined()
    expect(schema.channelSupplierPublications).toBeDefined()
    expect(schema.channelPublicationReindexIntents).toBeDefined()
    expect(schema.channelPublicationBackfillProducts).toBeDefined()
    expect(schema.channelPublicationBackfillChannels).toBeDefined()
    expect(schema.channelProductPublications.channelId.notNull).toBe(true)
    expect(schema.channelSupplierPublications.channelId.notNull).toBe(true)
    expect(schema.channelPublicationReindexIntents.channelId.notNull).toBe(false)
  })
})
