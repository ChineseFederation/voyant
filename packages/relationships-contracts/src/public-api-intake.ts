/** Import-cheap context shared by Storefront intake and its persistence provider. */
export interface PublicApiIntakeContext {
  db?: unknown
  eventBus?: unknown
  env?: unknown
  context?: unknown
}

export interface PublicApiIntakeSignal {
  id: string
  personId: string
  kind: "wishlist" | "notify" | "inquiry" | "request_offer" | "referral"
  source: "form" | "phone" | "admin" | "abandoned_cart" | "website" | "booking"
  status: "new" | "contacted" | "qualified" | "converted" | "lost" | "expired"
  productId?: string | null
  optionUnitId?: string | null
  sourceSubmissionId?: string | null
  metadata?: Record<string, unknown> | null
}

export interface PublicApiIntakePerson {
  id: string
}

export interface PublicApiIntakePersistence<
  Context extends PublicApiIntakeContext = PublicApiIntakeContext,
> {
  findSignal(input: {
    context: Context
    kind: PublicApiIntakeSignal["kind"]
    sourceSubmissionId: string
  }): Promise<PublicApiIntakeSignal | null> | PublicApiIntakeSignal | null
  createPerson(input: {
    context: Context
    data: {
      firstName: string
      lastName: string
      status: "active"
      website: string | null
      email?: string | null
      phone?: string | null
      source: string
      sourceRef: string
      tags: string[]
    }
  }): Promise<PublicApiIntakePerson | null> | PublicApiIntakePerson | null
  createCustomerSignal(input: {
    context: Context
    data: {
      personId: string
      productId?: string | null
      optionUnitId?: string | null
      kind: PublicApiIntakeSignal["kind"]
      source: PublicApiIntakeSignal["source"]
      status: "new"
      priority: "normal"
      notes?: string | null
      tags: string[]
      sourceSubmissionId: string
      metadata: Record<string, unknown>
    }
  }): Promise<PublicApiIntakeSignal | null> | PublicApiIntakeSignal | null
  updateCustomerSignal(input: {
    context: Context
    id: string
    data: {
      metadata: Record<string, unknown>
    }
  }): Promise<PublicApiIntakeSignal | null> | PublicApiIntakeSignal | null
  deleteCustomerSignal(input: { context: Context; id: string }): Promise<unknown> | unknown
  deletePerson(input: { context: Context; id: string }): Promise<unknown> | unknown
}
