// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  type OperatorAdminMessages,
  operatorAdminMessageDefinitions,
  resolveLocaleMessages,
} from "@voyant-travel/i18n"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

import { VoyantProductsProvider } from "../../../provider.js"
import { type ProductDetailApi, ProductDetailHostProvider } from "../host.js"
import { ProductEditorialOverlaySection } from "./product-editorial-overlay-section.js"

vi.mock("@voyant-travel/media-react/ui", () => ({
  MediaPicker: ({
    open,
    onSelect,
  }: {
    open?: boolean
    onSelect: (assets: Array<{ storageKey: string; type: string; altText: string | null }>) => void
  }) =>
    open ? (
      <button
        type="button"
        data-testid="media-picker-open"
        onClick={() => onSelect([{ storageKey: "asset_1.jpg", type: "image", altText: null }])}
      >
        pick
      </button>
    ) : null,
}))

const messages = resolveLocaleMessages<OperatorAdminMessages>({
  locale: "en",
  fallbackLocale: "en",
  definitions: operatorAdminMessageDefinitions,
})
const editorial = messages.products.editorial

function field(overrides: Record<string, unknown> = {}) {
  return {
    state: "exact",
    kind: "text",
    nodeKind: "root",
    nodeKey: "root",
    fieldPath: "/product/name",
    sourceValue: "Provider name",
    overlayValue: undefined,
    effectiveValue: "Provider name",
    drifted: false,
    invalidReason: null,
    version: null,
    id: null,
    updatedAt: null,
    origin: null,
    editorialNote: null,
    ...overrides,
  }
}

function statePayload(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      subject: { module: "products", id: "prod_1" },
      sourced: true,
      contentSource: "sourced-cache",
      locale: {
        requestedLocale: "ro-RO",
        sourceLocale: "en-GB",
        servedLocale: "ro-RO",
        matchKind: "mixed",
      },
      source: { product: { name: "Provider name" } },
      effective: { product: { name: "Provider name" }, days: [] },
      nodes: [{ nodeKind: "root", nodeKey: "root", dayNumber: null, label: null }],
      fields: {
        "root:root:/product/name": field(),
        "root:root:/product/description": field({
          fieldPath: "/product/description",
          kind: "long-text",
          state: "missing",
          sourceValue: undefined,
          effectiveValue: undefined,
        }),
        "root:root:/product/hero_image_url": field({
          fieldPath: "/product/hero_image_url",
          kind: "media",
          state: "missing",
          sourceValue: undefined,
          effectiveValue: undefined,
        }),
      },
      sourceUpdatedAt: null,
      availableSourceLocales: ["en-GB"],
      availableOverlayLocales: ["ro-RO"],
      ...overrides,
    },
  }
}

interface ApiCalls {
  get: string[]
  put: Array<{ path: string; body: unknown }>
  delete: string[]
}

function makeApi(
  payload: (path: string) => unknown,
  behaviour: { putError?: unknown } = {},
): { api: ProductDetailApi; calls: ApiCalls } {
  const calls: ApiCalls = { get: [], put: [], delete: [] }
  const api: ProductDetailApi = {
    get: async <T,>(path: string) => {
      calls.get.push(path)
      return payload(path) as T
    },
    post: async <T,>() => ({}) as T,
    patch: async <T,>() => ({}) as T,
    put: async <T,>(path: string, body?: unknown) => {
      calls.put.push({ path, body })
      if (behaviour.putError) throw behaviour.putError
      return { data: {} } as T
    },
    delete: async <T,>(path: string) => {
      calls.delete.push(path)
      return { data: { cleared: true } } as T
    },
  }
  return { api, calls }
}

function setViewport(isWide: boolean) {
  const stub: typeof window.matchMedia = (query) =>
    ({
      matches: isWide,
      media: typeof query === "string" ? query : String(query),
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList
  window.matchMedia = stub
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  setViewport(true)
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.clearAllMocks()
})

async function flush(times = 3) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function render(children: ReactNode, api: ProductDetailApi) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <VoyantProductsProvider baseUrl="http://api.test">
          <ProductDetailHostProvider
            value={{
              messages,
              api,
              locale: "ro-RO",
              configuredLocales: ["en", "ro-RO"],
              navigate: {
                toProducts: () => undefined,
                toProduct: () => undefined,
                toAvailability: () => undefined,
              },
            }}
          >
            {children}
          </ProductDetailHostProvider>
        </VoyantProductsProvider>
      </QueryClientProvider>,
    )
  })
  await flush()
}

function byTestId(id: string): HTMLElement {
  const node = container.querySelector<HTMLElement>(`[data-testid="${id}"]`)
  if (!node) throw new Error(`missing [data-testid="${id}"]`)
  return node
}

function buttonWithText(text: string, scope: ParentNode = container): HTMLButtonElement {
  const match = [...scope.querySelectorAll("button")].find(
    (node) => node.textContent?.trim() === text,
  )
  if (!match) throw new Error(`missing button "${text}"`)
  return match as HTMLButtonElement
}

async function click(node: HTMLElement) {
  await act(async () => {
    node.click()
  })
  await flush(1)
}

describe("ProductEditorialOverlaySection", () => {
  it("shows provider source, overlay, and effective values side by side on wide screens", async () => {
    const { api } = makeApi(() => statePayload())
    await render(<ProductEditorialOverlaySection productId="prod_1" />, api)

    expect(byTestId("overlay-source-root:root:/product/name").textContent).toContain(
      "Provider name",
    )
    expect(byTestId("overlay-overlay-root:root:/product/name").textContent).toContain(
      editorial.noOverlayValue,
    )
    expect(byTestId("overlay-effective-root:root:/product/name").textContent).toContain(
      "Provider name",
    )
    // Provider content is never editable in place.
    expect(
      byTestId("overlay-source-root:root:/product/name").querySelectorAll("input,textarea").length,
    ).toBe(0)
  })

  it("offers an accessible compare view on narrow screens", async () => {
    setViewport(false)
    const { api } = makeApi(() => statePayload())
    await render(<ProductEditorialOverlaySection productId="prod_1" />, api)

    const tablist = container.querySelector(`[aria-label="${editorial.compareLabel}"]`)
    expect(tablist).not.toBeNull()
    expect(tablist?.textContent).toContain(editorial.columnSource)
    expect(tablist?.textContent).toContain(editorial.columnEffective)
  })

  it("renders the declared state for each field, including missing ones", async () => {
    const { api } = makeApi(() => statePayload())
    await render(<ProductEditorialOverlaySection productId="prod_1" />, api)

    expect(byTestId("overlay-field-root:root:/product/name").textContent).toContain(
      editorial.stateExact,
    )
    expect(byTestId("overlay-field-root:root:/product/description").textContent).toContain(
      editorial.stateMissing,
    )
  })

  it("surfaces drifted, invalid, and orphaned overlays", async () => {
    const { api } = makeApi(() =>
      statePayload({
        fields: {
          "root:root:/product/name": field({
            state: "overlaid",
            overlayValue: "Overlay name",
            version: 2,
            drifted: true,
          }),
          "root:root:/product/highlights": field({
            fieldPath: "/product/highlights",
            kind: "string-list",
            state: "invalid",
            invalidReason: "expected array",
            overlayValue: { bad: true },
            version: 1,
          }),
          "itinerary-day:day_gone:description": field({
            nodeKind: "itinerary-day",
            nodeKey: "day_gone",
            fieldPath: "description",
            kind: "long-text",
            state: "orphaned",
            sourceValue: undefined,
            effectiveValue: undefined,
            overlayValue: "Localized day",
            version: 1,
          }),
        },
      }),
    )
    await render(<ProductEditorialOverlaySection productId="prod_1" />, api)

    const text = container.textContent ?? ""
    expect(text).toContain(editorial.stateDrifted)
    expect(text).toContain(editorial.stateInvalid)
    expect(text).toContain(editorial.stateOrphaned)
    expect(text).toContain(editorial.orphanedDescription)
  })

  it("switches the authored locale and refetches that scope", async () => {
    const { api, calls } = makeApi(() => statePayload())
    await render(<ProductEditorialOverlaySection productId="prod_1" />, api)

    expect(calls.get.at(-1)).toContain("locale=ro-RO")

    const select = container.querySelector<HTMLSelectElement>("#editorial-overlay-locale")
    if (!select) throw new Error("missing locale select")
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        "value",
      )?.set
      setter?.call(select, "en")
      select.dispatchEvent(new Event("change", { bubbles: true }))
    })

    expect(calls.get.at(-1)).toContain("locale=en")
  })

  it("authors an overlay-only translation with optimistic-concurrency metadata", async () => {
    const { api, calls } = makeApi(() => statePayload())
    await render(<ProductEditorialOverlaySection productId="prod_1" />, api)

    const card = byTestId("overlay-field-root:root:/product/description")
    await click(buttonWithText(editorial.add, card))

    const textarea = card.querySelector("textarea")
    if (!textarea) throw new Error("missing overlay editor")
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      )?.set
      setter?.call(textarea, "Descriere tradusă")
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await click(buttonWithText(editorial.save, card))

    expect(calls.put).toHaveLength(1)
    expect(calls.put[0]?.body).toMatchObject({
      fieldPath: "/product/description",
      nodeKind: "root",
      nodeKey: "root",
      locale: "ro-RO",
      value: "Descriere tradusă",
      expectedVersion: null,
    })
  })

  it("requires confirmation before clearing an overlay and never copies the source value", async () => {
    const { api, calls } = makeApi(() =>
      statePayload({
        fields: {
          "root:root:/product/name": field({
            state: "overlaid",
            overlayValue: "Overlay name",
            version: 4,
          }),
        },
      }),
    )
    await render(<ProductEditorialOverlaySection productId="prod_1" />, api)

    await click(buttonWithText(editorial.clear, byTestId("overlay-field-root:root:/product/name")))
    expect(calls.delete).toHaveLength(0)
    expect(document.body.textContent).toContain(editorial.clearFieldDescription)

    await click(buttonWithText(editorial.confirm, document.body))
    expect(calls.delete).toHaveLength(1)
    expect(calls.delete[0]).toContain("fieldPath=%2Fproduct%2Fname")
    expect(calls.delete[0]).toContain("expectedVersion=4")
  })

  it("reports an optimistic-concurrency conflict instead of overwriting", async () => {
    const conflict = Object.assign(new Error("version_conflict"), {
      status: 409,
      body: { error: "version_conflict", currentVersion: 7 },
    })
    const { api } = makeApi(
      () =>
        statePayload({
          fields: {
            "root:root:/product/name": field({
              state: "overlaid",
              overlayValue: "Overlay name",
              version: 4,
            }),
          },
        }),
      { putError: conflict },
    )
    await render(<ProductEditorialOverlaySection productId="prod_1" />, api)

    const card = byTestId("overlay-field-root:root:/product/name")
    await click(buttonWithText(editorial.edit, card))
    await click(buttonWithText(editorial.save, card))

    const banner = byTestId("editorial-overlay-conflict")
    expect(banner.textContent).toContain(editorial.conflictTitle)
    expect(banner.textContent).toContain("7")
  })

  it("selects overlay media through the shared media library picker", async () => {
    const { api, calls } = makeApi(() => statePayload())
    await render(<ProductEditorialOverlaySection productId="prod_1" />, api)

    const card = byTestId("overlay-field-root:root:/product/hero_image_url")
    await click(buttonWithText(editorial.add, card))
    await click(buttonWithText(editorial.mediaSelect, card))
    await click(byTestId("media-picker-open"))
    await click(buttonWithText(editorial.save, card))

    expect(calls.put[0]?.body).toMatchObject({
      fieldPath: "/product/hero_image_url",
      value: "http://api.test/v1/admin/media/asset_1.jpg",
    })
  })

  it("previews the effective customer content", async () => {
    const { api } = makeApi(() =>
      statePayload({
        effective: { product: { name: "Nume efectiv", description: "Descriere" }, days: [] },
      }),
    )
    await render(<ProductEditorialOverlaySection productId="prod_1" />, api)

    await click(buttonWithText(editorial.previewShow))
    expect(byTestId("editorial-overlay-preview").textContent).toContain("Nume efectiv")
  })

  it("renders nothing for owned products", async () => {
    const { api } = makeApi(() => statePayload({ sourced: false, contentSource: "owned" }))
    await render(<ProductEditorialOverlaySection productId="prod_1" />, api)

    expect(container.textContent).not.toContain(editorial.sectionTitle)
  })

  it("hides write controls when the host cannot issue overlay writes", async () => {
    const { api } = makeApi(() => statePayload())
    const readOnlyApi: ProductDetailApi = { ...api, put: undefined }
    await render(<ProductEditorialOverlaySection productId="prod_1" />, readOnlyApi)

    expect(container.textContent).toContain(editorial.readOnly)
    expect([...container.querySelectorAll("button")].map((node) => node.textContent)).not.toContain(
      editorial.add,
    )
  })
})
