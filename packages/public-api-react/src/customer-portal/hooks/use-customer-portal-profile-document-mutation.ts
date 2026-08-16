"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import {
  createCustomerPortalProfileDocument,
  deleteCustomerPortalProfileDocument,
  setPrimaryCustomerPortalProfileDocument,
  updateCustomerPortalProfileDocument,
} from "../operations.js"
import { useVoyantCustomerPortalContext } from "../provider.js"
import { customerPortalQueryKeys } from "../query-keys.js"
import type {
  CreateCustomerPortalProfileDocumentInput,
  UpdateCustomerPortalProfileDocumentInput,
} from "../schemas.js"

export interface UpdateCustomerPortalProfileDocumentMutationInput {
  documentId: string
  input: UpdateCustomerPortalProfileDocumentInput
}

export function useCustomerPortalProfileDocumentMutation() {
  const { baseUrl, fetcher } = useVoyantCustomerPortalContext()
  const queryClient = useQueryClient()
  const client = { baseUrl, fetcher }

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: customerPortalQueryKeys.profileDocuments() })

  const create = useMutation({
    mutationFn: async (input: CreateCustomerPortalProfileDocumentInput) =>
      createCustomerPortalProfileDocument(client, input),
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: async ({ documentId, input }: UpdateCustomerPortalProfileDocumentMutationInput) =>
      updateCustomerPortalProfileDocument(client, documentId, input),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: async (documentId: string) =>
      deleteCustomerPortalProfileDocument(client, documentId),
    onSuccess: invalidate,
  })

  const setPrimary = useMutation({
    mutationFn: async (documentId: string) =>
      setPrimaryCustomerPortalProfileDocument(client, documentId),
    onSuccess: invalidate,
  })

  return { create, update, remove, setPrimary }
}
