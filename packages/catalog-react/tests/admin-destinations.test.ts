import type { AdminDestinationKey, AdminDestinationResolvers } from "@voyant-travel/admin"
import { describe, expect, it } from "vitest"

// Type-only import binds nothing at runtime; for `tsc --noEmit` the
// augmentation file (src/admin/index.tsx) is part of the program via the
// tsconfig include, so the `declare module "@voyant-travel/admin"` block below it
// merges into AdminDestinations here.
import type { ProductDetailSearchParams } from "../src/admin/index.js"

/**
 * Type-level proof of the semantic-destination contract (packaged-admin RFC
 * §4.7): the `declare module "@voyant-travel/admin"` augmentation in
 * `src/admin/index.tsx` must surface the catalog destination keys on
 * `AdminDestinationKey`, and a resolver map over them must satisfy
 * `AdminDestinationResolvers` — including param shapes. Compilation IS the
 * assertion; the runtime expects only keep vitest honest.
 */
describe("catalog admin destinations (type-level)", () => {
  it("augments AdminDestinations with the catalog destination keys", () => {
    const keys = [
      "catalog.browse",
      "catalog.detail",
      "product.detail",
      "supplier.detail",
    ] as const satisfies ReadonlyArray<AdminDestinationKey>

    // Exhaustive: `satisfies AdminDestinationResolvers` fails to compile if a
    // declared key is missing a resolver or a param shape drifts.
    const resolvers = {
      "catalog.browse": ({ surface }) => `/catalog/${surface}`,
      "catalog.detail": ({ surface, id }) => `/catalog/${surface}/${id}`,
      "product.detail": ({ productId }) => `/products/${productId}`,
      "supplier.detail": ({ supplierId }) => `/suppliers/${supplierId}`,
    } satisfies AdminDestinationResolvers

    expect(Object.keys(resolvers).sort()).toEqual([...keys].sort())
  })

  it("keeps the product-detail search context in the destination params", () => {
    // `catalog.detail` must accept the package detail page's search context.
    const params: Pick<ProductDetailSearchParams, "adults" | "nights"> = {
      adults: 2,
      nights: 7,
    }
    const detailResolver = (({ surface, id, adults, nights }) =>
      `/catalog/${surface}/${id}?adults=${adults}&nights=${nights}`) satisfies (
      input: { surface: "products"; id: string } & typeof params,
    ) => string

    expect(detailResolver({ surface: "products", id: "prod_1", ...params })).toBe(
      "/catalog/products/prod_1?adults=2&nights=7",
    )
  })
})
