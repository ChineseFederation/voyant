import { describe, expect, it } from "vitest"

import {
  type CabinPrice,
  findCabinForPrice,
  mapCruiseContent,
  providerExternalIdFromCatalogId,
} from "../src/components/cruise-detail-page-parts.js"

function sourceRefId(prefix: string, ref: Record<string, unknown>): string {
  const json = JSON.stringify(ref)
  const b64 = btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  return `${prefix}_sr_${b64}`
}

function price(code: string): CabinPrice {
  return { code, fromAmountMinor: 249_900, available: true }
}

/**
 * The cabin rate rows under a sailing join live pricing to catalog cabins by
 * provider id. #4766: the Uniworld content payload emits cabin category ids as
 * bare provider ids, the decode only understood the SourceRef-wrapped form, and
 * every row rendered `88-from-2027_CLASSIC` where `Classic` belongs.
 */
describe("providerExternalIdFromCatalogId", () => {
  it("passes a bare provider id through — it already is the external id", () => {
    expect(providerExternalIdFromCatalogId("88-from-2027_CLASSIC")).toBe("88-from-2027_CLASSIC")
  })

  it("unwraps a SourceRef-wrapped catalog id", () => {
    const id = sourceRefId("cbcat", { connectionId: "cnx_1", externalId: "omi_V" })
    expect(providerExternalIdFromCatalogId(id)).toBe("omi_V")
  })

  it("treats an undecodable `_sr_` id as a raw external id", () => {
    expect(providerExternalIdFromCatalogId("cbcat_sr_not-base64!!")).toBe("cbcat_sr_not-base64!!")
  })

  it("treats a decodable ref with no externalId as a raw external id", () => {
    const id = sourceRefId("cbcat", { connectionId: "cnx_1" })
    expect(providerExternalIdFromCatalogId(id)).toBe(id)
  })

  it("has no external id for a cabin the payload gave no id", () => {
    expect(providerExternalIdFromCatalogId(null)).toBeNull()
  })
})

describe("cabin rate row join", () => {
  const content = {
    cruise: { name: "Castles Along the Rhine" },
    cabin_categories: [
      { id: "88-from-2027_CLASSIC", code: "CLASSIC", name: "Classic" },
      { id: "88-from-2027_SUITE", code: "SUITE", name: "Suite", view_type: "balcony" },
      { id: sourceRefId("cbcat", { externalId: "omi_V" }), code: "V", name: "Veranda" },
    ],
  }

  it("names a cabin whose catalog id is a bare provider id", () => {
    const detail = mapCruiseContent(content)
    expect(detail).not.toBeNull()
    const cabin = findCabinForPrice(detail?.cabins ?? [], price("88-from-2027_CLASSIC"))
    expect(cabin?.name).toBe("Classic")
  })

  it("still names a cabin whose catalog id is SourceRef-wrapped", () => {
    const detail = mapCruiseContent(content)
    expect(findCabinForPrice(detail?.cabins ?? [], price("omi_V"))?.name).toBe("Veranda")
  })

  it("resolves every cabin the pricing route returned for the affected cruise", () => {
    const detail = mapCruiseContent(content)
    const names = ["88-from-2027_CLASSIC", "88-from-2027_SUITE"].map(
      (code) => findCabinForPrice(detail?.cabins ?? [], price(code))?.name,
    )
    expect(names).toEqual(["Classic", "Suite"])
  })

  it("matches nothing for a code the catalog has no cabin for", () => {
    const detail = mapCruiseContent(content)
    expect(findCabinForPrice(detail?.cabins ?? [], price("88-from-2027_UNKNOWN"))).toBeUndefined()
  })

  it("does not join an unidentified cabin to an arbitrary price row", () => {
    const detail = mapCruiseContent({
      cruise: { name: "x" },
      cabin_categories: [{ name: "Classic" }],
    })
    expect(detail?.cabins[0]?.externalId).toBeNull()
    expect(findCabinForPrice(detail?.cabins ?? [], price("88-from-2027_CLASSIC"))).toBeUndefined()
  })
})
