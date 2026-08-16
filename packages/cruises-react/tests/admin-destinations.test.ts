import type { AdminDestinationKey, AdminDestinationResolvers } from "@voyant-travel/admin"
import { buildAdminExtensionDestinations } from "@voyant-travel/admin/app/extension-routes"
import { describe, expect, it } from "vitest"

import { createCruisesAdminExtension } from "../src/admin/index.js"

/**
 * The semantic-destination contract (packaged-admin RFC §4.7). The ship pages
 * link by key rather than by importing a host route tree, and the host's
 * resolver map is `Partial`, so a key with no resolver degrades to `"#"` at
 * runtime rather than failing a build — a dead link, silently.
 *
 * A type-level proof cannot catch that: it shows a resolver map *could*
 * satisfy the keys, not that the routes bind them, so it passes just as
 * happily when nothing is wired. The behavioural assertions below drive the
 * host's own collector over the real extension instead.
 */
describe("cruises admin destinations", () => {
  it("binds both ship destinations on the route contributions", () => {
    const routes = createCruisesAdminExtension().routes ?? []

    expect(routes.find((route) => route.id === "cruises-ships-index")?.destination).toBe(
      "cruiseShip.list",
    )
    expect(routes.find((route) => route.id === "cruises-ships-detail")?.destination).toBe(
      "cruiseShip.detail",
    )
  })

  it("resolves through the host collector rather than falling back to #", () => {
    const resolvers = buildAdminExtensionDestinations([createCruisesAdminExtension()])

    expect(resolvers["cruiseShip.list"]?.({})).toBe("/catalog/ships")
    expect(resolvers["cruiseShip.detail"]?.({ shipId: "cruise_ships_01" })).toBe(
      "/catalog/ships/cruise_ships_01",
    )
  })

  it("carries the mount path a host renamed the surface to", () => {
    const resolvers = buildAdminExtensionDestinations([
      createCruisesAdminExtension({ path: "/fleet" }),
    ])

    expect(resolvers["cruiseShip.list"]?.({})).toBe("/fleet")
    expect(resolvers["cruiseShip.detail"]?.({ shipId: "cruise_ships_01" })).toBe(
      "/fleet/cruise_ships_01",
    )
  })

  it("augments AdminDestinations with the ship destination keys", () => {
    const keys = [
      "cruiseShip.list",
      "cruiseShip.detail",
    ] as const satisfies ReadonlyArray<AdminDestinationKey>

    // Exhaustive: `satisfies AdminDestinationResolvers` fails to compile if a
    // declared key is missing a resolver or a param shape drifts.
    const resolvers = {
      "cruiseShip.list": () => "/catalog/ships",
      "cruiseShip.detail": ({ shipId }) => `/catalog/ships/${shipId}`,
    } satisfies AdminDestinationResolvers

    expect(Object.keys(resolvers).sort()).toEqual([...keys].sort())
  })
})
