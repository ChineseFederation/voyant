/**
 * The consent screen, rendered and clicked, with the admin shell's real
 * realm-scoping fetcher underneath it.
 *
 * Everything about this failure lived in the seam between the component and the
 * fetcher the shell injects, so a test that stubs the fetcher cannot see it:
 * the component was internally consistent and produced a URL nothing serves.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { LocaleProvider } from "@voyant-travel/admin/providers/locale"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createAuthBasePathFetcher } from "../client.js"
import type { McpConsentMessages } from "../i18n/mcp-consent.js"
import { McpConsentPage } from "./mcp-consent-page.js"

const BASE_URL = "/api"

const messages: McpConsentMessages = {
  title: "Connect {client}?",
  subtitle: "{client} wants in.",
  readTitle: "See your data",
  readBody: "read body",
  writeTitle: "Make changes",
  writeBody: "write body",
  boundaryTitle: "Bounded",
  boundaryBody: "boundary body",
  approve: "Connect",
  deny: "Cancel",
  approving: "Connecting…",
  failed: "Could not complete the connection.",
  failedDetail: "Technical detail: {detail}",
  unknownClient: "This application",
}

/** A transport with the fetcher's own signature, so the recorded call is typed. */
function stubTransport(respond: (url: string, init?: RequestInit) => Response) {
  return vi.fn((url: string, init?: RequestInit) => Promise.resolve(respond(url, init)))
}

/** The composition `createStandardOperatorFrontend` builds for the admin shell. */
function adminShellFetcher(transport: (url: string, init?: RequestInit) => Promise<Response>) {
  return createAuthBasePathFetcher(transport, {
    baseUrl: BASE_URL,
    authBasePath: "/auth/admin",
    sharedPaths: ["/me", "/status", "/shell-bootstrap"],
  })
}

/** The consent route mounts inside the admin shell, which provides the locale. */
function Shell({ children }: { children: ReactNode }) {
  return <LocaleProvider localeStorageKey={null}>{children}</LocaleProvider>
}

function renderConsent(transport: (url: string, init?: RequestInit) => Promise<Response>) {
  return render(
    <Shell>
      <McpConsentPage
        clientName="ChatGPT"
        scope="mcp:read mcp:write offline_access"
        oauthQuery="client_id=abc&ba_param=client_id&ba_param=scope&sig=deadbeef"
        baseUrl={BASE_URL}
        fetcher={adminShellFetcher(transport)}
        messages={messages}
      />
    </Shell>,
  )
}

afterEach(cleanup)

describe("McpConsentPage", () => {
  it("sends approval to the admin OAuth endpoint with one realm segment", async () => {
    const transport = stubTransport(() =>
      Response.json({ redirectURI: "https://chatgpt.com/cb?code=1&state=xyz" }),
    )
    renderConsent(transport)

    fireEvent.click(screen.getByRole("button", { name: "Connect" }))

    await waitFor(() => expect(transport).toHaveBeenCalled())
    const [url, init] = transport.mock.calls[0] ?? ["", undefined]
    expect(url).toBe("/api/auth/admin/oauth2/consent")
    expect(url.split("/").filter((segment) => segment === "admin")).toHaveLength(1)
    expect(JSON.parse(String(init?.body))).toEqual({
      accept: true,
      oauth_query: "client_id=abc&ba_param=client_id&ba_param=scope&sig=deadbeef",
    })
  })

  it("shows the write row only when the request asks for it", () => {
    const transport = stubTransport(() => Response.json({}))
    const { unmount } = renderConsent(transport)
    expect(screen.getByText("Make changes")).toBeDefined()
    unmount()

    render(
      <Shell>
        <McpConsentPage
          clientName="ChatGPT"
          scope="mcp:read"
          oauthQuery="client_id=abc"
          baseUrl={BASE_URL}
          fetcher={adminShellFetcher(transport)}
          messages={messages}
        />
      </Shell>,
    )
    expect(screen.queryByText("Make changes")).toBeNull()
  })

  it("names the failure instead of collapsing it into one sentence", async () => {
    // A 404 here means the request never reached the authorization server. An
    // operator who can only report "it didn't work" cannot tell anyone that.
    const transport = stubTransport(() => new Response("Not Found", { status: 404 }))
    renderConsent(transport)

    fireEvent.click(screen.getByRole("button", { name: "Connect" }))

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("Could not complete the connection.")
    expect(alert.textContent).toContain("404")
  })

  it("re-enables the buttons after a failure so the operator can retry", async () => {
    const transport = stubTransport(() => Response.json({ error: "expired" }, { status: 400 }))
    renderConsent(transport)

    fireEvent.click(screen.getByRole("button", { name: "Connect" }))
    await screen.findByRole("alert")

    const connect = screen.getByRole("button", { name: "Connect" }) as HTMLButtonElement
    expect(connect.disabled).toBe(false)
    expect(screen.getByRole("alert").textContent).toContain("expired")
  })
})
