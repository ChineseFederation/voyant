import { operatorAdminNavMessages } from "@voyant-travel/i18n"
import { FileText } from "lucide-react"
import { describe, expect, it } from "vitest"

import {
  createSelectedGraphAdminExtensions,
  selectedGraphAdminExtensionFactories,
} from "../.voyant/admin/selected-graph-admin.generated.js"

describe("selected-graph Proposals admin composition", () => {
  it("uses the selected package factory without compatibility duplication", () => {
    expect(selectedGraphAdminExtensionFactories["@voyant-travel/proposals"]).toBeTypeOf("function")
  })

  it("preserves Proposals navigation, routes, destinations, and package copy", () => {
    const extension = createSelectedGraphAdminExtensions({
      navMessages: operatorAdminNavMessages.ro.nav,
    }).find(({ id }) => id === "proposals")

    expect(extension?.navigation).toEqual([
      {
        insertAfter: "bookings",
        items: [
          {
            id: "proposals",
            title: "Oferte",
            url: "/proposals",
            icon: FileText,
          },
        ],
      },
    ])
    expect(
      extension?.routes?.map(
        ({ id, path, title, destination, destinationParams, ssr, routeMessagesProvider }) => ({
          id,
          path,
          title,
          destination,
          destinationParams,
          ssr,
          hasRouteMessagesProvider: typeof routeMessagesProvider === "function",
        }),
      ),
    ).toEqual([
      {
        id: "proposals-index",
        path: "/proposals",
        title: "Oferte",
        destination: "proposal.list",
        destinationParams: undefined,
        ssr: "data-only",
        hasRouteMessagesProvider: true,
      },
      {
        id: "proposals-detail",
        path: "/proposals/$id",
        title: "Oferte",
        destination: "proposal.detail",
        destinationParams: { id: "proposalId" },
        ssr: "data-only",
        hasRouteMessagesProvider: true,
      },
    ])
  })
})
