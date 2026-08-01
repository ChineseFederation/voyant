import { operatorAdminNavMessages } from "@voyant-travel/i18n"
import { Route, ScrollText, Tag } from "lucide-react"
import { describe, expect, it } from "vitest"

import {
  createSelectedGraphAdminExtensions,
  selectedGraphAdminExtensionFactories,
} from "../.voyant/admin/selected-graph-admin.generated.js"

describe("selected-graph Action Ledger admin composition", () => {
  it("uses the selected package factory without compatibility duplication", () => {
    expect(selectedGraphAdminExtensionFactories["@voyant-travel/action-ledger"]).toBeTypeOf(
      "function",
    )
    expect(
      createSelectedGraphAdminExtensions({ navMessages: operatorAdminNavMessages.en.nav }).map(
        ({ id }) => id,
      ),
    ).toEqual([
      "setup",
      "distribution-channel-push",
      "bookings",
      "catalog",
      "inventory",
      "auth-team",
      "customer-business-accounts",
      "storefronts",
      "operations",
      "operator-settings",
      "custom-fields",
      "navigation-preferences",
      "relationships",
      "operator-webhooks",
      "distribution",
      "finance",
      "flights",
      "legal",
      "reporting",
      "notifications",
      "commerce",
      "trips",
      "proposals",
      "mice",
      "realtime",
      "action-ledger",
      "media",
      "apps",
      "event-catalog",
    ])
  })

  it("preserves localized navigation, route copy, and icon behavior", () => {
    const extension = createSelectedGraphAdminExtensions({
      navMessages: operatorAdminNavMessages.ro.nav,
    }).find(({ id }) => id === "action-ledger")

    expect(extension?.navigation).toEqual([
      {
        order: 60,
        items: [
          {
            id: "action-ledger",
            title: "Jurnal actiuni",
            url: "/action-ledger",
            icon: ScrollText,
          },
        ],
      },
    ])
    expect(
      extension?.routes?.map(({ id, path, title, ssr }) => ({ id, path, title, ssr })),
    ).toEqual([
      {
        id: "action-ledger-index",
        path: "/action-ledger",
        title: "Jurnal actiuni",
        ssr: "data-only",
      },
    ])
  })

  it("keeps migrated copy providers and icons package-owned", () => {
    const extensions = createSelectedGraphAdminExtensions({
      navMessages: operatorAdminNavMessages.ro.nav,
    })

    for (const id of [
      "bookings",
      "catalog",
      "inventory",
      "operations",
      "relationships",
      "distribution",
      "finance",
      "flights",
      "legal",
      "notifications",
      "commerce",
    ]) {
      const renderedRoutes = extensions
        .find((extension) => extension.id === id)
        ?.routes?.filter((route) => !route.redirectTo)
      expect(renderedRoutes?.length, id).toBeGreaterThan(0)
      expect(
        renderedRoutes?.every((route) => route.routeMessagesProvider),
        id,
      ).toBe(true)
    }

    expect(extensions.find(({ id }) => id === "commerce")?.navigation?.[0]?.items[0]?.icon).toBe(
      Tag,
    )
    expect(extensions.find(({ id }) => id === "trips")?.navigation?.[0]?.items[0]?.icon).toBe(Route)

    expect(extensions.find(({ id }) => id === "trips")?.widgets?.map(({ slot }) => slot)).toContain(
      "bookings.list.header-actions",
    )
    expect(
      extensions.find(({ id }) => id === "finance")?.widgets?.map(({ slot }) => slot),
    ).toContain("booking.details.payment-controller")
    expect(
      extensions.find(({ id }) => id === "operations")?.widgets?.map(({ slot }) => slot),
    ).toContain("product.details.option-extras")
  })
})
