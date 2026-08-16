// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { createSelectedCustomerBusinessAccountsAdminExtension } from "./admin.js"
import { CustomerBusinessAccountsPage } from "./components/customer-business-accounts-page.js"
import type { CustomerBusinessAccountsAdminApi } from "./customer-business-accounts-admin-api.js"
import { authQueryKeys } from "./query-keys.js"

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("customer business-account admin surface", () => {
  it("contributes a lazy, data-only route and Building2 navigation", () => {
    const extension = createSelectedCustomerBusinessAccountsAdminExtension({
      navMessages: { businessAccounts: "Corporate customers" },
    })

    expect(extension.navigation?.[0]?.items[0]).toMatchObject({
      id: "customer-business-accounts",
      title: "Corporate customers",
      url: "/business-accounts",
    })
    expect(extension.navigation?.[0]?.items[0]?.icon).toBeTypeOf("object")
    expect(extension.routes?.[0]).toMatchObject({
      id: "customer-business-accounts",
      path: "/business-accounts",
      title: "Corporate customers",
      ssr: "data-only",
    })
    expect(extension.routes?.[0]?.loader).toBeTypeOf("function")
    expect(extension.routes?.[0]?.page).toBeTypeOf("function")
  })

  it("prefetches capabilities before request data with credentialed admin calls", async () => {
    const extension = createSelectedCustomerBusinessAccountsAdminExtension()
    const fetcher = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith("/capabilities")) {
        return Response.json({
          data: { viewRequests: true, decideRequests: false, provisionAccounts: false },
        })
      }
      return Response.json({ data: [businessRequest] })
    })
    const queryClient = new QueryClient()

    await extension.routes?.[0]?.loader?.({
      queryClient,
      runtime: { baseUrl: "/api", fetcher },
      params: {},
    })

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "/api/v1/admin/customer-business-accounts/capabilities",
      "/api/v1/admin/customer-business-accounts/requests",
    ])
    expect(fetcher.mock.calls.every(([, init]) => init?.credentials === "include")).toBe(true)
    expect(queryClient.getQueryData(authQueryKeys.customerBusinessAccountRequests())).toEqual([
      businessRequest,
    ])
  })

  it("renders provider-neutral requests and capability-driven decisions", () => {
    const queryClient = seededQueryClient({ viewRequests: true, decideRequests: true })
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <CustomerBusinessAccountsPage api={pageApi()} />
      </QueryClientProvider>,
    )

    expect(html).toContain("Acme Travel")
    expect(html).toContain("customer@example.com")
    expect(html).toContain("Approve")
    expect(html).toContain("Reject")
    expect(html).not.toContain("WorkOS")
    expect(html).not.toContain("Better Auth")
  })

  it("shows a forbidden state when no business-account capability is available", () => {
    const queryClient = seededQueryClient({ viewRequests: false, decideRequests: false })
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <CustomerBusinessAccountsPage api={pageApi()} />
      </QueryClientProvider>,
    )

    expect(html).toContain("You do not have permission")
    expect(html).not.toContain("Acme Travel")
  })

  it("normalizes customer email and provisions either an existing CRM organization", async () => {
    const queryClient = seededQueryClient({
      viewRequests: false,
      decideRequests: false,
      provisionAccounts: true,
    })
    const api = pageApi()
    vi.mocked(api.provisionAccount).mockResolvedValue(businessAccount)
    const container = document.createElement("div")
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <CustomerBusinessAccountsPage api={api} />
        </QueryClientProvider>,
      )
    })

    setInput(container, "#customer-business-storefront-origin", "https://shop.example.com")
    setInput(container, "#customer-business-email", "  Buyer@Example.COM ")
    setInput(container, "#customer-business-relationship-organization", "crm-org-1")
    const form = container.querySelector("form")
    await act(async () => {
      form?.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }))
    })

    await vi.waitFor(() => expect(api.provisionAccount).toHaveBeenCalledOnce())
    expect(api.provisionAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        publicApiOrigin: "https://shop.example.com",
        owner: { email: "buyer@example.com" },
        relationshipOrganizationId: "crm-org-1",
      }),
    )
    expect(vi.mocked(api.provisionAccount).mock.calls[0]?.[0]).not.toHaveProperty("profile")

    await act(async () => root.unmount())
  })
})

function pageApi(): CustomerBusinessAccountsAdminApi {
  return {
    getCapabilities: vi.fn(async () => ({
      viewRequests: true,
      decideRequests: true,
      provisionAccounts: true,
    })),
    listRequests: vi.fn(async () => [businessRequest]),
    approveRequest: vi.fn(async () => ({ ...businessRequest, status: "approved" as const })),
    rejectRequest: vi.fn(async () => ({ ...businessRequest, status: "rejected" as const })),
    provisionAccount: vi.fn(async () => businessAccount),
  }
}

function seededQueryClient(capabilities: {
  viewRequests: boolean
  decideRequests: boolean
  provisionAccounts?: boolean
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  queryClient.setQueryData(authQueryKeys.customerBusinessAccountCapabilities(), {
    provisionAccounts: false,
    ...capabilities,
  })
  queryClient.setQueryData(authQueryKeys.customerBusinessAccountRequests(), [businessRequest])
  return queryClient
}

function setInput(container: HTMLElement, selector: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(selector)
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
  act(() => {
    setter?.call(input, value)
    input?.dispatchEvent(new Event("input", { bubbles: true }))
    input?.dispatchEvent(new Event("change", { bubbles: true }))
  })
}

const profile = {
  name: "Acme Travel",
  legalName: null,
  taxId: null,
  website: null,
}

const businessRequest = {
  id: "request-1",
  requesterUserId: "customer-1",
  requesterEmail: "customer@example.com",
  requesterName: null,
  publicApiOrigin: "https://shop.example.com",
  mode: "request" as const,
  profile,
  status: "pending" as const,
  idempotencyKey: "request-12345678",
  authOrganizationId: null,
  relationshipOrganizationId: null,
  createdAt: "2026-07-19T10:00:00.000Z",
  updatedAt: "2026-07-19T10:00:00.000Z",
  decidedAt: null,
  decidedBy: null,
  decisionReason: null,
}

const businessAccount = {
  id: "business:auth-org-1",
  kind: "business" as const,
  name: "Acme Travel",
  authOrganizationId: "auth-org-1",
  relationshipOrganizationId: "crm-org-1",
  relationshipPersonId: null,
  membershipId: "membership-1",
  membershipRole: "owner" as const,
}
