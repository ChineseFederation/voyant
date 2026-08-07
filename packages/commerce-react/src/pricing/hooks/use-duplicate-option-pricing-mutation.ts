"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { fetchWithValidation } from "../client.js"
import { useVoyantPricingContext } from "../provider.js"
import { pricingQueryKeys } from "../query-keys.js"
import {
  type OptionPriceRuleRecord,
  type OptionUnitPriceRuleRecord,
  optionPriceRuleListResponse,
  optionUnitPriceRuleListResponse,
} from "../schemas.js"
import { useOptionPriceRuleMutation } from "./use-option-price-rule-mutation.js"
import { useOptionUnitPriceRuleMutation } from "./use-option-unit-price-rule-mutation.js"

export interface DuplicateOptionPricingInput {
  sourceOptionId: string
  targetOptionId: string
  productId: string
  unitIdMap: Record<string, string>
}

export function useDuplicateOptionPricingMutation() {
  const { baseUrl, fetcher } = useVoyantPricingContext()
  const queryClient = useQueryClient()
  const { create: createRule } = useOptionPriceRuleMutation()
  const { create: createUnitPriceRule } = useOptionUnitPriceRuleMutation()

  return useMutation({
    mutationFn: async ({
      sourceOptionId,
      targetOptionId,
      productId,
      unitIdMap,
    }: DuplicateOptionPricingInput) => {
      const { data: sourceRules } = await fetchWithValidation<{ data: OptionPriceRuleRecord[] }>(
        `/v1/admin/pricing/option-price-rules?optionId=${encodeURIComponent(sourceOptionId)}&limit=100`,
        optionPriceRuleListResponse,
        { baseUrl, fetcher },
      )

      for (const rule of sourceRules) {
        const duplicatedRule = await createRule.mutateAsync({
          productId,
          optionId: targetOptionId,
          priceCatalogId: rule.priceCatalogId,
          priceScheduleId: rule.priceScheduleId,
          cancellationPolicyId: rule.cancellationPolicyId,
          code: rule.code,
          name: rule.name,
          description: rule.description,
          pricingMode: rule.pricingMode,
          baseSellAmountCents: rule.baseSellAmountCents,
          occupancyPriceBasis: rule.occupancyPriceBasis,
          baseCostAmountCents: rule.baseCostAmountCents,
          minPerBooking: rule.minPerBooking,
          maxPerBooking: rule.maxPerBooking,
          allPricingCategories: rule.allPricingCategories,
          isDefault: rule.isDefault,
          active: rule.active,
          notes: rule.notes,
        })

        const { data: sourceUnitPriceRules } = await fetchWithValidation<{
          data: OptionUnitPriceRuleRecord[]
        }>(
          `/v1/admin/pricing/option-unit-price-rules?optionPriceRuleId=${encodeURIComponent(rule.id)}&limit=500`,
          optionUnitPriceRuleListResponse,
          { baseUrl, fetcher },
        )

        for (const unitPriceRule of sourceUnitPriceRules) {
          const duplicatedUnitId = unitIdMap[unitPriceRule.unitId]
          if (!duplicatedUnitId) continue

          await createUnitPriceRule.mutateAsync({
            optionPriceRuleId: duplicatedRule.id,
            optionId: targetOptionId,
            unitId: duplicatedUnitId,
            pricingCategoryId: unitPriceRule.pricingCategoryId,
            pricingMode: unitPriceRule.pricingMode,
            sellAmountCents: unitPriceRule.sellAmountCents,
            costAmountCents: unitPriceRule.costAmountCents,
            minQuantity: unitPriceRule.minQuantity,
            maxQuantity: unitPriceRule.maxQuantity,
            sortOrder: unitPriceRule.sortOrder,
            active: unitPriceRule.active,
            notes: unitPriceRule.notes,
          })
        }
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pricingQueryKeys.optionPriceRules() })
      void queryClient.invalidateQueries({ queryKey: pricingQueryKeys.optionUnitPriceRules() })
    },
  })
}
