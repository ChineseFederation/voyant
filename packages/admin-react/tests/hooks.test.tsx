import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it } from "vitest"
import { useAdminMutation, useAdminQuery, useCapabilities } from "../src/hooks.js"
import { bookingsOperations, crmOperations, type FetchLike } from "../src/index.js"
import { AdminClientProvider } from "../src/provider.js"
import { adminQueryKey } from "../src/query-keys.js"

function makeWrapper(fetchImpl: FetchLike) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const config = {
    baseUrl: "https://acme.voyant.app",
    auth: { type: "apiKey" as const, apiKey: "voy_test" },
    fetch: fetchImpl,
  }
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AdminClientProvider config={config}>{children}</AdminClientProvider>
      </QueryClientProvider>
    )
  }
}

const booking = {
  id: "book_1",
  bookingNumber: "B-1",
  status: "confirmed",
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
}

describe("admin-react hooks", () => {
  it("useAdminQuery reads a list through the descriptor", async () => {
    const calls: string[] = []
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push(`${init.method} ${url}`)
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [booking], total: 1, limit: 50, offset: 0 }),
      }
    }

    const { result } = renderHook(
      () => useAdminQuery(bookingsOperations.list, { input: { status: "confirmed" } }),
      { wrapper: makeWrapper(fetchImpl) },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.data[0]?.id).toBe("book_1")
    expect(calls[0]).toContain("GET https://acme.voyant.app/v1/admin/bookings?")
    expect(calls[0]).toContain("status=confirmed")
  })

  it("useAdminMutation posts a cancellation through the descriptor", async () => {
    const calls: { method: string; url: string; body?: string }[] = []
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ method: init.method, url, body: init.body })
      return { ok: true, status: 200, json: async () => ({ data: booking }) }
    }

    const { result } = renderHook(() => useAdminMutation(bookingsOperations.cancel), {
      wrapper: makeWrapper(fetchImpl),
    })

    let mutated: { bookingNumber?: string } | undefined
    await act(async () => {
      mutated = await result.current.mutateAsync({
        params: { id: "book_1" },
        input: { note: "ok" },
      })
    })

    expect(calls[0]?.method).toBe("POST")
    expect(calls[0]?.url).toBe("https://acme.voyant.app/v1/admin/bookings/book_1/cancel")
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({ note: "ok" })
    // The mutation resolves with the parsed operation output.
    expect(mutated?.bookingNumber).toBe("B-1")
  })

  it("useCapabilities fetches the capability descriptor", async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ contractVersion: "0.1.0", modules: ["bookings"], operations: [] }),
    })

    const { result } = renderHook(() => useCapabilities(), { wrapper: makeWrapper(fetchImpl) })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.contractVersion).toBe("0.1.0")
    expect(result.current.data?.modules).toContain("bookings")
  })

  it("adminQueryKey is stable and operation-scoped", () => {
    expect(adminQueryKey(crmOperations.people.get, { params: { id: "pers_1" } })).toEqual([
      "voyant-admin",
      "crm.people.get",
      { id: "pers_1" },
      null,
    ])
  })
})
