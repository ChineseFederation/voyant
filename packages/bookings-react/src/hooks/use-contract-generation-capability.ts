"use client"

import { useDefaultLegalContractTemplate } from "@voyant-travel/legal-react"

export interface BookingContractGenerationCapability {
  /** False only once the deployment has answered that it cannot produce one. */
  available: boolean
  /** True while the answer is still outstanding; the option stays enabled. */
  resolving: boolean
}

/**
 * Whether this deployment can actually produce a customer contract.
 *
 * voyant#4634: "Generate invoice and contract" produced an invoice and no
 * contract, with no error anywhere — the operator ticked a box the deployment
 * could not honour and every signal said it had worked. Legal generates the
 * contract from the default customer contract template; with no active template
 * resolvable there is nothing to render, and generation stops before a contract
 * row exists, which is why the booking's Documents tab stays empty.
 *
 * This is the template half of the capability, not the renderer half. The
 * renderer is a resolved-graph provider port and is not readable from the
 * browser; the standard operator deployment always selects it, so the template
 * is what actually decides the outcome on a real tenant. A deployment missing
 * the renderer still records the failure per booking, server-side.
 *
 * Optimistic on anything short of a definitive answer. Only a 404 means "there
 * is no default customer template"; a 403 means this operator cannot read Legal
 * and says nothing about what the deployment can render, and a loading or
 * network-failed query says nothing at all. Disabling on those would replace one
 * misleading UI with another.
 *
 * Requires the Voyant provider and a query client, so it belongs to the admin
 * surfaces rather than to the journey step components, which are published
 * without either.
 */
export function useBookingContractGenerationCapability(): BookingContractGenerationCapability {
  const query = useDefaultLegalContractTemplate({ scope: "customer" })
  return { available: !isTemplateAbsent(query.error), resolving: query.isPending }
}

/**
 * Duck-typed rather than `instanceof VoyantApiError`: the error is constructed
 * by legal-react's own client class, which is a different class object from
 * this package's identically shaped one.
 */
function isTemplateAbsent(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status: unknown }).status === 404
  )
}
