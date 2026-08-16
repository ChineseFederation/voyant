import { Hono } from "hono"
import { describe, expect, it, vi } from "vitest"

import { TeamManagementError } from "../../src/team-management-policy.js"
import type { TeamManagementRuntimeProvider } from "../../src/team-management-runtime-port.js"
import { createTeamAdminRoutes } from "../../src/team-routes.js"

function runtime(): TeamManagementRuntimeProvider {
  return {
    getCapabilities: vi.fn(async () => ({
      viewMembers: true,
      inviteMembers: true,
      manageRoles: true,
      activateMembers: true,
      deactivateMembers: true,
      revokeInvitations: true,
    })),
    listMembers: vi.fn(async () => [
      {
        id: "member_1",
        email: "member@example.com",
        name: "Member",
        roleId: "editor",
        roleName: "Editor",
        status: "active",
        joinedAt: null,
        lastActivityAt: null,
      },
    ]),
    listRoles: vi.fn(async () => []),
    listInvitations: vi.fn(async () => [
      {
        id: "invite_1",
        email: "new@example.com",
        roleId: "editor",
        roleName: "Editor",
        status: "pending",
        createdAt: "2026-07-15T00:00:00.000Z",
        expiresAt: "2026-07-18T00:00:00.000Z",
      },
    ]),
    inviteMember: vi.fn(async (_context, input) => ({
      id: "invite_1",
      email: input.email,
      roleId: input.roleId,
      roleName: "Editor",
      status: "pending",
      createdAt: "2026-07-15T00:00:00.000Z",
      expiresAt: "2026-07-18T00:00:00.000Z",
      acceptUrl: "https://operator.example/accept-invite?token=one-time-secret",
    })),
    revokeInvitation: vi.fn(async () => undefined),
    updateMemberRole: vi.fn(async () => {
      throw new TeamManagementError("self_change_forbidden", "No self-demotion.", 409)
    }),
    activateMember: vi.fn(async () => ({
      id: "member_1",
      email: "member@example.com",
      name: "Member",
      roleId: "editor",
      roleName: "Editor",
      status: "active",
      joinedAt: null,
      lastActivityAt: null,
    })),
    deactivateMember: vi.fn(async () => {
      throw new TeamManagementError("last_owner", "Last owner.", 409)
    }),
  }
}

function app(provider: TeamManagementRuntimeProvider, authenticated = true) {
  const hono = new Hono<{
    Bindings: Record<string, unknown>
    Variables: { userId?: string; db: never }
  }>()
  hono.use("*", async (c, next) => {
    if (authenticated) c.set("userId", "user_actor")
    c.set("db", {} as never)
    await next()
  })
  hono.route("/v1/admin/team", createTeamAdminRoutes(provider))
  return hono
}

describe("team admin routes", () => {
  it("returns provider-neutral members and nullable last activity", async () => {
    const response = await app(runtime()).request("/v1/admin/team/members")

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: [expect.objectContaining({ id: "member_1", lastActivityAt: null })],
    })
  })

  it("requires an authenticated user before calling the port", async () => {
    const provider = runtime()
    const response = await app(provider, false).request("/v1/admin/team/capabilities")

    expect(response.status).toBe(401)
    expect(provider.getCapabilities).not.toHaveBeenCalled()
  })

  it("returns the accept URL only from invitation creation", async () => {
    const provider = runtime()
    const created = await app(provider).request("/v1/admin/team/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "new@example.com", roleId: "editor" }),
    })
    const listed = await app(provider).request("/v1/admin/team/invitations")

    expect(created.status).toBe(201)
    expect(await created.json()).toEqual({
      data: expect.objectContaining({
        acceptUrl: "https://operator.example/accept-invite?token=one-time-secret",
      }),
    })
    expect(JSON.stringify(await listed.json())).not.toContain("token")
    expect(provider.inviteMember).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_actor" }),
      { email: "new@example.com", roleId: "editor" },
    )
  })

  it("serializes policy invariant failures", async () => {
    const response = await app(runtime()).request("/v1/admin/team/members/member_1/role", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleId: "viewer" }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      code: "self_change_forbidden",
      error: "No self-demotion.",
    })
  })

  it("activates a member through the provider-neutral route", async () => {
    const provider = runtime()
    const response = await app(provider).request("/v1/admin/team/members/member_1/activation", {
      method: "PUT",
    })

    expect(response.status).toBe(200)
    expect(provider.activateMember).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_actor" }),
      "member_1",
    )
    expect(await response.json()).toEqual({
      data: expect.objectContaining({ id: "member_1", status: "active" }),
    })
  })
})
