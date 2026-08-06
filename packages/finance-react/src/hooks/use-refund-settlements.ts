"use client"

import { useQuery } from "@tanstack/react-query"

import { useVoyantFinanceContext } from "../provider.js"
import type { FinanceRefundSettlementListFilters } from "../query-keys.js"
import { getRefundSettlementsQueryOptions } from "../query-options.js"

export interface UseRefundSettlementsOptions extends FinanceRefundSettlementListFilters {
  enabled?: boolean
}

/**
 * The refund-settlement list (voyant#4303). Filter by `creditNoteId` to answer
 * "has this credit note actually been paid?", which the credit note itself
 * cannot say, or by `owed: true` for everything still outstanding.
 */
export function useRefundSettlements(options: UseRefundSettlementsOptions = {}) {
  const { baseUrl, fetcher } = useVoyantFinanceContext()
  const { enabled = true, ...filters } = options

  return useQuery({
    ...getRefundSettlementsQueryOptions({ baseUrl, fetcher }, filters),
    enabled,
  })
}
