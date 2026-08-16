import { act, render, renderHook, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  DEFAULT_ADMIN_LOCALE,
  LocaleProvider,
  resolveAdminLocale,
  useLocale,
} from "../../src/providers/locale.js"

const fallbackStorageState = new Map<string, string>()

function getTestStorage(): Storage {
  const storage = globalThis.localStorage as Partial<Storage> | undefined
  if (
    storage &&
    typeof storage.clear === "function" &&
    typeof storage.getItem === "function" &&
    typeof storage.key === "function" &&
    typeof storage.removeItem === "function" &&
    typeof storage.setItem === "function"
  ) {
    return storage as Storage
  }

  const fallbackStorage: Storage = {
    get length() {
      return fallbackStorageState.size
    },
    clear() {
      fallbackStorageState.clear()
    },
    getItem(key) {
      return fallbackStorageState.get(key) ?? null
    },
    key(index) {
      return [...fallbackStorageState.keys()][index] ?? null
    },
    removeItem(key) {
      fallbackStorageState.delete(key)
    },
    setItem(key, value) {
      fallbackStorageState.set(key, value)
    },
  }

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: fallbackStorage,
  })

  return fallbackStorage
}

beforeEach(() => {
  getTestStorage().clear()
  document.documentElement.lang = "en"
  Object.defineProperty(window.navigator, "language", {
    configurable: true,
    value: "ro-RO",
  })
})

afterEach(() => {
  getTestStorage().clear()
})

describe("LocaleProvider", () => {
  it("resolves the browser locale against supported locales after hydration", async () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <LocaleProvider>{children}</LocaleProvider>
    )
    const { result } = renderHook(() => useLocale(), { wrapper })
    await waitFor(() => expect(result.current.resolvedLocale).toBe("ro"))
  })

  it("updates document.documentElement.lang when locale changes", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <LocaleProvider defaultLocale="en">{children}</LocaleProvider>
    )
    const { result } = renderHook(() => useLocale(), { wrapper })

    expect(document.documentElement.lang).toBe("en")

    act(() => {
      result.current.setLocale("ro")
    })

    return waitFor(() => {
      expect(document.documentElement.lang).toBe("ro")
      expect(window.localStorage.getItem("admin-locale")).toBe("ro")
    })
  })

  it("persists timezone changes when storage is enabled", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <LocaleProvider defaultTimeZone="Europe/Bucharest">{children}</LocaleProvider>
    )
    const { result } = renderHook(() => useLocale(), { wrapper })

    act(() => {
      result.current.setTimeZone("Europe/London")
    })

    return waitFor(() => {
      expect(result.current.timeZone).toBe("Europe/London")
      expect(window.localStorage.getItem("admin-timezone")).toBe("Europe/London")
    })
  })

  it("lets account preferences override stale device cache", async () => {
    window.localStorage.setItem("admin-locale", "ro")
    window.localStorage.setItem("admin-timezone", "Europe/London")
    const wrapper = ({ children }: { children: ReactNode }) => (
      <LocaleProvider
        defaultLocale="en"
        defaultTimeZone="Europe/Bucharest"
        preferenceAuthority="account"
      >
        {children}
      </LocaleProvider>
    )
    const { result } = renderHook(() => useLocale(), { wrapper })

    await waitFor(() => {
      expect(result.current.resolvedLocale).toBe("en")
      expect(result.current.timeZone).toBe("Europe/Bucharest")
      expect(window.localStorage.getItem("admin-locale")).toBe("en")
    })
  })

  it("rolls back an optimistic locale change when profile persistence fails", async () => {
    const failure = new Error("profile unavailable")
    const wrapper = ({ children }: { children: ReactNode }) => (
      <LocaleProvider
        defaultLocale="en"
        preferenceAuthority="account"
        onPreferenceChange={() => Promise.reject(failure)}
      >
        {children}
      </LocaleProvider>
    )
    const { result } = renderHook(() => useLocale(), { wrapper })

    await act(async () => {
      await expect(result.current.setLocale("ro")).rejects.toThrow("profile unavailable")
    })

    expect(result.current.resolvedLocale).toBe("en")
    expect(result.current.preferenceError).toBe(failure)
    expect(window.localStorage.getItem("admin-locale")).toBe("en")
  })

  it("narrows an account locale on the first render, not the one after", () => {
    // A profile storing `en-GB` used to mount the authenticated tree at
    // `en-GB` and re-render it at `en` a tick later, re-keying everything
    // derived from the locale (voyant#4754).
    const seen: string[] = []
    function Probe() {
      seen.push(useLocale().locale)
      return null
    }

    render(
      <LocaleProvider defaultLocale="en-GB" preferenceAuthority="account">
        <Probe />
      </LocaleProvider>,
    )

    expect(new Set(seen)).toEqual(new Set(["en"]))
  })

  it("uses the nearest locale provider for the document language", async () => {
    render(
      <LocaleProvider defaultLocale="en">
        <LocaleProvider defaultLocale="ro" preferenceAuthority="account">
          <span data-testid="nested-locale">content</span>
        </LocaleProvider>
      </LocaleProvider>,
    )

    expect(screen.getByTestId("nested-locale")).not.toBeNull()
    await waitFor(() => expect(document.documentElement.lang).toBe("ro"))
  })
})

describe("resolveAdminLocale", () => {
  it("falls back to the default locale for unsupported values", () => {
    expect(resolveAdminLocale("fr-FR")).toBe(DEFAULT_ADMIN_LOCALE)
  })
})
