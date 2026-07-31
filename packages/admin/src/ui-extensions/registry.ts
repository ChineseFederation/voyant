/**
 * The closed v1 set of named insertion slots UI extensions may target.
 *
 * These ids already exist as widget slots on the operator admin surfaces, so a
 * UI extension is contributed through the same {@link AdminWidgetSlot}
 * mechanism as any first-party widget. Adding a slot is a MINOR change (a new
 * capability extensions can opt into); renaming or removing one is MAJOR.
 *
 * The list itself lives in `@voyant-travel/admin-extension-sdk`, which is the
 * versioned contract an extension author installs. This module adapts it to
 * the shell's widget vocabulary.
 */
import {
  type AdminUiExtensionSlot,
  ADMIN_UI_EXTENSION_SLOTS as CONTRACT_SLOTS,
} from "@voyant-travel/admin-extension-sdk/types"
import type { AdminWidgetSlot } from "../extensions.js"

/**
 * Re-exported from the contract package so the shell and the manifest schema
 * cannot drift apart. The `satisfies` keeps the host's own guarantee: every
 * contract slot must still be a usable {@link AdminWidgetSlot}.
 */
export const ADMIN_UI_EXTENSION_SLOTS = CONTRACT_SLOTS satisfies readonly AdminWidgetSlot[]

export type { AdminUiExtensionSlot }

/** Whether `slot` is one of the public UI-extension slots. */
export function isAdminUiExtensionSlot(slot: string): slot is AdminUiExtensionSlot {
  return (ADMIN_UI_EXTENSION_SLOTS as readonly string[]).includes(slot)
}
