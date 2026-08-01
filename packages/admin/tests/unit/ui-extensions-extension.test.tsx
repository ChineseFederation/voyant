import { cleanup, render, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  ADMIN_UI_EXTENSION_SLOTS,
  AdminExtensionsProvider,
  AdminProvider,
  AdminWidgetSlotRenderer,
  createStaticUiExtensionsClient,
  createUiExtensionsAdminExtension,
  OperatorAdminMessagesProvider,
  type UiExtensionDescriptor,
  UiExtensionEnvironmentProvider,
} from "../../src/index.js"

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.classList.remove("light", "dark")
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
})

afterEach(() => {
  cleanup()
})

const environment = {
  org: { slug: "acme", name: "Acme Travel" },
  viewer: { id: "usr_1", displayName: "Ada" },
  entity: null,
}

function descriptor(overrides: Partial<UiExtensionDescriptor> = {}): UiExtensionDescriptor {
  return {
    key: "demo",
    version: "1.0.0",
    displayName: "Demo Extension",
    extensionApi: "^1",
    entryUrl: "https://ext.example.com/demo",
    slots: ["dashboard.header"],
    ...overrides,
  }
}

describe("createUiExtensionsAdminExtension", () => {
  it("contributes one widget per public slot", () => {
    const extension = createUiExtensionsAdminExtension({
      client: createStaticUiExtensionsClient([]),
    })
    expect(extension.id).toBe("voyant-ui-extensions")
    const slots = (extension.widgets ?? []).map((widget) => widget.slot)
    expect(new Set(slots)).toEqual(new Set(ADMIN_UI_EXTENSION_SLOTS))
    expect(slots).toHaveLength(ADMIN_UI_EXTENSION_SLOTS.length)
  })

  it("renders a host for each descriptor that targets the slot", async () => {
    const extension = createUiExtensionsAdminExtension({
      client: createStaticUiExtensionsClient([
        descriptor(),
        descriptor({ key: "other", slots: ["invoice.details.header"] }),
      ]),
    })

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AdminProvider themeStorageKey={null}>
        <OperatorAdminMessagesProvider>
          <AdminExtensionsProvider extensions={[extension]}>
            <UiExtensionEnvironmentProvider value={environment}>
              {children}
            </UiExtensionEnvironmentProvider>
          </AdminExtensionsProvider>
        </OperatorAdminMessagesProvider>
      </AdminProvider>
    )

    render(<AdminWidgetSlotRenderer slot="dashboard.header" />, { wrapper })

    await waitFor(() => {
      const frame = document.querySelector("iframe")
      expect(frame).not.toBeNull()
      expect(frame?.getAttribute("src")).toBe("https://ext.example.com/demo")
    })
    // The invoice-scoped descriptor must not leak into the dashboard slot.
    expect(document.querySelectorAll("iframe")).toHaveLength(1)
  })

  it("contributes a single param route for installed app pages", () => {
    const extension = createUiExtensionsAdminExtension({
      client: createStaticUiExtensionsClient([]),
    })
    expect(extension.routes).toHaveLength(1)
    expect(extension.routes?.[0]?.path).toBe("apps/$installationId/$pageKey")
    expect(extension.routes?.[0]?.page).toBeTypeOf("function")
    expect(extension.useRuntimeNavigation).toBeTypeOf("function")
    expect(extension.useRuntimeNavItems).toBeTypeOf("function")
  })

  it("titles the app-page route with the host default and honors a labels override", () => {
    const base = createUiExtensionsAdminExtension({
      client: createStaticUiExtensionsClient([]),
    })
    expect(base.routes?.[0]?.title).toBe("App")

    const localized = createUiExtensionsAdminExtension({
      client: createStaticUiExtensionsClient([]),
      labels: { appPageTitle: "Aplicație" },
    })
    expect(localized.routes?.[0]?.title).toBe("Aplicație")
  })

  it("renders nothing when the environment is absent", async () => {
    const extension = createUiExtensionsAdminExtension({
      client: createStaticUiExtensionsClient([descriptor()]),
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AdminProvider themeStorageKey={null}>
        <AdminExtensionsProvider extensions={[extension]}>{children}</AdminExtensionsProvider>
      </AdminProvider>
    )
    render(<AdminWidgetSlotRenderer slot="dashboard.header" />, { wrapper })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(document.querySelector("iframe")).toBeNull()
  })
})

describe("createStaticUiExtensionsClient", () => {
  it("returns a defensive snapshot of the descriptor list", async () => {
    const source = [descriptor()]
    const client = createStaticUiExtensionsClient(source)
    source.push(descriptor({ key: "mutated" }))
    expect(await client.list()).toHaveLength(1)
  })
})
