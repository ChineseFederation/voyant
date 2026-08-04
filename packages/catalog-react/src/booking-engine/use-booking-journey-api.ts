"use client"

import type { z } from "zod"
import {
  type FetchWithValidationOptions,
  fetchWithValidation,
  type VoyantFetcher,
} from "../client.js"
import { useVoyantCatalogContext } from "../provider.js"

/** The anonymous-Session secret header the public Session routes read. */
export const BOOKING_SESSION_CAPABILITY_HEADER = "Voyant-Booking-Session-Capability"

export type BookingJourneyMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE"

export interface BookingJourneyApiOptions {
  /**
   * Surface to call against. Operator passes `"admin"`; storefront /
   * partner / embedded surfaces pass `"public"`. Switches the base
   * path between `/v1/admin/catalog` and `/v1/public/catalog`.
   */
  surface?: "admin" | "public"
  /** Override the API base URL pulled from VoyantCatalogProvider. */
  baseUrl?: string
  /** Override the fetcher pulled from VoyantCatalogProvider. */
  fetcher?: VoyantFetcher
  /**
   * Client-held anonymous Session secret. Generate it once, persist it next to
   * the Session id, and reuse it for the create retry and every later mutation
   * — it is the only thing that lets an anonymous caller back into its own
   * Session. Ignored on `admin`, which is cookie-authenticated.
   */
  capability?: string
}

export interface UseBookingJourneyApi {
  /** Resolved base URL for catalog booking-engine endpoints. */
  apiBase: string
  fetcher: VoyantFetcher
  surface: "admin" | "public"
  /** Method wrappers with Zod-validated responses. */
  request<TOut>(
    method: BookingJourneyMethod,
    path: string,
    schema: z.ZodType<TOut>,
    body?: unknown,
  ): Promise<TOut>
}

export interface BookingJourneyApiConfig extends BookingJourneyApiOptions {
  baseUrl: string
  fetcher: VoyantFetcher
}

/**
 * Non-hook transport factory.
 *
 * The Session journey also runs from plain async code — a submit handler that
 * has to survive a lost Commit response cannot live inside a render — so the
 * transport is a function first and a hook second. `useBookingJourneyApi` is
 * the same object with the provider's base URL and fetcher filled in.
 */
export function createBookingJourneyApi(config: BookingJourneyApiConfig): UseBookingJourneyApi {
  const surface = config.surface ?? "admin"
  const prefix = `/v1/${surface}/catalog`
  const fetchOptions: FetchWithValidationOptions = {
    baseUrl: config.baseUrl,
    fetcher: config.fetcher,
  }
  const capability = surface === "public" ? config.capability?.trim() : undefined

  return {
    apiBase: `${stripTrailingSlash(config.baseUrl)}${prefix}`,
    fetcher: config.fetcher,
    surface,
    async request<TOut>(
      method: BookingJourneyMethod,
      path: string,
      schema: z.ZodType<TOut>,
      body?: unknown,
    ): Promise<TOut> {
      const init: RequestInit = { method, credentials: "include" }
      if (body !== undefined) init.body = JSON.stringify(body)
      if (capability) init.headers = { [BOOKING_SESSION_CAPABILITY_HEADER]: capability }
      return fetchWithValidation<TOut>(`${prefix}${path}`, schema, fetchOptions, init)
    },
  }
}

export function useBookingJourneyApi(options: BookingJourneyApiOptions = {}): UseBookingJourneyApi {
  const ctx = useVoyantCatalogContext()
  return createBookingJourneyApi({
    ...options,
    baseUrl: options.baseUrl ?? ctx.baseUrl,
    fetcher: options.fetcher ?? ctx.fetcher,
  })
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url
}
