import type { InitiateCheckoutCollectionInput } from "@voyant-travel/finance/checkout"
import { beforeEach, describe, expect, it, vi } from "vitest"

const testState = vi.hoisted(() => ({
  fetcher: vi.fn(),
  mutations: [] as Array<{
    mutationFn: (input: { choice: { type: string }; amountCents: number }) => Promise<unknown>
  }>,
}))

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: (options: {
    mutationFn: (input: { choice: { type: string }; amountCents: number }) => Promise<unknown>
  }) => {
    testState.mutations.push(options)
    return { mutate: vi.fn(), mutateAsync: vi.fn() }
  },
}))

vi.mock("../../src/provider.js", () => ({
  useVoyantFinanceContext: () => ({ baseUrl: "https://api.test", fetcher: testState.fetcher }),
}))

async function generateLink(options?: { cardProvider?: string }) {
  // Aliased away from the `use` prefix: react-query is mocked, so this is a
  // plain call that registers the mutation, not a hook in a render tree.
  const { useCollectPayment: collectPayment } = await import(
    "../../src/checkout-hooks/use-collect-payment.js"
  )
  collectPayment("book_1", options)
  const mutation = testState.mutations.at(-1)
  if (!mutation) throw new Error("useCollectPayment registered no mutation")
  await mutation.mutationFn({ choice: { type: "hold" }, amountCents: 12_000 })
  const body = String(testState.fetcher.mock.calls.at(-1)?.[1]?.body)
  return JSON.parse(body) as InitiateCheckoutCollectionInput
}

describe("useCollectPayment", () => {
  beforeEach(() => {
    testState.mutations.length = 0
    testState.fetcher.mockReset()
    testState.fetcher.mockResolvedValue(Response.json({ data: {} }))
  })

  // voyant#4599: the hook used to stamp `provider: "netopia"` on every link,
  // so a deployment running any other processor produced a session the real
  // adapter could not adopt — the identity guard rejected its own initiation.
  it("leaves the payment session provider-agnostic", async () => {
    const request = await generateLink()

    expect(request.paymentSession).toBeDefined()
    expect(request.paymentSession?.provider).toBeUndefined()
  })

  it("still pins a provider when the caller names one", async () => {
    const request = await generateLink({ cardProvider: "netopia" })

    expect(request.paymentSession?.provider).toBe("netopia")
  })
})
