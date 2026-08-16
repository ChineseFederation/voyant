"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import {
  bootstrapCustomerPortal,
  createCustomerPortalCompanion,
  deleteCustomerPortalCompanion,
  importCustomerPortalBookingTravelers,
  updateCustomerPortalCompanion,
  updateCustomerPortalProfile,
} from "../operations.js"
import { useVoyantCustomerPortalContext } from "../provider.js"
import { customerPortalQueryKeys } from "../query-keys.js"
import type {
  BootstrapCustomerPortalInput,
  CreateCustomerPortalCompanionInput,
  ImportCustomerPortalBookingTravelersInput,
  UpdateCustomerPortalCompanionInput,
  UpdateCustomerPortalProfileInput,
} from "../schemas.js"

export interface UpdateCustomerPortalCompanionMutationInput {
  companionId: string
  input: UpdateCustomerPortalCompanionInput
}

export interface DeleteCustomerPortalCompanionMutationInput {
  companionId: string
}

export function useCustomerPortalMutation() {
  const { baseUrl, fetcher } = useVoyantCustomerPortalContext()
  const queryClient = useQueryClient()
  const client = { baseUrl, fetcher }

  const refreshPortalState = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: customerPortalQueryKeys.profile() }),
      queryClient.invalidateQueries({ queryKey: customerPortalQueryKeys.companions() }),
      queryClient.invalidateQueries({ queryKey: customerPortalQueryKeys.bookings() }),
    ])
  }

  const bootstrap = useMutation({
    mutationFn: async (input: BootstrapCustomerPortalInput) =>
      bootstrapCustomerPortal(client, input),
    onSuccess: async () => {
      await refreshPortalState()
    },
  })

  const updateProfile = useMutation({
    mutationFn: async (input: UpdateCustomerPortalProfileInput) =>
      updateCustomerPortalProfile(client, input),
    onSuccess: async () => {
      await refreshPortalState()
    },
  })

  const createCompanion = useMutation({
    mutationFn: async (input: CreateCustomerPortalCompanionInput) =>
      createCustomerPortalCompanion(client, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: customerPortalQueryKeys.companions() })
    },
  })

  const importBookingTravelers = useMutation({
    mutationFn: async (input: ImportCustomerPortalBookingTravelersInput = {}) =>
      importCustomerPortalBookingTravelers(client, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: customerPortalQueryKeys.companions() })
    },
  })

  const updateCompanion = useMutation({
    mutationFn: async ({ companionId, input }: UpdateCustomerPortalCompanionMutationInput) =>
      updateCustomerPortalCompanion(client, companionId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: customerPortalQueryKeys.companions() })
    },
  })

  const removeCompanion = useMutation({
    mutationFn: async ({ companionId }: DeleteCustomerPortalCompanionMutationInput) =>
      deleteCustomerPortalCompanion(client, companionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: customerPortalQueryKeys.companions() })
    },
  })

  return {
    bootstrap,
    updateProfile,
    createCompanion,
    importBookingTravelers,
    importBookingParticipants: importBookingTravelers,
    updateCompanion,
    removeCompanion,
  }
}
