// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const mutationState = vi.hoisted(() => ({
  create: vi.fn(),
  remove: vi.fn(),
  removeProduct: vi.fn(),
  removeSupplier: vi.fn(),
  upsertProduct: vi.fn(),
  upsertSupplier: vi.fn(),
  previewSupplier: vi.fn(),
  update: vi.fn(),
}))

vi.mock("../index.js", () => ({
  useChannels: () => ({
    data: {
      data: [
        {
          id: "channel_1",
          name: "Website",
          kind: "direct",
          status: "active",
          website: null,
          contactName: null,
          contactEmail: null,
        },
      ],
      total: 1,
    },
    isPending: false,
    refetch: vi.fn(),
  }),
  useChannelMutation: () => ({
    create: { isPending: false, mutateAsync: mutationState.create },
    remove: { isPending: false, mutateAsync: mutationState.remove },
    update: { isPending: false, mutateAsync: mutationState.update },
  }),
  useChannelPresets: () => ({
    data: {
      data: [
        {
          key: "getyourguide",
          name: "GetYourGuide",
          kind: "ota",
          identity: "network",
          website: "https://www.getyourguide.com",
        },
        {
          key: "partner-affiliate",
          name: "Affiliate partner",
          kind: "affiliate",
          identity: "partner-type",
        },
      ],
    },
    isPending: false,
  }),
  useProducts: () => ({
    data: { data: [{ id: "product_1", name: "Harbor Tour" }], total: 1 },
    isPending: false,
  }),
  useSuppliers: () => ({
    data: { data: [{ id: "supplier_1", name: "Oceanic" }], total: 1 },
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
          createdBy: null,
          updatedBy: null,
          metadata: null,
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      ],
      total: 1,
    },
    isPending: false,
    refetch: vi.fn(),
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
          createdBy: null,
          updatedBy: null,
          metadata: null,
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      ],
      total: 1,
    },
    isPending: false,
    refetch: vi.fn(),
  }),
  useEffectivePublication: () => ({
    data: {
      data: {
        channelId: "channel_1",
        productId: "product_1",
        canonicalSupplierId: "supplier_1",
        published: true,
        decision: "include",
        reason: "product_decision",
        source: "product",
        ruleId: "product_rule_1",
        message: "Product publication include rule applies.",
      },
    },
    isPending: false,
  }),
  usePublicationMutation: () => ({
    upsertProduct: { isPending: false, mutateAsync: mutationState.upsertProduct },
    removeProduct: { isPending: false, mutateAsync: mutationState.removeProduct },
    previewSupplier: {
      data: { affectedProductCount: 3 },
      isPending: false,
      mutateAsync: mutationState.previewSupplier,
    },
    upsertSupplier: { isPending: false, mutateAsync: mutationState.upsertSupplier },
    removeSupplier: { isPending: false, mutateAsync: mutationState.removeSupplier },
  }),
}))

import { ChannelsPage } from "./channels-page.js"

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.clearAllMocks()
})

function buttonNamed(name: string) {
  return Array.from(document.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === name,
  )
}

async function openChannelForm() {
  const addButton = buttonNamed("Add Channel")
  expect(addButton).toBeDefined()
  await act(async () => addButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })))
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("ChannelsPage accessibility", () => {
  it("names the row action and associates all channel labels", async () => {
    await act(async () => root.render(<ChannelsPage />))

    const rowAction = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Edit / Delete: Website"]',
    )
    expect(rowAction?.title).toBe("Edit / Delete: Website")

    await openChannelForm()

    for (const id of [
      "channel-name",
      "channel-kind",
      "channel-status",
      "channel-website",
      "channel-contact-name",
      "channel-contact-email",
    ]) {
      expect(document.querySelector(`label[for="${id}"]`)).not.toBeNull()
      expect(document.getElementById(id)).not.toBeNull()
    }
  })

  it("connects channel validation errors to their controls", async () => {
    await act(async () => root.render(<ChannelsPage />))
    await openChannelForm()

    const website = document.getElementById("channel-website") as HTMLInputElement
    const email = document.getElementById("channel-contact-email") as HTMLInputElement
    await act(async () => {
      setNativeInputValue(website, "not-a-url")
      setNativeInputValue(email, "not-an-email")
    })

    const form = document.querySelector("form")
    await act(async () =>
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    )

    for (const [controlId, errorId] of [
      ["channel-name", "channel-name-error"],
      ["channel-website", "channel-website-error"],
      ["channel-contact-email", "channel-contact-email-error"],
    ] as const) {
      const control = document.getElementById(controlId)
      expect(control?.getAttribute("aria-invalid")).toBe("true")
      expect(control?.getAttribute("aria-describedby")).toBe(errorId)
      expect(document.getElementById(errorId)).not.toBeNull()
    }
  })

  it("opens a distinct publication drawer without product mappings copy", async () => {
    await act(async () => root.render(<ChannelsPage />))

    const action = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Edit / Delete: Website"]',
    )
    await act(async () => action?.dispatchEvent(new MouseEvent("click", { bubbles: true })))

    const publicationItem = Array.from(document.querySelectorAll('[role="menuitem"]')).find(
      (item) => item.textContent?.includes("Publication"),
    )
    await act(async () =>
      publicationItem?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    )

    expect(document.body.textContent).toContain("Publication: Website")
    expect(document.body.textContent).toContain("Products Include/Exclude")
    expect(document.body.textContent).toContain("Suppliers Include/Exclude")
    expect(document.body.textContent).toContain("Effective Why")
    expect(document.body.textContent).toContain("Product publication include rule applies.")
    expect(document.body.textContent).not.toContain("Product Mappings")
  })
})
