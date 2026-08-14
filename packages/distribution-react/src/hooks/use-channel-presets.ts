"use client"

import { useQuery } from "@tanstack/react-query"

import { useVoyantDistributionContext } from "../provider.js"
import { getChannelPresetsQueryOptions } from "../query-options.js"

export interface UseChannelPresetsOptions {
  enabled?: boolean
}

/**
 * Networks and partner types a channel can be created from. A catalog, not a
 * list of channels — nothing exists until the operator picks one.
 */
export function useChannelPresets(options: UseChannelPresetsOptions = {}) {
  const client = useVoyantDistributionContext()
  const { enabled = true } = options
  return useQuery({ ...getChannelPresetsQueryOptions(client), enabled })
}
