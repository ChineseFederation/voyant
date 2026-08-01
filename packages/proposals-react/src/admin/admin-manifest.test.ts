import { FileText } from "lucide-react"
import { describe, expect, it } from "vitest"

import { proposalsVoyantModule } from "../../../proposals/src/voyant.js"
import { createProposalsAdminExtension, createSelectedProposalsAdminExtension } from "./index.js"

describe("proposals admin deployment facets", () => {
  it("tracks the package-owned extension routes and copy provider", () => {
    const extension = createProposalsAdminExtension()
    expect(proposalsVoyantModule.admin?.runtime).toEqual({
      entry: "@voyant-travel/proposals-react/admin",
      export: "createSelectedProposalsAdminExtension",
    })
    expect(proposalsVoyantModule.admin?.routes?.map((route) => route.path)).toEqual(
      extension.routes?.map((route) => route.path),
    )
    expect(extension.routes?.map((route) => route.destination)).toEqual([
      "proposal.list",
      "proposal.detail",
    ])
    expect(proposalsVoyantModule.admin?.routes?.map((route) => route.runtime)).toEqual(
      extension.routes?.map(() => ({
        entry: "@voyant-travel/proposals-react/admin",
        export: "createSelectedProposalsAdminExtension",
      })),
    )
    expect(proposalsVoyantModule.admin?.copy).toEqual([
      {
        id: "@voyant-travel/proposals#admin.copy",
        namespace: "proposals.admin",
        fallbackLocale: "en",
        runtime: {
          entry: "@voyant-travel/proposals-react/i18n",
          export: "crmUiMessageDefinitions",
        },
      },
    ])
    expect(
      extension.routes?.every((route) => typeof route.routeMessagesProvider === "function"),
    ).toBe(true)
  })

  it("owns the selected Operator label and icon adapter", () => {
    const extension = createSelectedProposalsAdminExtension({
      navMessages: { proposals: "Oferte" },
    })

    expect(extension.navigation?.[0]?.items[0]).toMatchObject({ title: "Oferte", icon: FileText })
    expect(extension.routes?.map((route) => route.title)).toEqual(["Oferte", "Oferte"])
  })
})
