import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  bootstrap: vi.fn(async () => undefined),
}))

vi.mock("../customer-portal/hooks/index.js", () => ({
  useCustomerPortalMutation: () => ({
    bootstrap: { mutateAsync: mocks.bootstrap },
  }),
}))

import { CustomerSignInPage, CustomerSignUpPage } from "./customer-auth-pages.js"

describe("CustomerSignInPage", () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
    mocks.bootstrap.mockClear()
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it("renders only configured customer methods and completes email-code sign-in", async () => {
    const requestEmailCode = vi.fn(async () => undefined)
    const signInWithEmailCode = vi.fn(async () => undefined)
    const signInWithSocial = vi.fn(async () => undefined)
    const onNavigate = vi.fn()

    await act(async () => {
      root.render(
        <CustomerSignInPage
          methods={{
            emailCode: true,
            emailPassword: false,
            google: true,
            facebook: false,
            apple: true,
          }}
          onNavigate={onNavigate}
          redirectTo="/shop/account"
          requestEmailCode={requestEmailCode}
          signInWithEmailCode={signInWithEmailCode}
          signInWithSocial={signInWithSocial}
        />,
      )
    })

    expect(host.querySelector('input[type="password"]')).toBeNull()
    expect(host.textContent).toContain("Continue with Google")
    expect(host.textContent).toContain("Continue with Apple")
    expect(host.textContent).not.toContain("Continue with Facebook")

    const emailInput = host.querySelector<HTMLInputElement>("#customer-auth-email-code-email")
    expect(emailInput).not.toBeNull()
    await act(async () => {
      setInputValue(emailInput!, "customer@example.test")
      host.querySelector<HTMLFormElement>("form")!.requestSubmit()
    })
    expect(requestEmailCode).toHaveBeenCalledWith("customer@example.test")

    const codeInput = host.querySelector<HTMLInputElement>("#customer-auth-email-code")
    expect(codeInput).not.toBeNull()
    await act(async () => {
      setInputValue(codeInput!, "123456")
      host.querySelector<HTMLFormElement>("form")!.requestSubmit()
    })
    expect(signInWithEmailCode).toHaveBeenCalledWith({
      email: "customer@example.test",
      code: "123456",
    })
    expect(mocks.bootstrap).toHaveBeenCalledWith({ createCustomerIfMissing: true })
    expect(onNavigate).toHaveBeenCalledWith("/shop/account")
  })

  it("does not expose password sign-up when the storefront is email-code only", async () => {
    await act(async () => {
      root.render(
        <CustomerSignUpPage
          methods={{
            emailCode: true,
            emailPassword: false,
            google: false,
            facebook: false,
            apple: false,
          }}
          redirectTo="/shop/account"
          onNavigateToVerify={vi.fn()}
          signInWithSocial={vi.fn()}
        />,
      )
    })

    expect(host.querySelector('input[type="password"]')).toBeNull()
    expect(host.textContent).toContain("creates your account when you sign in with the code")
    expect(host.querySelector<HTMLAnchorElement>('a[href^="/shop/account/sign-in"]')).not.toBeNull()
  })

  it("does not expose email inputs when only social auth is configured", async () => {
    await act(async () => {
      root.render(
        <CustomerSignInPage
          methods={{
            emailCode: false,
            emailPassword: false,
            google: false,
            facebook: true,
            apple: false,
          }}
          onNavigate={vi.fn()}
          redirectTo="/shop/account"
          requestEmailCode={vi.fn()}
          signInWithEmailCode={vi.fn()}
          signInWithSocial={vi.fn()}
        />,
      )
    })

    expect(host.querySelector('input[type="email"]')).toBeNull()
    expect(host.querySelector('input[type="password"]')).toBeNull()
    expect(host.textContent).toContain("Continue with Facebook")
  })
})

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}
