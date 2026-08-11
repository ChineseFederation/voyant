import { beforeEach, describe, expect, it, vi } from "vitest"

import { createCloudTeamManagementAdapter } from "../../src/team-management-cloud-adapter.js"
import { createGuardedTeamManagementProvider } from "../../src/team-management-policy.js"
import type { TeamManagementRequestContext } from "../../src/team-management-runtime-port.js"

const broker = vi.hoisted(() => ({
  listInvitations: vi.fn(),
  listMembers: vi.fn(),
}))

vi.mock("../../src/cloud-broker.js", () => ({
  inviteCloudAdminMember: vi.fn(),
  listCloudAdminInvitations: broker.listInvitations,
  listCloudAdminMemberRoles: vi.fn(),
  listCloudAdminMembers: broker.listMembers,
  revokeCloudAdminInvitation: vi.fn(),
  setCloudAdminMemberAccess: vi.fn(),
  setCloudAdminMemberRole: vi.fn(),
}))

const actor = {
  membershipId: "member_actor",
  externalUserId: "workos_actor",
  email: "actor@example.test",
  name: "Actor",
  roleSlug: "owner",
  roleName: "Owner",
  status: "active",
  hasDeploymentAccess: true,
  createdAt: null,
  lastActivityAt: null,
}

function harness() {
  const linkLookup = vi.fn(async () => [{ providerAccountId: "workos_actor" }])
  const db = {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({ limit: linkLookup }),
      }),
    })),
  }
  const identityAccess = {
    resolveDeployment: vi.fn(() => ({ cloudAdminMembers: { endpoint: "https://cloud.test" } })),
  }
  const adapter = createCloudTeamManagementAdapter(identityAccess as never)
  const provider = createGuardedTeamManagementProvider(() => adapter)
  const context = {
    bindings: {},
    db,
    userId: "user_actor",
  } as unknown as TeamManagementRequestContext
  return { context, linkLookup, provider }
}

describe("cloud team-management request single-flight", () => {
  beforeEach(() => vi.clearAllMocks())

  it("shares identity and member reads across authorization and member listing", async () => {
    broker.listMembers.mockResolvedValue([actor])
    const { context, linkLookup, provider } = harness()

    await expect(provider.listMembers(context)).resolves.toHaveLength(1)

    expect(linkLookup).toHaveBeenCalledTimes(1)
    expect(broker.listMembers).toHaveBeenCalledTimes(1)
  })

  it("shares identity resolution with invitation listing", async () => {
    broker.listMembers.mockResolvedValue([actor])
    broker.listInvitations.mockResolvedValue([])
    const { context, linkLookup, provider } = harness()

    await expect(provider.listInvitations(context)).resolves.toEqual([])

    expect(linkLookup).toHaveBeenCalledTimes(1)
    expect(broker.listMembers).toHaveBeenCalledTimes(1)
    expect(broker.listInvitations).toHaveBeenCalledTimes(1)
  })

  it("coalesces concurrent consumers of the same request context", async () => {
    broker.listMembers.mockResolvedValue([actor])
    const { context, linkLookup, provider } = harness()

    await Promise.all([provider.listMembers(context), provider.listMembers(context)])

    expect(linkLookup).toHaveBeenCalledTimes(1)
    expect(broker.listMembers).toHaveBeenCalledTimes(1)
  })

  it("never shares authorization work across request contexts", async () => {
    broker.listMembers.mockResolvedValue([actor])
    const first = harness()
    const secondContext = { ...first.context }

    await providerList(first.provider, first.context, secondContext)

    expect(first.linkLookup).toHaveBeenCalledTimes(2)
    expect(broker.listMembers).toHaveBeenCalledTimes(2)
  })

  it("does not let a rejected request poison a later context", async () => {
    broker.listMembers
      .mockRejectedValueOnce(new Error("broker unavailable"))
      .mockResolvedValueOnce([actor])
    const first = harness()

    await expect(first.provider.listMembers(first.context)).rejects.toThrow("broker unavailable")
    await expect(first.provider.listMembers({ ...first.context })).resolves.toHaveLength(1)
  })
})

async function providerList(
  provider: ReturnType<typeof createGuardedTeamManagementProvider>,
  first: TeamManagementRequestContext,
  second: TeamManagementRequestContext,
) {
  await provider.listMembers(first)
  await provider.listMembers(second)
}
