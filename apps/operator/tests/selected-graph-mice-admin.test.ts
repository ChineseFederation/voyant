import { operatorAdminNavMessages } from "@voyant-travel/i18n"
import { CalendarRange } from "lucide-react"
import { describe, expect, it } from "vitest"

import {
  createSelectedGraphAdminExtensions,
  selectedGraphAdminExtensionFactories,
} from "../.voyant/admin/selected-graph-admin.generated.js"

describe("selected-graph MICE admin composition", () => {
  it("uses the selected package factory without compatibility duplication", () => {
    expect(selectedGraphAdminExtensionFactories["@voyant-travel/mice"]).toBeTypeOf("function")
  })

  it("preserves MICE navigation, routes, and destinations", () => {
    const extension = createSelectedGraphAdminExtensions({
      navMessages: operatorAdminNavMessages.ro.nav,
    }).find(({ id }) => id === "mice")

    expect(extension?.navigation).toEqual([
      {
        insertAfter: "bookings",
        items: [
          {
            id: "mice-programs",
            title: "Programe",
            url: "/mice",
            icon: CalendarRange,
          },
        ],
      },
    ])
    expect(
      extension?.routes?.map(({ id, path, destination, destinationParams }) => ({
        id,
        path,
        destination,
        destinationParams,
      })),
    ).toEqual([
      {
        id: "mice-programs-index",
        path: "/mice",
        destination: "mice.program.list",
        destinationParams: undefined,
      },
      {
        id: "mice-programs-detail",
        path: "/mice/$id",
        destination: "mice.program.detail",
        destinationParams: { id: "programId" },
      },
    ])
  })
})
