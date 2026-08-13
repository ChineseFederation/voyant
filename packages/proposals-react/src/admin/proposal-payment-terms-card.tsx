"use client"

/**
 * Payment terms on the current Proposal Version (voyant#4606).
 *
 * Terms used to exist only on the operator profile — one deposit rule for
 * every customer and every deal — so a negotiated "50% now, the rest 30 days
 * before departure" could not be attached to the deal it belonged to, and the
 * customer-facing proposal could not state it. This card puts them on the
 * version the customer is actually agreeing to.
 *
 * Two deliberate choices:
 *
 * - The editor is finance's own `PaymentPolicyForm`, not a proposals copy of
 *   it. The stored shape IS finance's `PaymentPolicy`, so an operator who has
 *   set the operator default is looking at the same controls in the same order
 *   here, and there is one place for the deposit rules to change.
 * - "Inherit" means the version states nothing, and the booking falls through
 *   to the catalog/operator cascade exactly as it did before. Switching off
 *   inherit seeds the form from the operator's own default, so stating terms
 *   starts from what the operator already does rather than from an empty form.
 */

import { useQuery } from "@tanstack/react-query"
import type { PaymentPolicy } from "@voyant-travel/finance/payment-policy"
import { normalizePaymentPolicy } from "@voyant-travel/finance/payment-policy"
import {
  PaymentPolicyForm,
  PaymentPolicyPreview,
} from "@voyant-travel/finance-react/components/payment-policy-form"
import { Button, Card, CardContent, CardHeader, CardTitle } from "@voyant-travel/ui/components"
import { Loader2 } from "lucide-react"
import { useState } from "react"
import { useVoyantContext } from "../provider.js"

export interface ProposalPaymentTermsCardProps {
  /** The version being priced. Null while none is current. */
  version: {
    id: string
    status: string
    currency: string
    totalAmountCents: number
    paymentTerms: Record<string, unknown> | null
  } | null
  onSave: (input: { id: string; paymentTerms: PaymentPolicy | null }) => Promise<unknown>
  isSaving?: boolean
  messages: ProposalPaymentTermsMessages
}

export interface ProposalPaymentTermsMessages {
  title: string
  description: string
  /** Shown instead of the editor once the version has left draft. */
  lockedAfterSend: string
  save: string
  saved: string
  saveFailed: string
  noVersion: string
}

export function ProposalPaymentTermsCard({
  version,
  onSave,
  isSaving,
  messages: t,
}: ProposalPaymentTermsCardProps) {
  const { baseUrl, fetcher } = useVoyantContext()
  const stored = normalizePaymentPolicy(version?.paymentTerms ?? null)
  // Keyed on the SERVER value, not the normalized object: normalization hands
  // back the same reference for an already-valid policy but a fresh one for a
  // legacy shape, so comparing objects would re-seed on every render.
  const storedKey = `${version?.id ?? ""}:${JSON.stringify(version?.paymentTerms ?? null)}`

  const [draft, setDraft] = useState<PaymentPolicy | null>(stored)
  const [seededKey, setSeededKey] = useState(storedKey)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Reset during render rather than in an effect: switching to another version,
  // or a save landing, replaces the edit in progress with what the server now
  // holds, and React re-renders immediately without painting the stale draft.
  if (seededKey !== storedKey) {
    setSeededKey(storedKey)
    setDraft(stored)
    setDirty(false)
    setSaved(false)
    setError(null)
  }

  // The operator's own default, used only to seed a version that is about to
  // state terms for the first time. Never written implicitly — a version with
  // no terms of its own has to keep having none, or every historical proposal
  // would silently claim today's profile.
  const operatorDefault = useQuery({
    queryKey: ["proposal-payment-terms", "operator-default"],
    queryFn: async (): Promise<PaymentPolicy | null> => {
      const res = await fetcher(`${baseUrl}/v1/admin/settings/operator-payment-defaults`)
      if (!res.ok) return null
      const body = (await res.json()) as { data?: { customerPaymentPolicy?: unknown } }
      return normalizePaymentPolicy(body.data?.customerPaymentPolicy)
    },
    staleTime: 5 * 60 * 1000,
  })

  if (!version) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-semibold text-sm">{t.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-4 text-center text-muted-foreground text-sm">{t.noVersion}</p>
        </CardContent>
      </Card>
    )
  }

  const editable = version.status === "draft"

  async function handleSave() {
    if (!version) return
    setError(null)
    try {
      await onSave({ id: version.id, paymentTerms: draft })
      setDirty(false)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.saveFailed)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-semibold text-sm">{t.title}</CardTitle>
        <p className="text-muted-foreground text-sm">
          {editable ? t.description : t.lockedAfterSend}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <PaymentPolicyForm
          value={draft}
          onChange={(next) => {
            // Leaving "inherit" with nothing configured yet starts from what
            // the operator already does, which is nearly always the right
            // opening position for a negotiation.
            setDraft(next && !stored ? (operatorDefault.data ?? next) : next)
            setDirty(true)
            setSaved(false)
          }}
          inheritable
          currency={version.currency}
          disabled={!editable || isSaving}
        />
        <PaymentPolicyPreview
          policy={draft}
          currency={version.currency}
          sampleTotalCents={version.totalAmountCents}
        />
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
        {editable ? (
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={() => void handleSave()} disabled={!dirty || isSaving}>
              {isSaving ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />
              ) : null}
              {t.save}
            </Button>
            {saved ? <span className="text-muted-foreground text-xs">{t.saved}</span> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
