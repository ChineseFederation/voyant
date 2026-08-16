// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { createSelectedAuthTeamAdminExtension } from "./admin.js"
import { TeamManagementPage } from "./components/team-management-page.js"
import type { TeamManagementPageApi } from "./team-management-api.js"

function pageApi(): TeamManagementPageApi {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  }
}

function seedTeamQueries(
  queryClient: QueryClient,
  overrides: {
    inviteMembers?: boolean
    activateMembers?: boolean
    memberStatus?: "active" | "deactivated"
  } = {},
) {
  queryClient.setQueryData(["team-management", "capabilities"], {
    data: {
      viewMembers: true,
      inviteMembers: overrides.inviteMembers ?? false,
      manageRoles: false,
      activateMembers: overrides.activateMembers ?? false,
      deactivateMembers: false,
      revokeInvitations: false,
    },
  })
  queryClient.setQueryData(["team-management", "members"], {
    data: [
      {
        id: "member_1",
        email: "member@example.com",
        name: "Team Member",
        roleId: "editor",
        roleName: "Editor",
        status: overrides.memberStatus ?? "active",
        joinedAt: null,
        lastActivityAt: null,
      },
    ],
  })
  queryClient.setQueryData(["team-management", "roles"], {
    data: [{ id: "editor", name: "Editor", description: null }],
  })
  queryClient.setQueryData(["team-management", "invitations"], { data: [] })
}

describe("Auth team-management admin surface", () => {
  it("owns the stable settings route, copy, and icon", () => {
    const extension = createSelectedAuthTeamAdminExtension()
    const page = extension.settingsPages?.[0]

    expect(page).toMatchObject({ id: "team", path: "/team", title: "Team", label: "Team" })
    expect(page?.icon).toBeTypeOf("object")
    expect(page?.routeMessagesProvider).toBeTypeOf("function")
    expect(extension.setupSteps?.[0]).toMatchObject({
      id: "@voyant-travel/auth#setup.team",
      href: "/settings/team",
    })
  })

  it("renders neutral member data and nullable provider activity without auth-mode discovery", () => {
    const queryClient = new QueryClient()
    seedTeamQueries(queryClient)
    const api = pageApi()

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <TeamManagementPage api={api} />
      </QueryClientProvider>,
    )

    expect(html).toContain("Team Member")
    expect(html).toContain("Not provided")
    expect(html).not.toContain("membershipId")
    expect(html).not.toContain("externalUserId")
    expect(api.get).not.toHaveBeenCalledWith("/auth/bootstrap-status")
  })

  it("renders a neutral activation action for deactivated members when capable", () => {
    const queryClient = new QueryClient()
    seedTeamQueries(queryClient, { activateMembers: true, memberStatus: "deactivated" })

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <TeamManagementPage api={pageApi()} />
      </QueryClientProvider>,
    )

    expect(html).toContain('aria-label="Activate Team Member"')
    expect(html).not.toContain("Voyant Cloud")
    expect(html).not.toContain("Better Auth")
  })

  it("preserves and presents the creation-only invitation URL", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
    seedTeamQueries(queryClient, { inviteMembers: true })
    const acceptUrl = "https://operator.example/accept-invite?token=one-time-secret"
    const api = pageApi()
    vi.mocked(api.post).mockResolvedValue({
      data: {
        id: "invite_1",
        email: "new@example.com",
        roleId: "editor",
        roleName: "Editor",
        status: "pending",
        createdAt: "2026-07-15T00:00:00.000Z",
        expiresAt: "2026-07-18T00:00:00.000Z",
        acceptUrl,
      },
    })
    const container = document.createElement("div")
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <TeamManagementPage api={api} />
        </QueryClientProvider>,
      )
    })
    const email = container.querySelector<HTMLInputElement>("#team-invite-email")
    const form = email?.closest("form")
    expect(email).not.toBeNull()
    expect(form).not.toBeNull()

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
      setter?.call(email, "new@example.com")
      email?.dispatchEvent(new Event("input", { bubbles: true }))
      email?.dispatchEvent(new Event("change", { bubbles: true }))
    })
    await act(async () => {
      form?.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }))
    })

    await vi.waitFor(() => {
      expect(container.querySelector<HTMLInputElement>("#team-invite-accept-url")?.value).toBe(
        acceptUrl,
      )
    })
    expect(api.post).toHaveBeenCalledWith("/v1/admin/team/invitations", {
      email: "new@example.com",
      roleId: "editor",
    })

    await act(async () => root.unmount())
  })
})
