import { z } from "zod/v4"

export const OCCUPANCY_PRICING_SEMANTICS_VERSION = 1 as const

export const occupancyPriceBasisSchema = z.enum(["supplement", "all_in"])

export type OccupancyPriceBasis = z.infer<typeof occupancyPriceBasisSchema>

export interface ResolveOccupancyPriceInput {
  occupancyPriceBasis: OccupancyPriceBasis | null
  travelerBaseFareAmountCents: number
  travelerCount: number
  occupancyAmountCents: number
}

export type ClassifyOccupancyPriceInput = Omit<ResolveOccupancyPriceInput, "travelerCount">

export type ClassifiedOccupancyPrice = {
  status: "classified"
  semanticsVersion: typeof OCCUPANCY_PRICING_SEMANTICS_VERSION
  occupancyPriceBasis: OccupancyPriceBasis
  source: "explicit" | "inferred"
}

export type ResolvedOccupancyPrice = {
  status: "priced"
  semanticsVersion: typeof OCCUPANCY_PRICING_SEMANTICS_VERSION
  totalAmountCents: number
}

export type AmbiguousOccupancyPrice = {
  status: "ambiguous"
  semanticsVersion: typeof OCCUPANCY_PRICING_SEMANTICS_VERSION
  diagnostic: string
}

export const AMBIGUOUS_OCCUPANCY_PRICE_DIAGNOSTIC =
  "Declare occupancyPriceBasis as 'supplement' when the occupancy amount is added to traveler base fares, or 'all_in' when it already includes them."

export function classifyOccupancyPrice(
  input: ClassifyOccupancyPriceInput,
): ClassifiedOccupancyPrice | AmbiguousOccupancyPrice {
  if (input.occupancyPriceBasis !== null) {
    return {
      status: "classified",
      semanticsVersion: OCCUPANCY_PRICING_SEMANTICS_VERSION,
      occupancyPriceBasis: input.occupancyPriceBasis,
      source: "explicit",
    }
  }
  if (input.travelerBaseFareAmountCents <= 0) {
    return {
      status: "classified",
      semanticsVersion: OCCUPANCY_PRICING_SEMANTICS_VERSION,
      occupancyPriceBasis: "all_in",
      source: "inferred",
    }
  }
  if (input.occupancyAmountCents <= 0) {
    return {
      status: "classified",
      semanticsVersion: OCCUPANCY_PRICING_SEMANTICS_VERSION,
      occupancyPriceBasis: "supplement",
      source: "inferred",
    }
  }
  return {
    status: "ambiguous",
    semanticsVersion: OCCUPANCY_PRICING_SEMANTICS_VERSION,
    diagnostic: AMBIGUOUS_OCCUPANCY_PRICE_DIAGNOSTIC,
  }
}

export function resolveOccupancyPrice(
  input: ResolveOccupancyPriceInput,
): ResolvedOccupancyPrice | AmbiguousOccupancyPrice {
  const classification = classifyOccupancyPrice(input)
  if (classification.status === "ambiguous") return classification
  const travelerBaseTotal = input.travelerBaseFareAmountCents * input.travelerCount
  return {
    status: "priced",
    semanticsVersion: OCCUPANCY_PRICING_SEMANTICS_VERSION,
    totalAmountCents:
      classification.occupancyPriceBasis === "all_in"
        ? input.occupancyAmountCents
        : travelerBaseTotal + input.occupancyAmountCents,
  }
}
