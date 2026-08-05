import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { AdminWorkspaceShell } from "../../src/app/workspace.js"
import { AdminProvider } from "../../src/providers/admin-provider.js"

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>()
  return {
    ...actual,
    useRouter: () => ({ navigate: vi.fn() }),
    // `matches` as well as `location`: the shell reads the matched route
    // pattern for `admin.nav.viewed`, so a mock with only a pathname no longer
    // stands in for router state.
    useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
      select({ location: { pathname: "/" }, matches: [{ routeId: "/" }] }),
  }
})

describe("AdminWorkspaceShell", () => {
  it("renders its bootstrap state without a host-owned messages provider", () => {
    render(
      <AdminWorkspaceShell user={null} isUserLoading extensions={[]}>
        <span>workspace</span>
      </AdminWorkspaceShell>,
    )

    expect(screen.queryByText("workspace")).toBeNull()
    expect(document.querySelector("svg.animate-spin")).not.toBeNull()
  })

  it("does not require an API provider when navigation preferences are not selected", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    const Link = ({ children, href }: { children: ReactNode; href: string }) => (
      <a href={href}>{children}</a>
    )

    render(
      <AdminProvider
        defaultTheme="light"
        localeStorageKey={null}
        themeStorageKey={null}
        timeZoneStorageKey={null}
      >
        <AdminWorkspaceShell
          user={{ id: "member-1", email: "member@example.com" }}
          extensions={[]}
          linkComponent={Link}
        >
          <span>workspace</span>
        </AdminWorkspaceShell>
      </AdminProvider>,
    )

    expect(screen.getByText("workspace")).not.toBeNull()
  })
})
