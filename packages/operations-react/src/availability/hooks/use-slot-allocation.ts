"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { allocationConstraintViolationSchema } from "../allocation-schemas.js"
import { fetchWithValidation } from "../client.js"
import { useVoyantAvailabilityContext } from "../provider.js"
import { availabilityQueryKeys } from "../query-keys.js"
import {
  getProductResourceTemplatesQueryOptions,
  getSlotAllocationAuditLogQueryOptions,
  getSlotAllocationQueryOptions,
} from "../query-options.js"
import {
  allocationAutomationResponse,
  allocationResourceSchema,
  type CreateAllocationResourceInput,
  resourceTemplateSchema,
  sharingGroupLabelSchema,
  singleEnvelope,
  type UpdateAllocationResourceInput,
  type UpsertResourceTemplateInput,
} from "../schemas.js"

const assignTravelerAllocationResponse = singleEnvelope(
  z.object({
    travelerId: z.string(),
    kind: z.string(),
    resourceId: z.string().nullable(),
    /**
     * Every room constraint the accepted assignment breached. Blocking ones
     * only appear here when the caller supplied an `override.reason`; without
     * one the server answers 409 and this hook rejects.
     */
    violations: z.array(allocationConstraintViolationSchema).default([]),
  }),
)

const travelerRoomingPreferencesResponse = singleEnvelope(
  z.object({
    travelerId: z.string(),
    bedPreference: z.string().nullable(),
    roomTypeId: z.string().nullable(),
  }),
)

const updateTravelerSharingGroupResponse = singleEnvelope(
  z.object({
    travelerId: z.string(),
    sharingGroupId: z.string().nullable(),
  }),
)

const pairSharingGroupResponse = singleEnvelope(
  z.object({
    sharingGroupId: z.string(),
    travelerIds: z.array(z.string()),
  }),
)

const productAvailabilityPath = (productId: string) =>
  `/v1/admin/operations/availability/products/${productId}`

const slotAvailabilityPath = (slotId: string) => `/v1/admin/operations/availability/slots/${slotId}`

export interface UseSlotAllocationOptions {
  slotId: string | null | undefined
  enabled?: boolean
}

export function useSlotAllocation({ slotId, enabled = true }: UseSlotAllocationOptions) {
  const client = useVoyantAvailabilityContext()
  return useQuery({
    ...getSlotAllocationQueryOptions(client, slotId),
    enabled: enabled && Boolean(slotId),
  })
}

export function useSlotAllocationAuditLog({ slotId, enabled = true }: UseSlotAllocationOptions) {
  const client = useVoyantAvailabilityContext()
  return useQuery({
    ...getSlotAllocationAuditLogQueryOptions(client, slotId),
    enabled: enabled && Boolean(slotId),
  })
}

export function useProductResourceTemplates({
  productId,
  enabled = true,
}: {
  productId: string | null | undefined
  enabled?: boolean
}) {
  const client = useVoyantAvailabilityContext()
  return useQuery({
    ...getProductResourceTemplatesQueryOptions(client, productId),
    enabled: enabled && Boolean(productId),
  })
}

export function useAllocationResourceMutation(slotId: string) {
  const { baseUrl, fetcher } = useVoyantAvailabilityContext()
  const queryClient = useQueryClient()
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: availabilityQueryKeys.slotAllocation(slotId) })
    await queryClient.invalidateQueries({
      queryKey: availabilityQueryKeys.slotAllocationAuditLog(slotId),
    })
  }

  const create = useMutation({
    mutationFn: async (input: CreateAllocationResourceInput) => {
      const { data } = await fetchWithValidation(
        `${slotAvailabilityPath(slotId)}/allocation/resources`,
        singleEnvelope(allocationResourceSchema),
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: async ({
      resourceId,
      input,
    }: {
      resourceId: string
      input: UpdateAllocationResourceInput
    }) => {
      const { data } = await fetchWithValidation(
        `${slotAvailabilityPath(slotId)}/allocation/resources/${resourceId}`,
        singleEnvelope(allocationResourceSchema),
        { baseUrl, fetcher },
        { method: "PATCH", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: async (resourceId: string) =>
      fetchWithValidation(
        `${slotAvailabilityPath(slotId)}/allocation/resources/${resourceId}`,
        singleEnvelope(allocationResourceSchema.pick({ id: true })),
        { baseUrl, fetcher },
        { method: "DELETE" },
      ),
    onSuccess: invalidate,
  })

  return { create, update, remove }
}

export function useResourceTemplateMutation(productId: string) {
  const { baseUrl, fetcher } = useVoyantAvailabilityContext()
  const queryClient = useQueryClient()
  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: availabilityQueryKeys.productResourceTemplates(productId),
    })
  }

  const upsert = useMutation({
    mutationFn: async ({
      optionId,
      kind,
      input,
    }: {
      optionId: string
      kind: string
      input: UpsertResourceTemplateInput
    }) => {
      const { data } = await fetchWithValidation(
        `${productAvailabilityPath(productId)}/options/${optionId}/allocation/resource-templates/${kind}`,
        singleEnvelope(resourceTemplateSchema),
        { baseUrl, fetcher },
        { method: "PUT", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    // refId targets a single template when an option holds several of the same
    // kind (e.g. one "room" per option_unit); omit it for ref-less templates.
    mutationFn: async ({
      optionId,
      kind,
      refId,
    }: {
      optionId: string
      kind: string
      refId?: string | null
    }) =>
      fetchWithValidation(
        `${productAvailabilityPath(productId)}/options/${optionId}/allocation/resource-templates/${kind}${
          refId ? `?refId=${encodeURIComponent(refId)}` : ""
        }`,
        singleEnvelope(z.object({ productOptionId: z.string(), kind: z.string() })),
        { baseUrl, fetcher },
        { method: "DELETE" },
      ),
    onSuccess: invalidate,
  })

  return { upsert, remove }
}

/**
 * Back-fill resources across a product's open future departures from the
 * option's templates (idempotent — slots that already have a kind are skipped).
 * Lets an operator apply newly-configured departure inventory to slots that
 * already exist, not just future ones.
 */
export function useMaterializeOpenSlotsMutation(productId: string) {
  const { baseUrl, fetcher } = useVoyantAvailabilityContext()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { optionId?: string }) => {
      const result = await fetchWithValidation(
        `${productAvailabilityPath(productId)}/allocation/materialize-open-slots`,
        singleEnvelope(z.object({ slots: z.number(), created: z.number() })),
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify(input) },
      )
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: availabilityQueryKeys.slots() })
    },
  })
}

export function useAllocationAutomationMutation(slotId: string) {
  const { baseUrl, fetcher } = useVoyantAvailabilityContext()
  const queryClient = useQueryClient()
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: availabilityQueryKeys.slotAllocation(slotId) })
    await queryClient.invalidateQueries({
      queryKey: availabilityQueryKeys.slotAllocationAuditLog(slotId),
    })
  }

  const autoMaterialize = useMutation({
    mutationFn: async (input: { kind?: string }) => {
      const result = await fetchWithValidation(
        `${slotAvailabilityPath(slotId)}/allocation/auto-materialize`,
        allocationAutomationResponse,
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify(input) },
      )
      return result.data
    },
    onSuccess: invalidate,
  })

  const autoAllocate = useMutation({
    mutationFn: async (input: { kind?: string }) => {
      const result = await fetchWithValidation(
        `${slotAvailabilityPath(slotId)}/allocation/auto-allocate`,
        allocationAutomationResponse,
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify(input) },
      )
      return result.data
    },
    onSuccess: invalidate,
  })

  // Materialize the slot's full configured inventory (all kinds, from template
  // default_count) in one call — distinct from the pax-derived autoMaterialize.
  const materializeTemplates = useMutation({
    mutationFn: async () => {
      const result = await fetchWithValidation(
        `${slotAvailabilityPath(slotId)}/allocation/materialize-templates`,
        singleEnvelope(z.object({ created: z.number() })),
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify({}) },
      )
      return result.data
    },
    onSuccess: invalidate,
  })

  return { autoMaterialize, autoAllocate, materializeTemplates }
}

export function useAssignTravelerAllocationMutation(slotId: string) {
  const { baseUrl, fetcher } = useVoyantAvailabilityContext()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: {
      travelerId: string
      kind: string
      resourceId: string | null
      /**
       * Deliberate waiver of a blocking room constraint. The reason is written
       * into the departure's audit trail alongside the rules it waived, so an
       * override is answerable six months later.
       */
      override?: { reason: string }
    }) =>
      fetchWithValidation(
        `${slotAvailabilityPath(slotId)}/allocation/travelers/${input.travelerId}`,
        assignTravelerAllocationResponse,
        { baseUrl, fetcher },
        {
          method: "PATCH",
          body: JSON.stringify({
            kind: input.kind,
            resourceId: input.resourceId,
            ...(input.override ? { override: input.override } : {}),
          }),
        },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: availabilityQueryKeys.slotAllocation(slotId),
      })
      await queryClient.invalidateQueries({
        queryKey: availabilityQueryKeys.slotAllocationAuditLog(slotId),
      })
    },
  })
}

/**
 * Write the rooming preferences the room rules check against.
 *
 * Before #4036 `bed_preference` and `room_type_id` were writable only through
 * the admin travel-details API, so the departure workspace enforced a
 * preference it gave the operator no way to enter.
 */
export function useTravelerRoomingPreferencesMutation(slotId: string) {
  const { baseUrl, fetcher } = useVoyantAvailabilityContext()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: {
      travelerId: string
      bedPreference?: string | null
      roomTypeId?: string | null
    }) =>
      fetchWithValidation(
        `${slotAvailabilityPath(slotId)}/allocation/travelers/${input.travelerId}/rooming-preferences`,
        travelerRoomingPreferencesResponse,
        { baseUrl, fetcher },
        {
          method: "PATCH",
          body: JSON.stringify({
            ...(input.bedPreference === undefined ? {} : { bedPreference: input.bedPreference }),
            ...(input.roomTypeId === undefined ? {} : { roomTypeId: input.roomTypeId }),
          }),
        },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: availabilityQueryKeys.slotAllocation(slotId),
      })
      await queryClient.invalidateQueries({
        queryKey: availabilityQueryKeys.slotAllocationAuditLog(slotId),
      })
    },
  })
}

export function useSharingGroupLabelMutation(slotId: string) {
  const { baseUrl, fetcher } = useVoyantAvailabilityContext()
  const queryClient = useQueryClient()
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: availabilityQueryKeys.slotAllocation(slotId) })
    await queryClient.invalidateQueries({
      queryKey: availabilityQueryKeys.slotAllocationAuditLog(slotId),
    })
  }

  const update = useMutation({
    mutationFn: (input: { groupId: string; label: string }) =>
      fetchWithValidation(
        `${slotAvailabilityPath(slotId)}/allocation/sharing-groups/${input.groupId}/label`,
        singleEnvelope(sharingGroupLabelSchema),
        { baseUrl, fetcher },
        { method: "PUT", body: JSON.stringify({ label: input.label }) },
      ),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: (groupId: string) =>
      fetchWithValidation(
        `${slotAvailabilityPath(slotId)}/allocation/sharing-groups/${groupId}/label`,
        singleEnvelope(sharingGroupLabelSchema),
        { baseUrl, fetcher },
        { method: "DELETE" },
      ),
    onSuccess: invalidate,
  })

  return { update, remove }
}

export function useTravelerSharingGroupMutation(slotId: string) {
  const { baseUrl, fetcher } = useVoyantAvailabilityContext()
  const queryClient = useQueryClient()
  const update = useMutation({
    mutationFn: (input: { travelerId: string; sharingGroupId: string | null }) =>
      fetchWithValidation(
        `${slotAvailabilityPath(slotId)}/allocation/travelers/${input.travelerId}/sharing-group`,
        updateTravelerSharingGroupResponse,
        { baseUrl, fetcher },
        { method: "PATCH", body: JSON.stringify({ sharingGroupId: input.sharingGroupId }) },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: availabilityQueryKeys.slotAllocation(slotId),
      })
      await queryClient.invalidateQueries({
        queryKey: availabilityQueryKeys.slotAllocationAuditLog(slotId),
      })
    },
  })

  const pair = useMutation({
    mutationFn: (input: { travelerIds: string[]; sharingGroupId?: string }) =>
      fetchWithValidation(
        `${slotAvailabilityPath(slotId)}/allocation/sharing-groups/pair`,
        pairSharingGroupResponse,
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: availabilityQueryKeys.slotAllocation(slotId),
      })
      await queryClient.invalidateQueries({
        queryKey: availabilityQueryKeys.slotAllocationAuditLog(slotId),
      })
    },
  })

  return { update, pair }
}
