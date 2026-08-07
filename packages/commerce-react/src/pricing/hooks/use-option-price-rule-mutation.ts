"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { fetchWithValidation } from "../client.js"
import { useVoyantPricingContext } from "../provider.js"
import { pricingQueryKeys } from "../query-keys.js"
import { optionPriceRuleSingleResponse, successEnvelope } from "../schemas.js"

const optionPricingModeSchema = z.enum([
  "per_person",
  "per_booking",
  "starting_from",
  "free",
  "on_request",
])

const optionPriceRuleInputSchema = z.object({
  productId: z.string(),
  optionId: z.string(),
  priceCatalogId: z.string(),
  priceScheduleId: z.string().nullable().optional(),
  cancellationPolicyId: z.string().nullable().optional(),
  code: z.string().max(100).nullable().optional(),
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  pricingMode: optionPricingModeSchema,
  baseSellAmountCents: z.number().int().min(0).nullable().optional(),
  occupancyPriceBasis: z.enum(["supplement", "all_in"]).nullable().optional(),
  baseCostAmountCents: z.number().int().min(0).nullable().optional(),
  minPerBooking: z.number().int().min(0).nullable().optional(),
  maxPerBooking: z.number().int().min(0).nullable().optional(),
  allPricingCategories: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  active: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})

export type CreateOptionPriceRuleInput = z.input<typeof optionPriceRuleInputSchema>
export type UpdateOptionPriceRuleInput = Partial<CreateOptionPriceRuleInput>

export function useOptionPriceRuleMutation() {
  const { baseUrl, fetcher } = useVoyantPricingContext()
  const queryClient = useQueryClient()

  const create = useMutation({
    mutationFn: async (input: CreateOptionPriceRuleInput) => {
      const { data } = await fetchWithValidation(
        "/v1/admin/pricing/option-price-rules",
        optionPriceRuleSingleResponse,
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: pricingQueryKeys.optionPriceRules() })
      queryClient.setQueryData(pricingQueryKeys.optionPriceRule(data.id), data)
    },
  })

  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateOptionPriceRuleInput }) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/pricing/option-price-rules/${id}`,
        optionPriceRuleSingleResponse,
        { baseUrl, fetcher },
        { method: "PATCH", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: pricingQueryKeys.optionPriceRules() })
      queryClient.setQueryData(pricingQueryKeys.optionPriceRule(data.id), data)
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) =>
      fetchWithValidation(
        `/v1/admin/pricing/option-price-rules/${id}`,
        successEnvelope,
        { baseUrl, fetcher },
        { method: "DELETE" },
      ),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: pricingQueryKeys.optionPriceRules() })
      queryClient.removeQueries({ queryKey: pricingQueryKeys.optionPriceRule(id) })
    },
  })

  return { create, update, remove }
}
