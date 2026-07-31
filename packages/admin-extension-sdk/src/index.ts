/**
 * @voyant-travel/admin-extension-sdk — the versioned contract and author
 * client for admin UI extensions.
 *
 * Exports:
 * - `ADMIN_UI_EXTENSION_API_VERSION`: the semver the host implements.
 * - Value types shared across the host/cloud/author boundary.
 * - The `postMessage` protocol: message types, creators, and type guards.
 * - `initUiExtension`: the author client that runs inside the extension frame.
 *
 * This package is intentionally tiny and dependency-free so it can be bundled
 * into any extension without pulling framework internals.
 */

export type {
  InitUiExtensionOptions,
  UiExtensionActions,
  UiExtensionHandle,
} from "./client.js"
export { initUiExtension, UI_EXTENSION_HANDSHAKE_TIMEOUT_MS } from "./client.js"
export { isUiExtensionCompatible } from "./compat.js"
export {
  capUiExtensionToastMessage,
  clampUiExtensionHeight,
  createContextMessage,
  createErrorMessage,
  createInitMessage,
  createNavigateMessage,
  createReadyMessage,
  createRequestTokenMessage,
  createResizeMessage,
  createToastMessage,
  createTokenMessage,
  isContextMessage,
  isErrorMessage,
  isInitMessage,
  isNavigateMessage,
  isReadyMessage,
  isRequestTokenMessage,
  isResizeMessage,
  isToastMessage,
  isTokenMessage,
  isUiExtensionEnvelope,
  UI_EXTENSION_MAX_HEIGHT,
  UI_EXTENSION_MIN_HEIGHT,
  UI_EXTENSION_PROTOCOL_VERSION,
  UI_EXTENSION_TOAST_MAX_LENGTH,
  type UiExtensionContextMessage,
  type UiExtensionEnvelope,
  type UiExtensionErrorMessage,
  type UiExtensionInboundMessage,
  type UiExtensionInitMessage,
  type UiExtensionMessage,
  type UiExtensionMessageType,
  type UiExtensionNavigateMessage,
  type UiExtensionOutboundMessage,
  type UiExtensionReadyMessage,
  type UiExtensionRequestTokenMessage,
  type UiExtensionResizeMessage,
  type UiExtensionToastMessage,
  type UiExtensionTokenMessage,
  uiExtensionMessageTypes,
} from "./protocol.js"
export type {
  AdminUiExtensionSlot,
  UiExtensionContext,
  UiExtensionDescriptor,
  UiExtensionEntity,
  UiExtensionOrg,
  UiExtensionTextDirection,
  UiExtensionTheme,
  UiExtensionToastIntent,
  UiExtensionViewer,
} from "./types.js"
export { ADMIN_UI_EXTENSION_SLOTS } from "./types.js"
export { ADMIN_UI_EXTENSION_API_VERSION } from "./version.js"
