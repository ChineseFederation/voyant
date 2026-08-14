import { resolveEffectivePaymentLinkUrlTemplate } from "@voyant-travel/finance/payment-link"
import { getOperatorPaymentDefaults } from "@voyant-travel/operator-settings"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

export async function resolveOperatorPaymentLinkUrlTemplate(
  db: PostgresJsDatabase,
  env: Readonly<Record<string, unknown>>,
): Promise<string | null> {
  const configured = (await getOperatorPaymentDefaults(db))?.invoicePayUrlTemplate
  const managedDefault =
    typeof env.PUBLIC_PAYMENT_LINK_URL_TEMPLATE === "string"
      ? env.PUBLIC_PAYMENT_LINK_URL_TEMPLATE
      : undefined
  return resolveEffectivePaymentLinkUrlTemplate(configured, managedDefault)
}
