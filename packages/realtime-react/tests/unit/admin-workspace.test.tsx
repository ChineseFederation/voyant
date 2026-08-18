import type { ReactNode } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CloudRealtimeMessage, CloudRealtimePresenceEvent } from "../../src/connector-cloud.js"

const mocks = vi.hoisted(() => ({
  useLiveQueries: vi.fn(),
  useSession: vi.fn(),
}))

vi.mock("../../src/use-live-queries.js", () => ({
  useLiveQueries: mocks.useLiveQueries,
}))

import { adminInvalidationKeys, hasAdminRealtimeSession } from "../../src/admin.js"
import { AdminWorkspaceRealtimeProvider } from "../../src/admin-workspace.js"

class TestRealtimeChannel {
  on(_event: "message", _handler: (message: CloudRealtimeMessage) => void): () => void
  on(_event: "presence", _handler: (event: CloudRealtimePresenceEvent) => void): () => void
  on(
    _event: "message" | "presence",
    _handler:
      | ((message: CloudRealtimeMessage) => void)
      | ((event: CloudRealtimePresenceEvent) => void),
  ) {
    return () => undefined
  }

  enterPresence(_data?: unknown) {}

  close() {}
}

const fetcher = vi.fn(async () => new Response())
const getApiUrl = () => "/api"

function RealtimeFixture({ children }: { children: ReactNode }) {
  return (
    <AdminWorkspaceRealtimeProvider
      fetcher={fetcher}
      getApiUrl={getApiUrl}
      realtimeChannel={TestRealtimeChannel}
      useSession={mocks.useSession}
    >
      {children}
    </AdminWorkspaceRealtimeProvider>
  )
}

describe("hasAdminRealtimeSession", () => {
  it("rejects anonymous truthy session wrappers", () => {
    expect(hasAdminRealtimeSession({ user: null, session: null })).toBe(false)
    expect(hasAdminRealtimeSession({})).toBe(false)
  })

  it("accepts authenticated session shapes", () => {
    expect(hasAdminRealtimeSession({ user: { id: "usr_1" }, session: null })).toBe(true)
    expect(hasAdminRealtimeSession({ user: null, session: { userId: "usr_1" } })).toBe(true)
  })
})

describe("adminInvalidationKeys", () => {
  it("invalidates the canonical Inquiry list/detail prefix", () => {
    expect(adminInvalidationKeys({ entity: "inquiry", id: "inq_1" })).toEqual([
      ["voyant", "relationships", "inquiries"],
    ])
  })
})

describe("AdminWorkspaceRealtimeProvider", () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
    mocks.useLiveQueries.mockReset()
    mocks.useSession.mockReset()
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it("does not enable admin realtime for anonymous storefront session wrappers", async () => {
    mocks.useSession.mockReturnValue({ data: { user: null, session: null } })

    await act(async () => {
      root.render(
        <RealtimeFixture>
          <div>Storefront</div>
        </RealtimeFixture>,
      )
    })

    expect(mocks.useLiveQueries).toHaveBeenCalledWith(["admin"], expect.any(Function), {
      enabled: false,
    })
  })

  it("enables admin realtime when a signed-in user is present", async () => {
    mocks.useSession.mockReturnValue({ data: { user: { id: "usr_1" }, session: null } })

    await act(async () => {
      root.render(
        <RealtimeFixture>
          <div>Admin</div>
        </RealtimeFixture>,
      )
    })

    expect(mocks.useLiveQueries).toHaveBeenCalledWith(["admin"], expect.any(Function), {
      enabled: true,
    })
  })
})
