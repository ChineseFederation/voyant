import {
  bookingsOperations,
  crmOperations,
  type DeploymentCapabilities,
  financeOperations,
  type InferInput,
  legalOperations,
  productsOperations,
} from "@voyant-travel/admin-contracts"

import { type AdminClientConfig, createExecutor, fetchCapabilities } from "./http.js"

/**
 * Create a framework-neutral admin client for a Voyant deployment. Runs in
 * Expo, Node, Workers, and any AI tool runtime — no React or framework runtime
 * deps.
 *
 * ```ts
 * const client = createAdminClient({
 *   baseUrl: "https://acme.voyant.app",
 *   auth: { type: "apiKey", apiKey: "voy_..." },
 * })
 * const { data } = await client.bookings.list({ status: "on_hold" })
 * await client.bookings.confirm({ id: "book_123" }, { note: "ok" })
 * ```
 */
export function createAdminClient(config: AdminClientConfig) {
  const execute = createExecutor(config)

  return {
    /** Escape hatch: run any operation descriptor directly. */
    execute,
    /** Discover enabled modules, operations, version, and required scopes. */
    capabilities: (): Promise<DeploymentCapabilities> => fetchCapabilities(config),

    bookings: {
      list: (input?: InferInput<typeof bookingsOperations.list>) =>
        execute(bookingsOperations.list, undefined, input),
      get: (params: { id: string }) => execute(bookingsOperations.get, params),
      confirm: (params: { id: string }, input?: InferInput<typeof bookingsOperations.confirm>) =>
        execute(bookingsOperations.confirm, params, input),
      cancel: (params: { id: string }, input?: InferInput<typeof bookingsOperations.cancel>) =>
        execute(bookingsOperations.cancel, params, input),
    },

    finance: {
      invoices: {
        list: (input?: InferInput<typeof financeOperations.invoices.list>) =>
          execute(financeOperations.invoices.list, undefined, input),
        get: (params: { id: string }) => execute(financeOperations.invoices.get, params),
      },
      payments: {
        record: (
          params: { id: string },
          input: InferInput<typeof financeOperations.payments.record>,
        ) => execute(financeOperations.payments.record, params, input),
      },
      paymentLinks: {
        create: (
          params: { id: string },
          input?: InferInput<typeof financeOperations.paymentLinks.create>,
        ) => execute(financeOperations.paymentLinks.create, params, input),
      },
    },

    crm: {
      people: {
        list: (input?: InferInput<typeof crmOperations.people.list>) =>
          execute(crmOperations.people.list, undefined, input),
        get: (params: { id: string }) => execute(crmOperations.people.get, params),
        create: (input: InferInput<typeof crmOperations.people.create>) =>
          execute(crmOperations.people.create, undefined, input),
        update: (params: { id: string }, input: InferInput<typeof crmOperations.people.update>) =>
          execute(crmOperations.people.update, params, input),
        delete: (params: { id: string }) => execute(crmOperations.people.delete, params),
        /** Reveal a person document's encrypted number (PII-gated). */
        revealDocument: (params: { id: string }) =>
          execute(crmOperations.people.revealDocument, params),
      },
      organizations: {
        list: (input?: InferInput<typeof crmOperations.organizations.list>) =>
          execute(crmOperations.organizations.list, undefined, input),
        get: (params: { id: string }) => execute(crmOperations.organizations.get, params),
        create: (input: InferInput<typeof crmOperations.organizations.create>) =>
          execute(crmOperations.organizations.create, undefined, input),
        update: (
          params: { id: string },
          input: InferInput<typeof crmOperations.organizations.update>,
        ) => execute(crmOperations.organizations.update, params, input),
        delete: (params: { id: string }) => execute(crmOperations.organizations.delete, params),
      },
    },

    legal: {
      contracts: {
        list: (input?: InferInput<typeof legalOperations.contracts.list>) =>
          execute(legalOperations.contracts.list, undefined, input),
        get: (params: { id: string }) => execute(legalOperations.contracts.get, params),
        create: (input: InferInput<typeof legalOperations.contracts.create>) =>
          execute(legalOperations.contracts.create, undefined, input),
        update: (
          params: { id: string },
          input: InferInput<typeof legalOperations.contracts.update>,
        ) => execute(legalOperations.contracts.update, params, input),
        issue: (params: { id: string }) => execute(legalOperations.contracts.issue, params),
        void: (params: { id: string }) => execute(legalOperations.contracts.void, params),
      },
      policies: {
        list: (input?: InferInput<typeof legalOperations.policies.list>) =>
          execute(legalOperations.policies.list, undefined, input),
        get: (params: { id: string }) => execute(legalOperations.policies.get, params),
        create: (input: InferInput<typeof legalOperations.policies.create>) =>
          execute(legalOperations.policies.create, undefined, input),
        update: (
          params: { id: string },
          input: InferInput<typeof legalOperations.policies.update>,
        ) => execute(legalOperations.policies.update, params, input),
        evaluate: (
          params: { id: string },
          input: InferInput<typeof legalOperations.policies.evaluate>,
        ) => execute(legalOperations.policies.evaluate, params, input),
      },
    },

    products: {
      list: (input?: InferInput<typeof productsOperations.list>) =>
        execute(productsOperations.list, undefined, input),
      get: (params: { id: string }) => execute(productsOperations.get, params),
      create: (input: InferInput<typeof productsOperations.create>) =>
        execute(productsOperations.create, undefined, input),
      update: (params: { id: string }, input: InferInput<typeof productsOperations.update>) =>
        execute(productsOperations.update, params, input),
      delete: (params: { id: string }) => execute(productsOperations.delete, params),
    },
  }
}

export type AdminClient = ReturnType<typeof createAdminClient>
