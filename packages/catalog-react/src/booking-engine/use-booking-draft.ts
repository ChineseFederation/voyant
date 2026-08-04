"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  type BookingSelectionV1,
  bookingSelectionV1,
} from "@voyant-travel/catalog-contracts/booking-engine/contracts"
import { z } from "zod"

import { type BookingJourneyApiOptions, useBookingJourneyApi } from "./use-booking-journey-api.js"

const draftRowSchema = z.object({
  id: z.string(),
  entity_module: z.string(),
  entity_id: z.string(),
  source_kind: z.string(),
  source_connection_id: z.string().nullable().optional(),
  source_ref: z.string().nullable().optional(),
  draft_payload: z.unknown(),
  current_step: z.string().nullable().optional(),
  current_quote_id: z.string().nullable().optional(),
  hold_expires_at: z.string().nullable().optional(),
  consumed_booking_id: z.string().nullable().optional(),
  consumed_at: z.string().nullable().optional(),
  expires_at: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
})

type DraftRow = z.infer<typeof draftRowSchema>

export interface UseBookingDraftOptions extends BookingJourneyApiOptions {
  /** Stable draft id — caller generates and persists in URL or
   *  sessionStorage. */
  draftId: string
  /** Initial entity pointer, required on first PUT. */
  initialDraft?: BookingSelectionV1
  /** Disable the GET — useful when the draft was just minted client-side. */
  enableLoad?: boolean
}

/**
 * Server-synced booking draft state. Calls GET on mount (when
 * `enableLoad`) and exposes a `save(draft)` mutation that PUTs
 * to `/catalog/drafts/:id`.
 *
 * The mutation is fire-and-forget from the wizard's perspective —
 * the journey root holds the local draft as the source of truth and
 * the server copy is a recovery surface. Per
 * booking-journey-architecture §5.7.
 */
export function useBookingDraft(options: UseBookingDraftOptions) {
  const api = useBookingJourneyApi(options)
  const queryClient = useQueryClient()
  const queryKey = ["booking-draft", options.surface ?? "admin", options.draftId] as const

  const query = useQuery<DraftRow | null>({
    queryKey,
    queryFn: async () => {
      try {
        return await api.request("GET", `/drafts/${options.draftId}`, draftRowSchema)
      } catch (err) {
        if (err instanceof Error && err.message.includes("404")) return null
        throw err
      }
    },
    enabled: options.enableLoad !== false,
  })

  const save = useMutation<
    DraftRow,
    Error,
    {
      draft: BookingSelectionV1
      currentStep?: string
      currentQuoteId?: string
    }
  >({
    mutationFn: async ({ draft, currentStep, currentQuoteId }) => {
      bookingSelectionV1.parse(draft)
      const body: Record<string, unknown> = {
        entityModule: draft.entity.module,
        entityId: draft.entity.id,
        draftPayload: draft as Record<string, unknown>,
        currentStep,
        currentQuoteId,
      }
      // Only send the source pointer fields when present. They're optional but
      // non-empty when set (`z.string().min(1).optional()`); an empty string —
      // which is what a server-resolved-provenance draft carries — would fail
      // validation. Mirrors the quote hook's guarding.
      if (draft.entity.sourceKind) body.sourceKind = draft.entity.sourceKind
      if (draft.entity.sourceConnectionId) body.sourceConnectionId = draft.entity.sourceConnectionId
      if (draft.entity.sourceRef) body.sourceRef = draft.entity.sourceRef
      return api.request("PUT", `/drafts/${options.draftId}`, draftRowSchema, body)
    },
    onSuccess(row) {
      queryClient.setQueryData(queryKey, row)
    },
  })

  const remove = useMutation<void, Error, void>({
    mutationFn: async () => {
      await api.request("DELETE", `/drafts/${options.draftId}`, z.undefined())
    },
    onSuccess() {
      queryClient.setQueryData(queryKey, null)
    },
  })

  return {
    /** Server-side draft row, or null when missing / 404. */
    serverDraft: query.data ?? null,
    isLoading: query.isLoading,
    save,
    remove,
    refetch: query.refetch,
  }
}
