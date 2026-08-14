/**
 * Known distribution channels, offered as a catalog rather than provisioned as
 * rows.
 *
 * A `channels` row is a commercial relationship the operator actually has — it
 * carries contracts, commission rules and settlement terms. Seeding one per
 * network would fill the counterparty list with companies they may never trade
 * with, each showing contract and rate-limit fields that mean nothing until
 * someone signs something. So nothing exists until the operator picks it; the
 * catalog only removes the typing and the guesswork about which `kind` a
 * network is.
 *
 * The system Direct channel is deliberately absent: it is provisioned by
 * migration and is not a counterparty. See `schema-core.ts`.
 */
import type { ChannelKind } from "./schema-shared.js"

/**
 * A named network is a specific counterparty, so a row created from one records
 * its `key` in `channels.preset_key` — a stable identity a connector can bind
 * to instead of matching on a display name an operator is free to rename.
 *
 * A partner type is not an identity. "Affiliate" is a shape of relationship an
 * operator may have many of, so those presets prefill `kind` and nothing else,
 * and never write a `preset_key`.
 */
export type ChannelPresetIdentity = "network" | "partner-type"

export interface ChannelPreset {
  /** Stable machine key. Persisted as `preset_key` for networks only. */
  key: string
  name: string
  kind: ChannelKind
  identity: ChannelPresetIdentity
  website?: string
  /** Why an operator would pick this one. Shown next to the name. */
  description?: string
}

export const CHANNEL_PRESETS: readonly ChannelPreset[] = [
  {
    key: "getyourguide",
    name: "GetYourGuide",
    kind: "ota",
    identity: "network",
    website: "https://www.getyourguide.com",
    description: "Tours and activities marketplace.",
  },
  {
    key: "viator",
    name: "Viator",
    kind: "ota",
    identity: "network",
    website: "https://www.viator.com",
    description:
      "Tripadvisor's tours and activities brand. Distinct from the Tripadvisor listing itself — keep both if you are contracted for both.",
  },
  {
    key: "tripadvisor",
    name: "Tripadvisor",
    kind: "ota",
    identity: "network",
    website: "https://www.tripadvisor.com",
    description: "Tripadvisor listings and bookable experiences.",
  },
  {
    key: "klook",
    name: "Klook",
    kind: "ota",
    identity: "network",
    website: "https://www.klook.com",
    description: "Asia-Pacific-led tours and activities marketplace.",
  },
  {
    key: "civitatis",
    name: "Civitatis",
    kind: "ota",
    identity: "network",
    website: "https://www.civitatis.com",
    description: "Spanish-language tours and activities marketplace.",
  },
  {
    key: "musement",
    name: "Musement",
    kind: "ota",
    identity: "network",
    website: "https://www.musement.com",
    description: "TUI-owned tours and activities marketplace.",
  },
  {
    key: "airbnb-experiences",
    name: "Airbnb Experiences",
    kind: "marketplace",
    identity: "network",
    website: "https://www.airbnb.com/experiences",
    description: "Host-led experiences listed alongside Airbnb stays.",
  },
  {
    key: "voyant-connect",
    name: "Voyant Connect",
    kind: "connect",
    identity: "network",
    description:
      "The Voyant network. Its key is what a Connect integration binds to, so create it here rather than as a channel named by hand.",
  },
  {
    key: "partner-affiliate",
    name: "Affiliate partner",
    kind: "affiliate",
    identity: "partner-type",
    description: "Someone who refers business for a commission.",
  },
  {
    key: "partner-reseller",
    name: "Reseller",
    kind: "reseller",
    identity: "partner-type",
    description: "Someone who sells your product under their own commercial terms.",
  },
  {
    key: "partner-api",
    name: "API partner",
    kind: "api_partner",
    identity: "partner-type",
    description: "A partner integrating directly against your API.",
  },
]

const PRESETS_BY_KEY = new Map(CHANNEL_PRESETS.map((preset) => [preset.key, preset]))

export function findChannelPreset(key: string): ChannelPreset | null {
  return PRESETS_BY_KEY.get(key) ?? null
}

/**
 * Whether a key may be persisted as `channels.preset_key`. Partner types are
 * rejected: they are a starting point for a form, not the identity of a
 * counterparty, and an operator may have many channels of the same shape.
 */
export function isPersistableChannelPresetKey(key: string): boolean {
  return PRESETS_BY_KEY.get(key)?.identity === "network"
}

/** The keys `channels.preset_key` accepts, in catalog order. */
export const CHANNEL_NETWORK_PRESET_KEYS = CHANNEL_PRESETS.filter(
  (preset) => preset.identity === "network",
).map((preset) => preset.key)

/**
 * Field description for `presetKey`, built from the catalog so it cannot drift
 * from what the refinement actually accepts.
 *
 * `z.toJSONSchema` drops `.refine`, so a rule expressed only there is invisible
 * to an agent calling `create_distribution_channel` — it would learn which keys
 * are valid by being rejected. Spelling them out here is what makes the rule
 * readable at call time (`verify:tool-refinement-visibility`).
 */
export const CHANNEL_PRESET_KEY_DESCRIPTION = `Catalog entry this channel is created from, recorded as a stable identity for connectors. One of: ${CHANNEL_NETWORK_PRESET_KEYS.join(", ")}. Omit it for a channel you describe yourself. Partner-type presets (${CHANNEL_PRESETS.filter(
  (preset) => preset.identity === "partner-type",
)
  .map((preset) => preset.key)
  .join(
    ", ",
  )}) are rejected: they name a shape of relationship, not a counterparty, and an operator may have many channels of each.`
