import {
  type CommerceOperatorSettingsRuntime,
  commerceOperatorSettingsRuntimePort,
} from "@voyant-travel/commerce/runtime-port"
import {
  type FinanceOperatorSettingsRuntime,
  financeOperatorSettingsRuntimePort,
} from "@voyant-travel/finance/runtime-port"

import {
  getOperatorPaymentInstructions,
  getOperatorProfile,
  resolveBookingTaxSettings,
  resolveInvoiceFxSettings,
  resolveInvoicePayUrlTemplate,
  resolveInvoicingMode,
  resolveOperatorDefaultPaymentPolicy,
  updateBookingTaxSettings,
  updateInvoiceFxSettings,
} from "./service.js"

/** Provide operator-owned Finance settings through Finance's typed port. */
export function createOperatorSettingsRuntimePortContribution(
  _host: object,
): Readonly<Record<string, unknown>> {
  return {
    [commerceOperatorSettingsRuntimePort.id]: {
      resolveBookingTaxSettings,
      resolveOperatorDefaultPaymentPolicy,
      async resolveBankTransferInstructions(db, env) {
        const [profile, payment] = await Promise.all([
          getOperatorProfile(db),
          getOperatorPaymentInstructions(db),
        ])
        return {
          beneficiary:
            payment?.bankTransferBeneficiary ||
            profile?.legalName ||
            profile?.name ||
            stringValue(env.BANK_TRANSFER_BENEFICIARY) ||
            stringValue(env.STOREFRONT_BANK_BENEFICIARY) ||
            "—",
          iban:
            payment?.iban ||
            stringValue(env.BANK_TRANSFER_IBAN) ||
            stringValue(env.STOREFRONT_BANK_IBAN) ||
            "—",
          bankName:
            payment?.bank ||
            stringValue(env.BANK_TRANSFER_BANK_NAME) ||
            stringValue(env.STOREFRONT_BANK_NAME) ||
            "—",
        }
      },
    } satisfies CommerceOperatorSettingsRuntime,
    [financeOperatorSettingsRuntimePort.id]: {
      resolveOperatorDefaultPaymentPolicy,
      resolveBookingTaxSettings,
      updateBookingTaxSettings,
      resolveInvoicingMode,
      resolveInvoicePayUrlTemplate,
      resolveInvoiceFxSettings,
      updateInvoiceFxSettings,
    } satisfies FinanceOperatorSettingsRuntime,
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}
