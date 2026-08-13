import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { AccessCatalog } from "@voyant-travel/types/api-keys"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  apiTokenPresets,
  defaultTokenPermissions,
  grantedActionCount,
  isFullAccess,
  isResourceGranted,
  matchesScopeSearch,
  setActionGrant,
  setFullAccess,
  setResourceGrant,
} from "./components/api-token-scopes.js"
import { ServiceApiKeysPage } from "./components/service-api-keys-page.js"
import { VoyantAuthProvider, type VoyantFetcher } from "./index.js"

const selectedCatalog: AccessCatalog = {
  resources: [
    {
      id: "bookings",
      unitId: "@voyant-travel/bookings",
      resource: "bookings",
      label: "Selected Bookings",
      description: "Selected booking permissions.",
      wildcard: "allow",
      actions: [
        { action: "read", label: "Selected read", description: "Read bookings." },
        {
          action: "export",
          label: "Export bookings",
          description: "Export bookings.",
          sensitive: true,
          wildcard: "explicit",
        },
      ],
    },
  ],
  presets: [
    {
      id: "catalog-read",
      kind: "api-token",
      label: "Catalog read",
      description: "Read the catalog.",
      grants: ["bookings:read"],
    },
    {
      id: "agent-staff",
      kind: "api-token-grant",
      label: "Agent (staff)",
      description: "Staff agent grant.",
      audience: "staff",
      grants: ["bookings:read"],
    },
    {
      id: "editor",
      kind: "staff",
      label: "Editor",
      description: "A member role, not a token preset.",
      grants: ["bookings:read"],
    },
  ],
}

const bookings = selectedCatalog.resources[0]!

function render(node: ReactNode): string {
  const fetcher: VoyantFetcher = async () => new Response(null, { status: 204 })
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <VoyantAuthProvider baseUrl="https://operator.example/api" fetcher={fetcher}>
        {node}
      </VoyantAuthProvider>
    </QueryClientProvider>,
  )
}

describe("ServiceApiKeysPage access catalog", () => {
  it("fails loudly when the deployment supplies no catalog", () => {
    const html = render(<ServiceApiKeysPage />)

    // Without a catalog the create form's only possible outcome is "Select at
    // least one permission.", so the page refuses instead of offering it (#4618).
    expect(html).toContain("Permissions are unavailable")
    expect(html).toContain("New token")
    expect(html).toContain('disabled=""')
  })

  it("keeps the create affordance usable when the catalog arrived", () => {
    const html = render(<ServiceApiKeysPage accessCatalog={selectedCatalog} />)

    expect(html).not.toContain("Permissions are unavailable")
    expect(html).not.toContain('disabled=""')
  })
})

describe("api token scope selection", () => {
  it("offers both token preset kinds and never a member role", () => {
    expect(apiTokenPresets(selectedCatalog).map((preset) => preset.id)).toEqual([
      "catalog-read",
      "agent-staff",
    ])
  })

  it("drives its labels from the deployment catalog, not a built-in list", () => {
    expect(matchesScopeSearch(bookings, "Selected Bookings")).toBe(true)
    expect(matchesScopeSearch(bookings, "Selected read")).toBe(true)
    expect(matchesScopeSearch(bookings, "cancel bookings")).toBe(false)
  })

  it("names explicit-wildcard actions alongside the resource wildcard", () => {
    // `bookings:*` alone does not satisfy an `explicit` action, so a group grant
    // that stored only `*` would lock boxes it had not actually granted.
    const granted = setResourceGrant({}, bookings, true)

    expect(granted.bookings).toEqual(["*", "export"])
    expect(isResourceGranted(granted, bookings)).toBe(true)
    expect(grantedActionCount(granted, bookings, selectedCatalog)).toBe(2)
  })

  it("revokes the whole group without stranding leftover actions", () => {
    const granted = setResourceGrant({}, bookings, true)

    expect(setResourceGrant(granted, bookings, false)).toEqual({})
  })

  it("toggles a single action", () => {
    const withRead = setActionGrant({}, "bookings", "read", true)

    expect(withRead).toEqual({ bookings: ["read"] })
    expect(isResourceGranted(withRead, bookings)).toBe(false)
    expect(grantedActionCount(withRead, bookings, selectedCatalog)).toBe(1)
    expect(setActionGrant(withRead, "bookings", "read", false)).toEqual({})
  })

  it("replaces the selection when full access is applied and clears it when removed", () => {
    expect(setFullAccess(true)).toEqual({ "*": ["*"] })
    expect(isFullAccess(setFullAccess(true))).toBe(true)
    expect(setFullAccess(false)).toEqual({})
  })

  it("matches an empty search and misses an unrelated term", () => {
    expect(matchesScopeSearch(bookings, "")).toBe(true)
    expect(matchesScopeSearch(bookings, "invoices")).toBe(false)
  })

  it("seeds a new token from the catalog-read preset", () => {
    expect(defaultTokenPermissions(selectedCatalog)).toEqual({ bookings: ["read"] })
    expect(defaultTokenPermissions({ resources: [], presets: [] })).toEqual({})
  })
})
