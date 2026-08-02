// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it } from "vitest"

import { VoyantAvailabilityProvider } from "../provider.js"
import {
  useAllocationResourceMutation,
  useMaterializeOpenSlotsMutation,
  useResourceTemplateMutation,
} from "./use-slot-allocation.js"

type FetchCall = {
  url: string
  init?: RequestInit
}

const responseBody = {
  data: {
    id: "tmpl_1",
    productOptionId: "popt_1",
    kind: "room",
    refType: null,
    refId: null,
    capacity: 2,
    namePattern: "Room {sequence}",
    layout: null,
    defaultCount: 1,
    flags: {},
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
  },
}

const roots: Root[] = []
const containers: HTMLDivElement[] = []

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount())
  }
  for (const container of containers.splice(0)) {
    container.remove()
  }
})

function mountHook<T>(useValue: () => T, calls: FetchCall[]) {
  let current: T | undefined
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  })
  const fetcher = async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const body = url.includes("/allocation/resources")
      ? init?.method === "DELETE"
        ? { data: { id: "resource_1" } }
        : {
            data: {
              id: "resource_1",
              slotId: "slot_1",
              kind: "room",
              refType: null,
              refId: null,
              label: "Room 1",
              capacity: 2,
              flags: {},
              parentId: null,
              sortOrder: 0,
              createdAt: "2026-06-30T00:00:00.000Z",
              updatedAt: "2026-06-30T00:00:00.000Z",
            },
          }
      : init?.method === "DELETE"
        ? { data: { productOptionId: "popt_1", kind: "room" } }
        : init?.method === "POST"
          ? { data: { slots: 2, created: 4 } }
          : responseBody
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }

  function Probe() {
    current = useValue()
    return null
  }

  const container = document.createElement("div")
  document.body.appendChild(container)
  containers.push(container)
  const root = createRoot(container)
  roots.push(root)

  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <VoyantAvailabilityProvider baseUrl="https://operator.example/api" fetcher={fetcher}>
          <Probe />
        </VoyantAvailabilityProvider>
      </QueryClientProvider>,
    )
  })

  return () => {
    if (!current) throw new Error("hook did not render")
    return current
  }
}

describe("slot allocation hooks", () => {
  it("uses the availability slot route for resource mutations", async () => {
    const calls: FetchCall[] = []
    const read = mountHook(() => useAllocationResourceMutation("slot_1"), calls)

    await act(async () => {
      await read().create.mutateAsync({ kind: "room", label: "Room 1", capacity: 2 })
      await read().update.mutateAsync({
        resourceId: "resource_1",
        input: { label: "Room 2" },
      })
      await read().remove.mutateAsync("resource_1")
    })

    expect(calls.map((call) => `${call.init?.method} ${call.url}`)).toEqual([
      "POST https://operator.example/api/v1/admin/operations/availability/slots/slot_1/allocation/resources",
      "PATCH https://operator.example/api/v1/admin/operations/availability/slots/slot_1/allocation/resources/resource_1",
      "DELETE https://operator.example/api/v1/admin/operations/availability/slots/slot_1/allocation/resources/resource_1",
    ])
  })

  it("uses the availability products route for resource template mutations", async () => {
    const calls: FetchCall[] = []
    const read = mountHook(() => useResourceTemplateMutation("prod_1"), calls)

    await act(async () => {
      await read().upsert.mutateAsync({
        optionId: "popt_1",
        kind: "room",
        input: {
          capacity: 2,
          namePattern: "Room {sequence}",
          defaultCount: 1,
          flags: {},
        },
      })
      await read().remove.mutateAsync({
        optionId: "popt_1",
        kind: "room",
        refId: "unit 1",
      })
    })

    expect(calls.map((call) => `${call.init?.method} ${call.url}`)).toEqual([
      "PUT https://operator.example/api/v1/admin/operations/availability/products/prod_1/options/popt_1/allocation/resource-templates/room",
      "DELETE https://operator.example/api/v1/admin/operations/availability/products/prod_1/options/popt_1/allocation/resource-templates/room?refId=unit%201",
    ])
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      capacity: 2,
      namePattern: "Room {sequence}",
      defaultCount: 1,
      flags: {},
    })
  })

  it("uses the availability products route for open-slot materialization", async () => {
    const calls: FetchCall[] = []
    const read = mountHook(() => useMaterializeOpenSlotsMutation("prod_1"), calls)

    await act(async () => {
      await read().mutateAsync({ optionId: "popt_1" })
    })

    expect(calls.map((call) => `${call.init?.method} ${call.url}`)).toEqual([
      "POST https://operator.example/api/v1/admin/operations/availability/products/prod_1/allocation/materialize-open-slots",
    ])
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ optionId: "popt_1" })
  })
})
