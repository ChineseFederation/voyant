import { and, asc, eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { productExtrasRef } from "./product-extra-ref.js"
import {
  centsToAmount,
  getPreferredCurrency,
  resolvePricingContext,
} from "./service-departures-pricing-context.js"

export async function getPublicApiProductExtensions(
  db: PostgresJsDatabase,
  productId: string,
  optionId?: string,
) {
  const context = await resolvePricingContext(db, productId, optionId)

  const extras = await db
    .select({
      id: productExtrasRef.id,
      name: productExtrasRef.name,
      description: productExtrasRef.description,
      selectionType: productExtrasRef.selectionType,
      pricingMode: productExtrasRef.pricingMode,
      pricedPerPerson: productExtrasRef.pricedPerPerson,
      defaultQuantity: productExtrasRef.defaultQuantity,
      minQuantity: productExtrasRef.minQuantity,
      maxQuantity: productExtrasRef.maxQuantity,
      metadata: productExtrasRef.metadata,
    })
    .from(productExtrasRef)
    .where(and(eq(productExtrasRef.productId, productId), eq(productExtrasRef.active, true)))
    .orderBy(asc(productExtrasRef.sortOrder), asc(productExtrasRef.name))

  const priceRuleByExtraId = new Map(
    context.extraRules
      .filter((rule) => rule.productExtraId)
      .map((rule) => [rule.productExtraId as string, rule] as const),
  )

  const extensions = extras.map((extra) => {
    const metadata = (extra.metadata ?? {}) as Record<string, unknown>
    const rule = priceRuleByExtraId.get(extra.id)
    const pricingMode =
      rule?.pricingMode ?? (extra.pricedPerPerson ? "per_person" : extra.pricingMode)
    const amount = centsToAmount(rule?.sellAmountCents)

    return {
      id: extra.id,
      name: extra.name,
      label: extra.name,
      required: extra.selectionType === "required",
      selectable: extra.selectionType !== "unavailable",
      hasOptions: false,
      refProductId:
        typeof metadata.refProductId === "string"
          ? metadata.refProductId
          : typeof metadata.productId === "string"
            ? metadata.productId
            : null,
      thumb: typeof metadata.thumbUrl === "string" ? metadata.thumbUrl : null,
      pricePerPerson:
        pricingMode === "per_person" || extra.pricedPerPerson ? (amount ?? null) : null,
      currencyCode: getPreferredCurrency(context),
      pricingMode,
      defaultQuantity: extra.defaultQuantity ?? null,
      minQuantity: extra.minQuantity ?? null,
      maxQuantity: extra.maxQuantity ?? null,
    }
  })

  const details = Object.fromEntries(
    extras.map((extra) => {
      const metadata = (extra.metadata ?? {}) as Record<string, unknown>
      const media = Array.isArray(metadata.media)
        ? metadata.media
            .map((entry) =>
              entry && typeof entry === "object"
                ? {
                    url:
                      typeof (entry as Record<string, unknown>).url === "string"
                        ? String((entry as Record<string, unknown>).url)
                        : "",
                    alt:
                      typeof (entry as Record<string, unknown>).alt === "string"
                        ? String((entry as Record<string, unknown>).alt)
                        : null,
                  }
                : null,
            )
            .filter((value): value is NonNullable<typeof value> => Boolean(value?.url))
        : []

      return [
        extra.id,
        {
          description: extra.description ?? null,
          media,
        },
      ]
    }),
  )

  return {
    extensions,
    items: extensions,
    details,
    currencyCode: getPreferredCurrency(context),
  }
}
