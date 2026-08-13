// @vitest-environment jsdom

import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SearchableSelect } from "./legal-admin-shared.js"

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const OPTIONS = [
  {
    value: "prod_01kz996xesegnv4vd6aescjnhf",
    label: "Santorini Caldera Sunset Sail",
    description: "active / date",
  },
  { value: "prod_01kz996xesegnv4vd6aescjnhg", label: "Amalfi Coast Day Tour" },
]

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("SearchableSelect", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  async function openPopup() {
    const trigger = document.querySelector<HTMLElement>('[aria-label="Open options"]')
    if (!trigger) throw new Error("Expected the combobox trigger to render")
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    const input = container.querySelector<HTMLInputElement>("input")
    if (!input) throw new Error("Expected the combobox input to render")
    return input
  }

  async function renderSelect(props?: { loading?: boolean }) {
    await act(async () => {
      root.render(
        <SearchableSelect
          value={null}
          onChange={vi.fn()}
          options={OPTIONS}
          placeholder="Product"
          emptyLabel="No results."
          loadingLabel="Loading…"
          loading={props?.loading}
        />,
      )
    })

    return openPopup()
  }

  /**
   * Regression: item values are record ids, so base-ui matched the typed query
   * against `prod_01k…` and reported "No results." for a record the list query
   * had just returned. Filtering reads `itemToStringLabel`, not
   * `itemToStringValue`.
   */
  it("keeps an option whose label matches the typed query", async () => {
    const input = await renderSelect()

    await act(async () => {
      setNativeInputValue(input, "Santorini")
    })

    expect(document.body.textContent).toContain("Santorini Caldera Sunset Sail")
    expect(document.body.textContent).not.toContain("No results.")
    expect(document.body.textContent).not.toContain("Amalfi Coast Day Tour")
  })

  it("drops options whose label does not match the typed query", async () => {
    const input = await renderSelect()

    await act(async () => {
      setNativeInputValue(input, "Reykjavik")
    })

    expect(document.body.textContent).not.toContain("Santorini Caldera Sunset Sail")
    expect(document.body.textContent).toContain("No results.")
  })

  it("shows the loading label instead of the empty label while loading", async () => {
    const input = await renderSelect({ loading: true })

    await act(async () => {
      setNativeInputValue(input, "Reykjavik")
    })

    expect(document.body.textContent).toContain("Loading…")
    expect(document.body.textContent).not.toContain("No results.")
  })

  /**
   * Regression: the pickers pair a list query with a detail query for the
   * selected record, and the detail query is disabled until something is
   * selected. A disabled query stays `status: "pending"` for as long as it
   * stays disabled, so `list.isPending || selected.isPending` was true on
   * every fresh picker and a settled empty list read "Loading…" forever.
   * `isLoading` is `isPending && isFetching`, which a disabled query is not.
   */
  it("reports an empty settled list as empty, not as loading", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    function Picker() {
      const listQuery = useQuery({
        queryKey: ["products", "list"],
        queryFn: async () => [] as typeof OPTIONS,
      })
      const selectedQuery = useQuery({
        queryKey: ["products", "detail", null],
        queryFn: async () => OPTIONS[0],
        enabled: false,
      })

      return (
        <SearchableSelect
          value={null}
          onChange={vi.fn()}
          options={listQuery.data ?? []}
          placeholder="Product"
          emptyLabel="No results."
          loadingLabel="Loading…"
          loading={listQuery.isLoading || selectedQuery.isLoading}
        />
      )
    }

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Picker />
        </QueryClientProvider>,
      )
    })
    await act(async () => {
      await queryClient.getQueryCache().find({ queryKey: ["products", "list"] })?.promise
    })
    await openPopup()

    expect(document.body.textContent).toContain("No results.")
    expect(document.body.textContent).not.toContain("Loading…")

    queryClient.clear()
  })
})
