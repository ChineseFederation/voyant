import { getTableName } from "drizzle-orm"
import { describe, expect, it, vi } from "vitest"
import { issueBookingDraftCapability } from "./draft-capability.js"
import { createOwnedBookingHandlerRegistry, type OwnedBookingHandler } from "./owned-handler.js"
import { createSelfServiceBookingSourceProvider } from "./self-service-source.js"

const CAPABILITY_ENV = {
  VOYANT_BOOKING_DRAFT_CAPABILITY_SECRET: "draft-capability-test-secret-32c",
}

const FUTURE = new Date(Date.now() + 60 * 60 * 1000)
const PAST = new Date(Date.now() - 60 * 1000)

/**
 * Everything a public caller supplies is an identifier, so these assert the
 * verification gates rather than the derivation (which the vertical owns).
 */
describe("self-service booking source provider", () => {
  it("resolves a valid draft and quote into a derived command", async () => {
    const result = await resolve()

    expect(result).toMatchObject({
      status: "ok",
      command: { productId: "prod_1" },
    })
  })

  it.each([
    ["draft is missing", { draft: null }, "draft_not_found"],
    ["draft is already consumed", { draft: { consumed_booking_id: "book_0" } }, "draft_consumed"],
    ["quote is missing", { quote: null }, "quote_not_found"],
    ["quote is already consumed", { quote: { consumed_booking_id: "book_0" } }, "quote_consumed"],
    ["quote has expired", { quote: { expires_at: PAST } }, "quote_expired"],
    ["the hold has lapsed", { draft: { hold_expires_at: PAST } }, "hold_expired"],
    ["the quote is for another entity", { quote: { entity_id: "prod_other" } }, "entity_mismatch"],
    [
      "the quote is not the draft's current one",
      { draft: { current_quote_id: "cquo_other" } },
      "price_changed",
    ],
  ])("refuses when %s", async (_label, patch, reason) => {
    expect(await resolve(patch)).toEqual({ status: "rejected", reason })
  })

  it("refuses a caller who does not hold the draft", async () => {
    // The draft id alone is not authorization: it is caller-supplied on the
    // public draft PUT, and the draft holds another party's traveller and
    // contact details.
    expect(await resolve({ draftCapabilityToken: "" })).toEqual({
      status: "rejected",
      reason: "draft_forbidden",
    })
  })

  it("refuses a capability minted for a different draft", async () => {
    const other = await issueBookingDraftCapability("bdrf_other", CAPABILITY_ENV)

    expect(await resolve({ draftCapabilityToken: other.token })).toEqual({
      status: "rejected",
      reason: "draft_forbidden",
    })
  })

  it("refuses a booking with no live hold when the vertical manages inventory", async () => {
    // Hold conversion only runs for slot-backed products, so a slotless one
    // with no hold would oversell rather than fail.
    expect(await resolve({ draft: { hold_expires_at: null } })).toEqual({
      status: "rejected",
      reason: "hold_required",
    })
  })

  it("refuses a draft whose current price no longer matches the quote", async () => {
    // The attack the re-price closes: quote 1 adult / 1 night at 100, then
    // rewrite the draft to a bigger party keeping the cheap quote id. Every
    // other binding still passes, so only re-pricing catches it.
    const result = await resolve({
      handler: {
        entityModule: "products",
        async computeQuote() {
          return {
            available: true,
            pricing: { base_amount: 600, taxes: 0, fees: 0, surcharges: 0, currency: "EUR" },
          }
        },
        async deriveSelfServiceCommand() {
          return { status: "ok", command: { productId: "prod_1" } }
        },
      },
    })

    expect(result).toEqual({ status: "rejected", reason: "price_changed" })
  })

  it("refuses a draft the vertical can no longer price", async () => {
    const result = await resolve({
      handler: {
        entityModule: "products",
        async computeQuote() {
          return { available: false, invalidReason: "sold_out" }
        },
        async deriveSelfServiceCommand() {
          return { status: "ok", command: { productId: "prod_1" } }
        },
      },
    })

    expect(result).toEqual({ status: "rejected", reason: "price_changed" })
  })

  it("drops the contact channel a guest never verified", async () => {
    const resolveBillingPerson = vi.fn(async () => "per_new")

    // SMS-verified caller who put someone else's email in the draft. Without
    // narrowing, upsertPersonFromContact matches that email first and attaches
    // the booking to the victim's CRM person.
    await resolve({
      caller: { verifiedPhone: "+40712345678" },
      payload: {
        billing: {
          contact: {
            firstName: "Ada",
            lastName: "L",
            email: "victim@example.com",
            phone: "+40712345678",
          },
        },
        travelers: [{ firstName: "Ada" }],
      },
      resolveBillingPerson,
    })

    expect(resolveBillingPerson).toHaveBeenCalledWith(
      expect.objectContaining({ email: null, phone: "+40712345678" }),
      expect.anything(),
    )
  })

  it("refuses a challenge verified for a different contact", async () => {
    const result = await resolve({ caller: { verifiedEmail: "someone-else@example.com" } })

    expect(result).toEqual({ status: "rejected", reason: "contact_mismatch" })
  })

  it("refuses a vertical with no derivation primitive", async () => {
    const result = await resolve({
      handler: {
        entityModule: "products",
        async computeQuote() {
          return {
            available: true,
            pricing: { base_amount: 100, taxes: 0, fees: 0, surcharges: 0, currency: "EUR" },
          }
        },
      },
    })

    expect(result).toEqual({ status: "rejected", reason: "unsupported_vertical" })
  })

  it("never resolves a billing person for a party the create would reject", async () => {
    const resolveBillingPerson = vi.fn(async () => "per_new")

    // No travelers: the create command would reject this party, so resolving
    // would persist a CRM person that nothing ever references. Must be a guest
    // caller — an authenticated one is already the billing party.
    const result = await resolve({
      caller: { verifiedEmail: "guest@example.com" },
      payload: { travelers: [] },
      resolveBillingPerson,
    })

    expect(result).toEqual({ status: "rejected", reason: "incomplete_draft" })
    expect(resolveBillingPerson).not.toHaveBeenCalled()
  })

  it("resolves a billing person once the whole party would pass", async () => {
    const resolveBillingPerson = vi.fn(async () => "per_new")

    await resolve({ caller: { verifiedEmail: "guest@example.com" }, resolveBillingPerson })

    expect(resolveBillingPerson).toHaveBeenCalledWith(
      expect.objectContaining({ email: "guest@example.com" }),
      expect.objectContaining({ source: "storefront-self-service" }),
    )
  })

  it("claims the draft and quote together, conditionally", async () => {
    const updates: string[] = []
    const provider = createSelfServiceBookingSourceProvider({
      resolveOwnedHandlers: () => createOwnedBookingHandlerRegistry(),
    })

    await provider.consumeBookingSource(consumingTx(updates, true) as never, {
      draftId: "bdrf_1",
      quoteId: "cquo_1",
      bookingId: "book_1",
    })

    expect(updates).toHaveLength(2)
  })

  it("refuses to consume a draft another request already claimed", async () => {
    const provider = createSelfServiceBookingSourceProvider({
      resolveOwnedHandlers: () => createOwnedBookingHandlerRegistry(),
    })

    // The conditional UPDATE affects no row. Throwing rolls the create back,
    // which is what stops two concurrent requests producing two bookings from
    // one draft and one hold.
    await expect(
      provider.consumeBookingSource(consumingTx([], false) as never, {
        draftId: "bdrf_1",
        quoteId: "cquo_1",
        bookingId: "book_1",
      }),
    ).rejects.toThrow(/already consumed/)
  })
})

async function resolve(
  patch: {
    draft?: Record<string, unknown> | null
    quote?: Record<string, unknown> | null
    caller?: Record<string, unknown>
    payload?: Record<string, unknown>
    handler?: Partial<OwnedBookingHandler>
    resolveBillingPerson?: (...args: never[]) => Promise<string | null>
    /** Empty string means "present no capability". */
    draftCapabilityToken?: string
  } = {},
) {
  const ownedHandlers = createOwnedBookingHandlerRegistry()
  // `patch.handler` replaces the handler outright rather than merging, so a
  // test can register one that genuinely lacks `deriveSelfServiceCommand`.
  ownedHandlers.register(
    (patch.handler ?? {
      entityModule: "products",
      async computeQuote() {
        // Matches the quote fixture (base 100 EUR) so re-pricing agrees.
        return {
          available: true,
          pricing: { base_amount: 100, taxes: 0, fees: 0, surcharges: 0, currency: "EUR" },
        }
      },
      // The products handler implements holds, so the fixture does too.
      async placeHold() {
        return { holdToken: "hold_1", expiresAt: FUTURE }
      },
      async deriveSelfServiceCommand() {
        return { status: "ok", command: { productId: "prod_1" } }
      },
    }) as OwnedBookingHandler,
  )

  const provider = createSelfServiceBookingSourceProvider({
    resolveOwnedHandlers: () => ownedHandlers,
    resolveEnv: () => CAPABILITY_ENV,
    ...(patch.resolveBillingPerson
      ? { resolveBillingPerson: patch.resolveBillingPerson as never }
      : {}),
  })

  const draft =
    patch.draft === null
      ? null
      : {
          id: "bdrf_1",
          entity_module: "products",
          entity_id: "prod_1",
          current_quote_id: "cquo_1",
          hold_expires_at: FUTURE,
          consumed_booking_id: null,
          draft_payload: {
            billing: {
              contact: {
                firstName: "Ada",
                lastName: "L",
                email: "guest@example.com",
                phone: null,
              },
            },
            travelers: [{ firstName: "Ada" }],
            ...patch.payload,
          },
          ...patch.draft,
        }

  const quote =
    patch.quote === null
      ? null
      : {
          id: "cquo_1",
          entity_module: "products",
          entity_id: "prod_1",
          expires_at: FUTURE,
          consumed_booking_id: null,
          locale: "en-GB",
          audience: "customer",
          market: "default",
          currency: "EUR",
          pricing_base_amount: "100",
          pricing_currency: "EUR",
          ...patch.quote,
        }

  const capability =
    patch.draftCapabilityToken !== undefined
      ? patch.draftCapabilityToken
      : (await issueBookingDraftCapability("bdrf_1", CAPABILITY_ENV)).token

  return provider.resolveBookingSource({
    db: selectDb({ booking_drafts: draft, catalog_quotes: quote }),
    draftId: "bdrf_1",
    quoteId: "cquo_1",
    caller: (patch.caller ?? { personId: "per_1" }) as never,
    ...(capability ? { draftCapabilityToken: capability } : {}),
  })
}

/**
 * Returns the row matching whichever table the query selects from, and lets
 * conditional consumption UPDATEs report an affected row.
 */
function selectDb(rows: Record<string, unknown>, consumable = true) {
  return {
    select: () => ({
      from: (table: Parameters<typeof getTableName>[0]) => ({
        where: () => ({
          limit: async () => {
            const row = rows[getTableName(table)]
            return row ? [row] : []
          },
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => (consumable ? [{ id: "row_1" }] : []),
        }),
      }),
    }),
  } as never
}

/** Transaction double whose conditional UPDATE reports whether it won. */
function consumingTx(updates: string[], won: boolean) {
  return {
    update: (table: Parameters<typeof getTableName>[0]) => ({
      set: () => ({
        where: () => ({
          returning: async () => {
            if (!won) return []
            updates.push(getTableName(table))
            return [{ id: "row_1" }]
          },
        }),
      }),
    }),
  }
}
