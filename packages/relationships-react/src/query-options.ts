"use client"

import { queryOptions } from "@tanstack/react-query"

import { type FetchWithValidationOptions, fetchWithValidation } from "./client.js"
import type { UseActivitiesOptions } from "./hooks/use-activities.js"
import type { UseOrganizationsOptions } from "./hooks/use-organizations.js"
import type { UsePeopleOptions } from "./hooks/use-people.js"
import { inquiryListResponse, inquirySingleResponse } from "./inquiry-schemas.js"
import type { InquiriesListFilters } from "./query-keys.js"
import { relationshipsQueryKeys } from "./query-keys.js"
import {
  activityListResponse,
  organizationListResponse,
  organizationSingleResponse,
  personListResponse,
  personNoteListResponse,
  personSingleResponse,
} from "./schemas.js"

const basePath = "/v1/admin/relationships"

export function getInquiriesQueryOptions(
  client: FetchWithValidationOptions,
  filters: InquiriesListFilters = {},
) {
  return queryOptions({
    queryKey: relationshipsQueryKeys.inquiriesList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== "") params.set(key, String(value))
      }
      const query = params.toString()
      return fetchWithValidation(
        `${basePath}/inquiries${query ? `?${query}` : ""}`,
        inquiryListResponse,
        client,
      )
    },
  })
}

export function getInquiryQueryOptions(client: FetchWithValidationOptions, id: string) {
  return queryOptions({
    queryKey: relationshipsQueryKeys.inquiry(id),
    queryFn: async () => {
      const { data } = await fetchWithValidation(
        `${basePath}/inquiries/${id}`,
        inquirySingleResponse,
        client,
      )
      return data
    },
  })
}

export function getActivitiesQueryOptions(
  client: FetchWithValidationOptions,
  options: UseActivitiesOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options

  return queryOptions({
    queryKey: relationshipsQueryKeys.activitiesList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.search) params.set("search", filters.search)
      if (filters.ownerId) params.set("ownerId", filters.ownerId)
      if (filters.status) params.set("status", filters.status)
      if (filters.type) params.set("type", filters.type)
      if (filters.entityType) params.set("entityType", filters.entityType)
      if (filters.entityId) params.set("entityId", filters.entityId)
      if (filters.limit !== undefined) params.set("limit", String(filters.limit))
      if (filters.offset !== undefined) params.set("offset", String(filters.offset))
      const qs = params.toString()

      return fetchWithValidation(
        `${basePath}/activities${qs ? `?${qs}` : ""}`,
        activityListResponse,
        {
          baseUrl: client.baseUrl,
          fetcher: client.fetcher,
        },
      )
    },
  })
}

export function getPeopleQueryOptions(
  client: FetchWithValidationOptions,
  options: UsePeopleOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options

  return queryOptions({
    queryKey: relationshipsQueryKeys.peopleList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.search) params.set("search", filters.search)
      if (filters.organizationId) params.set("organizationId", filters.organizationId)
      if (filters.ownerId) params.set("ownerId", filters.ownerId)
      if (filters.relation) params.set("relation", filters.relation)
      if (filters.status) params.set("status", filters.status)
      if (filters.sortBy) params.set("sortBy", filters.sortBy)
      if (filters.sortDir) params.set("sortDir", filters.sortDir)
      if (filters.limit !== undefined) params.set("limit", String(filters.limit))
      if (filters.offset !== undefined) params.set("offset", String(filters.offset))
      const qs = params.toString()

      return fetchWithValidation(`${basePath}/people${qs ? `?${qs}` : ""}`, personListResponse, {
        baseUrl: client.baseUrl,
        fetcher: client.fetcher,
      })
    },
  })
}

export function getPersonQueryOptions(client: FetchWithValidationOptions, id: string) {
  return queryOptions({
    queryKey: relationshipsQueryKeys.person(id),
    queryFn: async () => {
      const { data } = await fetchWithValidation(`${basePath}/people/${id}`, personSingleResponse, {
        baseUrl: client.baseUrl,
        fetcher: client.fetcher,
      })
      return data
    },
  })
}

export function getPersonNotesQueryOptions(client: FetchWithValidationOptions, id: string) {
  return queryOptions({
    queryKey: ["person-notes", id],
    queryFn: () =>
      fetchWithValidation(`${basePath}/people/${id}/notes`, personNoteListResponse, {
        baseUrl: client.baseUrl,
        fetcher: client.fetcher,
      }),
  })
}

export function getPersonActivitiesQueryOptions(client: FetchWithValidationOptions, id: string) {
  return queryOptions({
    queryKey: ["person-activities", id],
    queryFn: () =>
      fetchWithValidation(
        `${basePath}/activities?entityType=person&entityId=${id}&limit=50`,
        activityListResponse,
        { baseUrl: client.baseUrl, fetcher: client.fetcher },
      ),
  })
}

export function getOrganizationsQueryOptions(
  client: FetchWithValidationOptions,
  options: UseOrganizationsOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options

  return queryOptions({
    queryKey: relationshipsQueryKeys.organizationsList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.search) params.set("search", filters.search)
      if (filters.taxId) params.set("taxId", filters.taxId)
      if (filters.ownerId) params.set("ownerId", filters.ownerId)
      if (filters.relation) params.set("relation", filters.relation)
      if (filters.status) params.set("status", filters.status)
      if (filters.sortBy) params.set("sortBy", filters.sortBy)
      if (filters.sortDir) params.set("sortDir", filters.sortDir)
      if (filters.limit !== undefined) params.set("limit", String(filters.limit))
      if (filters.offset !== undefined) params.set("offset", String(filters.offset))
      const qs = params.toString()

      return fetchWithValidation(
        `${basePath}/organizations${qs ? `?${qs}` : ""}`,
        organizationListResponse,
        { baseUrl: client.baseUrl, fetcher: client.fetcher },
      )
    },
  })
}

export function getOrganizationQueryOptions(client: FetchWithValidationOptions, id: string) {
  return queryOptions({
    queryKey: relationshipsQueryKeys.organization(id),
    queryFn: async () => {
      const { data } = await fetchWithValidation(
        `${basePath}/organizations/${id}`,
        organizationSingleResponse,
        { baseUrl: client.baseUrl, fetcher: client.fetcher },
      )
      return data
    },
  })
}
