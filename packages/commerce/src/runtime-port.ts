import { definePort } from "@voyant-travel/core/project"
import type { BookingTaxSettings, PaymentPolicy } from "@voyant-travel/finance"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"

import type { AcceptanceSignatureLegalPort } from "./checkout/acceptance-signature.js"
import type {
  CheckoutBankTransferInstructions,
  CheckoutStartOptions,
  CommerceAcceptanceDraftInput,
} from "./checkout/options.js"

export type { CommerceAcceptanceDraftInput } from "./checkout/options.js"

export interface CommerceOperatorSettingsRuntime {
  resolveBookingTaxSettings(db: PostgresJsDatabase): Promise<BookingTaxSettings>
  resolveOperatorDefaultPaymentPolicy(db: PostgresJsDatabase): Promise<PaymentPolicy | null>
  resolveBankTransferInstructions(
    db: PostgresJsDatabase,
    env: Record<string, string | undefined>,
  ): Promise<CheckoutBankTransferInstructions>
}

export interface CommerceInventoryRuntime {
  getOwnedProductName(
    db: PostgresJsDatabase,
    entityModule: string,
    entityId: string,
  ): Promise<string | null>
  listAllProductIds(db: PostgresJsDatabase): Promise<string[]>
}

export interface CommerceLegalRuntime extends AcceptanceSignatureLegalPort {
  persistAcceptanceDraftContract(
    db: PostgresJsDatabase,
    input: CommerceAcceptanceDraftInput,
  ): Promise<void>
}

export interface CommerceCardPaymentRuntime {
  createStartCardPayment(context: Context): CheckoutStartOptions["startCardPayment"]
}

function objectPort<T extends object>(id: string, methods: readonly string[]) {
  return definePort<T>({
    id,
    test(provider) {
      if (provider === null || typeof provider !== "object") {
        throw new Error(`${id} provider must be an object.`)
      }
      for (const method of methods) {
        if (typeof Reflect.get(provider, method) !== "function") {
          throw new Error(`${id} provider must implement ${method}().`)
        }
      }
    },
  })
}

export const commerceOperatorSettingsRuntimePort = objectPort<CommerceOperatorSettingsRuntime>(
  "commerce.operator-settings.runtime",
  [
    "resolveBookingTaxSettings",
    "resolveOperatorDefaultPaymentPolicy",
    "resolveBankTransferInstructions",
  ],
)

export const commerceInventoryRuntimePort = objectPort<CommerceInventoryRuntime>(
  "commerce.inventory.runtime",
  ["getOwnedProductName", "listAllProductIds"],
)

export const commerceLegalRuntimePort = objectPort<CommerceLegalRuntime>("commerce.legal.runtime", [
  "getContract",
  "listSignatures",
  "sendContract",
  "signContract",
  "persistAcceptanceDraftContract",
])

export const commerceCardPaymentRuntimePort = objectPort<CommerceCardPaymentRuntime>(
  "commerce.card-payment.runtime",
  ["createStartCardPayment"],
)
