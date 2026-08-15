"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useVoyantFinanceContext } from "../provider.js"

/**
 * A published email template the deployment can send a payment link with.
 *
 * Reached over HTTP rather than through `@voyant-travel/notifications-react`
 * on purpose: the send surface is an admin endpoint, and going through it
 * keeps finance from taking a package dependency on notifications for what
 * is one POST.
 */
export interface PaymentLinkEmailTemplate {
  id: string
  slug: string
  name: string
}

interface TemplateListResponse {
  data: Array<{
    id: string
    slug: string
    name: string
    channel: string
    status: string
  }>
}

/**
 * Published email templates, offered as the "send with" choice after a
 * payment link is generated.
 *
 * Templates are deployment-authored rows — there is no slug this repo can
 * assume exists — so the caller must handle the empty list by falling back
 * to copying the link by hand.
 */
export function usePaymentLinkEmailTemplates(options: { enabled?: boolean } = {}) {
  const { baseUrl, fetcher } = useVoyantFinanceContext()

  return useQuery({
    queryKey: ["payment-link-email-templates"],
    enabled: options.enabled ?? true,
    queryFn: async (): Promise<PaymentLinkEmailTemplate[]> => {
      const response = await fetcher(
        `${baseUrl}/v1/admin/notifications/templates?channel=email&status=active&limit=100`,
        { headers: { Accept: "application/json" } },
      )
      if (!response.ok) throw new Error(`template fetch failed: ${response.status}`)
      const body = (await response.json()) as TemplateListResponse
      return (body.data ?? []).map((template) => ({
        id: template.id,
        slug: template.slug,
        name: template.name,
      }))
    },
    staleTime: 5 * 60 * 1000,
  })
}

export interface SendPaymentLinkInput {
  paymentSessionId: string
  templateId: string
}

/**
 * Email a generated payment link to the payer through the notifications
 * dispatch route.
 *
 * `idempotencyKey` is derived from the session and template rather than
 * randomised, so a double-click cannot send the customer two copies of the
 * same request for money.
 */
export function useSendPaymentLink(bookingId: string) {
  const { baseUrl, fetcher } = useVoyantFinanceContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ paymentSessionId, templateId }: SendPaymentLinkInput) => {
      const response = await fetcher(
        `${baseUrl}/v1/admin/notifications/payment-sessions/${paymentSessionId}/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotencyKey: `payment-link-${paymentSessionId}-${templateId}`,
            templateId,
          }),
        },
      )
      const json = (await response.json()) as { data?: unknown; error?: string }
      if (!response.ok) {
        throw new Error(json.error ?? `Send failed: ${response.status}`)
      }
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings", bookingId] })
    },
  })
}
