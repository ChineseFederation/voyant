import type { CustomerBuyerAccount } from "@voyant-travel/public-api/customer-auth-client"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { VoyantFetcher } from "../customer-portal/client.js"
import {
  type BuyerAccountContextValue,
  BuyerAccountProvider,
  BuyerAccountSelector,
  createBuyerAccountFetcher,
  useBuyerAccounts,
} from "./buyer-account-provider.js"

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("BuyerAccountProvider", () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it("loads personal/business accounts and refetches session state after selection", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    let selected = false
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (url.endsWith("/buyer-accounts/active")) {
        selected = true
        return Response.json({ activeAccount: businessAccount })
      }
      if (url.endsWith("/buyer-accounts")) {
        return Response.json({
          accounts: [personalAccount, businessAccount],
          activeAccount: selected ? businessAccount : personalAccount,
          policy,
          requiresSelection: false,
        })
      }
      if (url.endsWith("/get-session")) {
        return Response.json({
          session: {
            id: selected ? "session-business" : "session-personal",
            userId: "customer-1",
          },
          user: { id: "customer-1" },
        })
      }
      if (url.endsWith("/business-account-requests")) {
        return Response.json([])
      }
      return new Response(null, { status: 404 })
    })
    const stateRef: { current: BuyerAccountContextValue | null } = {
      current: null,
    }
    const currentState = (): BuyerAccountContextValue => {
      if (!stateRef.current) throw new Error("Buyer account state was not rendered")
      return stateRef.current
    }

    await act(async () => {
      root.render(
        <BuyerAccountProvider baseUrl="/api" fetcher={fetcher}>
          <StateProbe onState={(value) => (stateRef.current = value)} />
          <BuyerAccountSelector />
        </BuyerAccountProvider>,
      )
    })

    expect(currentState().loading).toBe(false)
    expect(currentState().accounts.map((account) => account.kind)).toEqual(["personal", "business"])
    expect(currentState().active?.id).toBe("buyer-personal")
    expect(currentState().policy).toEqual(policy)
    expect(host.textContent).toContain("Personal account")
    expect(host.textContent).toContain("Acme Corp")

    await act(async () => {
      await currentState().selectAccount("buyer-business")
    })

    expect(currentState().active?.id).toBe("buyer-business")
    expect(currentState().session?.session.id).toBe("session-business")
    expect(calls.filter(({ url }) => url.endsWith("/buyer-accounts"))).toHaveLength(2)
    expect(calls.filter(({ url }) => url.endsWith("/get-session"))).toHaveLength(2)
    expect(calls.find(({ url }) => url.endsWith("/buyer-accounts/active"))?.init).toMatchObject({
      method: "POST",
      credentials: "include",
    })
    expect(calls.every(({ init }) => init?.credentials === "include")).toBe(true)
  })

  it("forces credentialed fetches even when a caller supplies another mode", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }))
    const credentialed = createBuyerAccountFetcher(fetcher)

    await credentialed("/api/auth/customer/buyer-accounts", {
      credentials: "omit",
    })

    expect(fetcher).toHaveBeenCalledWith("/api/auth/customer/buyer-accounts", {
      credentials: "include",
    })
  })

  it("loads and refreshes requests only for request onboarding", async () => {
    const requests = [businessRequest]
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/buyer-accounts")) return buyerAccountListResponse("request")
      if (url.endsWith("/get-session")) return sessionResponse()
      if (url.endsWith("/business-account-requests") && init?.method === "POST") {
        requests.push({ ...businessRequest, id: "request-2", profile: businessProfile("New Co") })
        return Response.json(requests.at(-1))
      }
      if (url.endsWith("/business-account-requests") && init?.method === "GET") {
        return Response.json(requests)
      }
      if (url.endsWith("/business-account-requests/request-1")) {
        requests.splice(0, 1)
        return Response.json({ ...businessRequest, status: "canceled" })
      }
      return new Response(null, { status: 404 })
    })
    const stateRef = await renderProvider(root, fetcher)

    expect(stateRef.current?.businessAccountRequests).toEqual([businessRequest])

    await act(async () => {
      await stateRef.current?.requestBusinessAccount({
        idempotencyKey: "request-23456789",
        profile: businessProfile("New Co"),
      })
    })
    expect(stateRef.current?.businessAccountRequests).toHaveLength(2)

    await act(async () => {
      await stateRef.current?.cancelBusinessAccountRequest("request-1")
    })
    expect(stateRef.current?.businessAccountRequests.map(({ id }) => id)).toEqual(["request-2"])
    expect(fetcher.mock.calls.every(([, init]) => init?.credentials === "include")).toBe(true)
  })

  it("creates and explicitly activates an open-onboarding business account", async () => {
    let created = false
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("/business-accounts")) {
        created = true
        return Response.json(businessAccount)
      }
      if (url.endsWith("/buyer-accounts/active")) {
        return Response.json({ activeAccount: businessAccount })
      }
      if (url.endsWith("/buyer-accounts")) {
        return buyerAccountListResponse("open", created ? businessAccount : personalAccount)
      }
      if (url.endsWith("/get-session")) return sessionResponse()
      return new Response(null, { status: 404 })
    })
    const stateRef = await renderProvider(root, fetcher)

    await act(async () => {
      await stateRef.current?.createBusinessAccount({
        idempotencyKey: "create-12345678",
        profile: businessProfile("Acme Corp"),
      })
    })

    expect(stateRef.current?.active?.id).toBe(businessAccount.id)
    expect(fetcher.mock.calls.some(([url]) => url.endsWith("/buyer-accounts/active"))).toBe(true)
    expect(fetcher.mock.calls.some(([url]) => url.endsWith("/business-account-requests"))).toBe(
      false,
    )
  })

  it("accepts invite-only membership roles and refreshes account state", async () => {
    const invitedAccount = { ...businessAccount, membershipRole: "member" as const }
    let accepted = false
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("/business-account-invitations/accept")) {
        accepted = true
        return Response.json({ account: invitedAccount })
      }
      if (url.endsWith("/buyer-accounts")) {
        return buyerAccountListResponse("invite-only", accepted ? invitedAccount : personalAccount)
      }
      if (url.endsWith("/get-session")) return sessionResponse()
      return new Response(null, { status: 404 })
    })
    const stateRef = await renderProvider(root, fetcher)

    await act(async () => {
      await expect(
        stateRef.current?.acceptBusinessInvitation({ invitationId: "invitation-1" }),
      ).resolves.toMatchObject({ membershipRole: "member" })
    })

    expect(stateRef.current?.active).toMatchObject({ membershipRole: "member" })
  })

  it("preserves request state when a refresh fails and blocks disabled onboarding", async () => {
    let failRefresh = false
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/buyer-accounts")) return buyerAccountListResponse("request")
      if (url.endsWith("/get-session")) return sessionResponse()
      if (url.endsWith("/business-account-requests") && init?.method === "POST") {
        failRefresh = true
        return Response.json({ ...businessRequest, id: "request-2" })
      }
      if (url.endsWith("/business-account-requests")) {
        return failRefresh
          ? Response.json({ error: { message: "Refresh failed" } }, { status: 503 })
          : Response.json([businessRequest])
      }
      return new Response(null, { status: 404 })
    })
    const stateRef = await renderProvider(root, fetcher)

    await act(async () => {
      await expect(
        stateRef.current?.requestBusinessAccount({
          idempotencyKey: "request-23456789",
          profile: businessProfile("New Co"),
        }),
      ).rejects.toThrow("Refresh failed")
    })

    expect(stateRef.current?.businessAccountRequests).toEqual([businessRequest])
    expect(stateRef.current?.error?.message).toBe("Refresh failed")
  })

  it("does not expose customer-initiated onboarding when the policy is disabled", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("/buyer-accounts")) return buyerAccountListResponse("disabled")
      if (url.endsWith("/get-session")) return sessionResponse()
      return new Response(null, { status: 404 })
    })
    const stateRef = await renderProvider(root, fetcher)

    await expect(
      stateRef.current?.createBusinessAccount({
        idempotencyKey: "create-12345678",
        profile: businessProfile("Blocked Co"),
      }),
    ).rejects.toThrow("not available")
    await expect(
      stateRef.current?.acceptBusinessInvitation({ invitationId: "invitation-1" }),
    ).rejects.toThrow("disabled")
    expect(fetcher.mock.calls.some(([url]) => url.endsWith("/business-accounts"))).toBe(false)
  })
})

function StateProbe({ onState }: { onState: (state: BuyerAccountContextValue) => void }) {
  onState(useBuyerAccounts())
  return null
}

async function renderProvider(root: Root, fetcher: VoyantFetcher) {
  const stateRef: { current: BuyerAccountContextValue | null } = { current: null }
  await act(async () => {
    root.render(
      <BuyerAccountProvider baseUrl="/api" fetcher={fetcher}>
        <StateProbe onState={(value) => (stateRef.current = value)} />
      </BuyerAccountProvider>,
    )
  })
  return stateRef
}

const policy = {
  allowedKinds: ["personal", "business"] as Array<"personal" | "business">,
  personalSignup: "open" as const,
  businessOnboarding: "request" as const,
}

const personalAccount = {
  id: "buyer-personal",
  name: "Personal account",
  kind: "personal" as const,
  authOrganizationId: null,
  relationshipOrganizationId: null,
  relationshipPersonId: "person-1",
  membershipId: null,
  membershipRole: null,
}

const businessAccount = {
  id: "buyer-business",
  name: "Acme Corp",
  kind: "business" as const,
  authOrganizationId: "auth-org-1",
  relationshipOrganizationId: "relationship-org-1",
  relationshipPersonId: null,
  membershipId: "membership-1",
  membershipRole: "owner" as const,
}

const businessRequest = {
  id: "request-1",
  requesterUserId: "customer-1",
  requesterEmail: "customer@example.com",
  requesterName: "Customer One",
  publicApiOrigin: "https://shop.example.com",
  mode: "request" as const,
  profile: businessProfile("Acme Corp"),
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

function businessProfile(name: string) {
  return { name, legalName: null, taxId: null, website: null }
}

function buyerAccountListResponse(
  businessOnboarding: "disabled" | "open" | "request" | "invite-only",
  activeAccount: CustomerBuyerAccount = personalAccount,
) {
  return Response.json({
    accounts:
      activeAccount.kind === "business" ? [personalAccount, activeAccount] : [personalAccount],
    activeAccount,
    policy: {
      allowedKinds: ["personal", "business"],
      personalSignup: "open",
      businessOnboarding,
    },
    requiresSelection: false,
  })
}

function sessionResponse() {
  return Response.json({
    session: { id: "session-1", userId: "customer-1" },
    user: { id: "customer-1" },
  })
}
