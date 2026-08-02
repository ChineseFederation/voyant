// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DistributionUiMessagesProvider } from "../i18n/index.js"
import { PublicationSheet } from "./publication-sheet.js"

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const productRulesRefetch = vi.hoisted(() => vi.fn())
const supplierRulesRefetch = vi.hoisted(() => vi.fn())
const mutationState = vi.hoisted(() => ({
  removeProduct: vi.fn(),
  removeSupplier: vi.fn(),
  upsertProduct: vi.fn(),
  upsertSupplier: vi.fn(),
  previewSupplier: vi.fn(),
}))

vi.mock("../index.js", () => ({
  useProducts: () => ({
    data: {
      data: [
        { id: "product_1", name: "Harbor Tour" },
        { id: "product_2", name: "Museum Pass" },
      ],
      total: 2,
    },
    isPending: false,
  }),
  useSuppliers: () => ({
    data: {
      data: [
        { id: "supplier_1", name: "Oceanic" },
        { id: "supplier_2", name: "City Guides" },
      ],
      total: 2,
    },
    isPending: false,
  }),
  useProductPublications: () => ({
    data: {
      data: [
        {
          id: "product_rule_1",
          channelId: "channel_1",
          productId: "product_1",
          decision: "include",
          reason: "Launch",
        },
      ],
      total: 1,
    },
    isPending: false,
    refetch: productRulesRefetch,
  }),
  useSupplierPublications: () => ({
    data: {
      data: [
        {
          id: "supplier_rule_1",
          channelId: "channel_1",
          supplierId: "supplier_1",
          decision: "exclude",
          reason: "Paused",
        },
      ],
      total: 1,
    },
    isPending: false,
    refetch: supplierRulesRefetch,
  }),
  useEffectivePublication: () => ({ data: null, isPending: false }),
  usePublicationMutation: () => ({
    upsertProduct: { isPending: false, mutateAsync: mutationState.upsertProduct },
    removeProduct: { isPending: false, mutateAsync: mutationState.removeProduct },
    previewSupplier: {
      data: null,
      isPending: false,
      mutateAsync: mutationState.previewSupplier,
    },
    upsertSupplier: { isPending: false, mutateAsync: mutationState.upsertSupplier },
    removeSupplier: { isPending: false, mutateAsync: mutationState.removeSupplier },
  }),
}))

const channel = {
  id: "channel_1",
  name: "Website",
  kind: "direct",
  status: "active",
  website: null,
  contactName: null,
  contactEmail: null,
  metadata: null,
} as const

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  mutationState.previewSupplier.mockResolvedValue({ affectedProductCount: 3 })
  mutationState.upsertSupplier.mockResolvedValue({})
  mutationState.upsertProduct.mockResolvedValue({})
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  document.body.replaceChildren()
  vi.clearAllMocks()
})

function renderSheet(locale?: string) {
  return act(async () =>
    root.render(
      <DistributionUiMessagesProvider locale={locale}>
        <PublicationSheet open onOpenChange={() => {}} channel={channel} />
      </DistributionUiMessagesProvider>,
    ),
  )
}

function buttonsNamed(name: string) {
  return Array.from(document.querySelectorAll("button")).filter(
    (button) => button.textContent?.trim() === name,
  )
}

function buttonNamed(name: string): HTMLButtonElement {
  const button = buttonsNamed(name)[0]
  if (!button) throw new Error(`Missing button: ${name}`)
  return button
}

function tabNamed(name: string): HTMLButtonElement {
  const tab = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
    (button) => button.textContent?.trim() === name,
  )
  if (!tab) throw new Error(`Missing tab: ${name}`)
  return tab
}

function inputById(id: string) {
  const input = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null
  if (!input) throw new Error(`Missing input: ${id}`)
  return input
}

function confirmationCheckbox(): HTMLInputElement {
  const checkbox = document.querySelector<HTMLInputElement>('input[type="checkbox"]')
  if (!checkbox) throw new Error("Missing supplier confirmation checkbox")
  return checkbox
}

function setControlValue(control: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(prototype.prototype, "value")?.set
  setter?.call(control, value)
  control.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("PublicationSheet", () => {
  it("uses product and supplier tabs with searchable comboboxes instead of native selects", async () => {
    await renderSheet()

    expect(tabNamed("Products Include/Exclude").getAttribute("aria-selected")).toBe("true")
    expect(tabNamed("Suppliers Include/Exclude").getAttribute("aria-selected")).toBe("false")
    expect(document.querySelector("select")).toBeNull()
    expect(document.querySelectorAll('[role="combobox"]').length).toBeGreaterThanOrEqual(4)

    const productPicker = inputById("publication-product-subject")
    await act(async () => setControlValue(productPicker, "Museum"))
    expect(productPicker).toHaveProperty("value", "Museum")
  })

  it("fills product and supplier forms from explicit Edit actions", async () => {
    await renderSheet()

    await act(async () =>
      buttonNamed("Edit").dispatchEvent(new MouseEvent("click", { bubbles: true })),
    )
    expect(inputById("publication-product-subject")).toHaveProperty("value", "Harbor Tour")
    expect(inputById("publication-product-decision")).toHaveProperty("value", "Include")
    expect(inputById("publication-product-reason")).toHaveProperty("value", "Launch")

    await act(async () =>
      tabNamed("Suppliers Include/Exclude").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      ),
    )
    await act(async () =>
      buttonNamed("Edit").dispatchEvent(new MouseEvent("click", { bubbles: true })),
    )
    expect(inputById("publication-supplier-subject")).toHaveProperty("value", "Oceanic")
    expect(inputById("publication-supplier-decision")).toHaveProperty("value", "Exclude")
    expect(inputById("publication-supplier-reason")).toHaveProperty("value", "Paused")
  })

  it("requires a fresh supplier preview and explicit impact confirmation before saving", async () => {
    await renderSheet()

    await act(async () =>
      tabNamed("Suppliers Include/Exclude").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      ),
    )
    await act(async () =>
      buttonNamed("Edit").dispatchEvent(new MouseEvent("click", { bubbles: true })),
    )

    const save = buttonNamed("Save supplier rule")
    expect(save.disabled).toBe(true)

    await act(async () =>
      buttonNamed("Preview impact").dispatchEvent(new MouseEvent("click", { bubbles: true })),
    )
    expect(mutationState.previewSupplier).toHaveBeenCalledWith({
      channelId: "channel_1",
      supplierId: "supplier_1",
      decision: "exclude",
      reason: "Paused",
    })
    expect(document.body.textContent).toContain("3 products affected")
    expect(save.disabled).toBe(true)

    const confirmation = confirmationCheckbox()
    expect(confirmation.parentElement?.textContent).toContain("3 affected products")
    await act(async () => confirmation.dispatchEvent(new MouseEvent("click", { bubbles: true })))
    expect(save.disabled).toBe(false)

    await act(async () => save.dispatchEvent(new MouseEvent("click", { bubbles: true })))
    expect(mutationState.upsertSupplier).toHaveBeenCalledTimes(1)
  })

  it("invalidates supplier preview when current inputs change", async () => {
    await renderSheet()

    await act(async () =>
      tabNamed("Suppliers Include/Exclude").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      ),
    )
    await act(async () =>
      buttonNamed("Edit").dispatchEvent(new MouseEvent("click", { bubbles: true })),
    )
    await act(async () =>
      buttonNamed("Preview impact").dispatchEvent(new MouseEvent("click", { bubbles: true })),
    )
    const confirmation = confirmationCheckbox()
    await act(async () => confirmation.dispatchEvent(new MouseEvent("click", { bubbles: true })))

    const reason = inputById("publication-supplier-reason")
    await act(async () => setControlValue(reason, "Changed"))

    const save = buttonNamed("Save supplier rule")
    expect(save.disabled).toBe(true)
    expect(document.body.textContent).toContain(
      "Preview the current supplier inputs before saving.",
    )
  })

  it("renders Romanian tabs, searchable pickers, edit, and preview-gating copy", async () => {
    await renderSheet("ro-RO")

    expect(document.body.textContent).toContain("Produse Include/Exclude")
    expect(document.body.textContent).toContain("Furnizori Include/Exclude")
    expect(document.querySelector("select")).toBeNull()

    await act(async () =>
      tabNamed("Furnizori Include/Exclude").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      ),
    )
    await act(async () =>
      buttonNamed("Editeaza").dispatchEvent(new MouseEvent("click", { bubbles: true })),
    )
    await act(async () =>
      buttonNamed("Previzualizeaza impactul").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      ),
    )

    expect(inputById("publication-supplier-subject")).toHaveProperty("value", "Oceanic")
    expect(document.body.textContent).toContain("3 produse afectate")
    expect(document.body.textContent).toContain("pentru 3 produse afectate")
  })
})
