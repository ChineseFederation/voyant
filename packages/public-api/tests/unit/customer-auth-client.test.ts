import { describe, expect, it, vi } from "vitest"

import { createCustomerAuthClient } from "../../src/customer-auth-client.js"

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("framework-neutral customer auth client", () => {
  it("parses enabled configuration when the server omits disabled=false", async () => {
    const fetcher = vi.fn(async () =>
      response({
        methods: {
          emailCode: true,
          emailPassword: true,
          google: false,
          facebook: false,
          apple: false,
        },
        accountPolicy: {
          allowedKinds: ["personal", "business"],
          personalSignup: "open",
          businessOnboarding: "request",
        },
      }),
    )
    const config = await createCustomerAuthClient({ baseUrl: "/api/", fetcher }).getConfiguration()
    expect(config).toEqual(expect.objectContaining({ disabled: false }))
    expect(fetcher).toHaveBeenCalledWith("/api/auth/customer/config", {
      method: "GET",
      credentials: "include",
    })
  })

  it("parses disabled configuration without inventing an account policy", async () => {
    const fetcher = vi.fn(async () =>
      response({
        disabled: true,
        methods: {
          emailCode: false,
          emailPassword: false,
          google: false,
          facebook: false,
          apple: false,
        },
      }),
    )
    await expect(
      createCustomerAuthClient({ baseUrl: "/api", fetcher }).getConfiguration(),
    ).resolves.toEqual(expect.objectContaining({ disabled: true }))
  })

  it("lists and selects buyer accounts through credentialed BFF paths", async () => {
    const personal = {
      id: "personal:user-1",
      name: "Personal",
      kind: "personal",
      authOrganizationId: null,
      relationshipOrganizationId: null,
      relationshipPersonId: "person-1",
      membershipId: null,
      membershipRole: null,
    }
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          accounts: [personal],
          activeAccount: personal,
          requiresSelection: false,
          policy: {
            allowedKinds: ["personal"],
            personalSignup: "open",
            businessOnboarding: "disabled",
          },
        }),
      )
      .mockResolvedValueOnce(response({ activeAccount: personal }))
    const client = createCustomerAuthClient({ baseUrl: "/api", fetcher })

    await expect(client.listBuyerAccounts()).resolves.toEqual(
      expect.objectContaining({ activeAccount: personal }),
    )
    await expect(client.selectBuyerAccount(personal.id)).resolves.toEqual(personal)
    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/auth/customer/buyer-accounts", {
      method: "GET",
      credentials: "include",
    })
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/auth/customer/buyer-accounts/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: personal.id }),
      credentials: "include",
    })
  })

  it("surfaces the server error response", async () => {
    const client = createCustomerAuthClient({
      baseUrl: "/api",
      fetcher: async () => response({ error: "Selection is no longer available" }, 403),
    })
    await expect(client.listBuyerAccounts()).rejects.toThrow("Selection is no longer available")
  })

  it("preserves mutation response headers for SSR Set-Cookie forwarding", async () => {
    const personal = {
      id: "personal:user-1",
      name: "Personal",
      kind: "personal",
      authOrganizationId: null,
      relationshipOrganizationId: null,
      relationshipPersonId: "person-1",
      membershipId: null,
      membershipRole: null,
    }
    const client = createCustomerAuthClient({
      baseUrl: "/api",
      fetcher: async () =>
        new Response(JSON.stringify({ activeAccount: personal }), {
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": "voyant_customer_session=rotated; Path=/; HttpOnly",
          },
        }),
    })

    const result = await client.selectBuyerAccountWithResponse(personal.id)

    expect(result.data).toEqual(personal)
    expect(result.response.headers.get("set-cookie")).toContain("voyant_customer_session=rotated")
  })

  it("exposes raw Better Auth endpoints for framework sign-in proxies", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }))
    const client = createCustomerAuthClient({ baseUrl: "/api/", fetcher })

    const result = await client.request("sign-in/email", {
      method: "POST",
      body: "{}",
    })

    expect(result.status).toBe(204)
    expect(fetcher).toHaveBeenCalledWith("/api/auth/customer/sign-in/email", {
      method: "POST",
      body: "{}",
      credentials: "include",
    })
  })

  it("creates and manages business account requests through exact credentialed paths", async () => {
    const request = businessRequest()
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(request))
      .mockResolvedValueOnce(response([request]))
      .mockResolvedValueOnce(response({ ...request, status: "canceled" }))
    const client = createCustomerAuthClient({ baseUrl: "/api/", fetcher })
    const input = { idempotencyKey: "request-12345678", profile: businessProfile }

    await expect(client.requestBusinessAccount(input)).resolves.toEqual(request)
    await expect(client.listBusinessAccountRequests()).resolves.toEqual([request])
    await expect(client.cancelBusinessAccountRequest("request/id")).resolves.toMatchObject({
      status: "canceled",
    })

    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/auth/customer/business-account-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      credentials: "include",
    })
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/auth/customer/business-account-requests", {
      method: "GET",
      credentials: "include",
    })
    expect(fetcher).toHaveBeenNthCalledWith(
      3,
      "/api/auth/customer/business-account-requests/request%2Fid",
      { method: "DELETE", credentials: "include" },
    )
  })

  it("preserves cookie rotation when creating an account or accepting an invitation", async () => {
    const account = businessAccount()
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(cookieResponse(account, "created"))
      .mockResolvedValueOnce(cookieResponse({ account }, "invited"))
    const client = createCustomerAuthClient({ baseUrl: "/api", fetcher })

    const created = await client.createBusinessAccountWithResponse({
      idempotencyKey: "create-12345678",
      profile: businessProfile,
    })
    const accepted = await client.acceptBusinessInvitationWithResponse({
      invitationId: "invite/id",
    })

    expect(created.data).toEqual(account)
    expect(created.response.headers.get("set-cookie")).toContain("created")
    expect(accepted.data.account).toEqual(account)
    expect(accepted.response.headers.get("set-cookie")).toContain("invited")
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "/api/auth/customer/business-account-invitations/accept",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationId: "invite/id" }),
        credentials: "include",
      },
    )
  })

  it("surfaces structured customer auth errors", async () => {
    const client = createCustomerAuthClient({
      baseUrl: "/api",
      fetcher: async () => response({ error: { message: "Request is no longer pending" } }, 409),
    })

    await expect(client.listBusinessAccountRequests()).rejects.toThrow(
      "Request is no longer pending",
    )
  })
})

const businessProfile = {
  name: "Acme Travel",
  legalName: null,
  taxId: null,
  website: null,
}

function businessAccount() {
  return {
    id: "business:auth-org-1",
    kind: "business" as const,
    name: "Acme Travel",
    authOrganizationId: "auth-org-1",
    relationshipOrganizationId: "relationship-org-1",
    relationshipPersonId: null,
    membershipId: "membership-1",
    membershipRole: "owner" as const,
  }
}

function businessRequest() {
  return {
    id: "request-1",
    requesterUserId: "customer-1",
    requesterEmail: "customer@example.com",
    requesterName: "Customer One",
    publicApiOrigin: "https://shop.example.com",
    mode: "request" as const,
    profile: businessProfile,
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
}

function cookieResponse(body: unknown, marker: string) {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `voyant-customer.session=${marker}; Path=/; HttpOnly`,
    },
  })
}
