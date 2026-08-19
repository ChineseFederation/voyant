/** Maximum time the managed renderer may spend loading a Legal document. */
export const LEGAL_DOCUMENT_RENDER_TIMEOUT_MS = 30_000

/**
 * EventBus budget for booking-confirmed contract generation.
 *
 * Rendering is only one part of the handler: admission, artifact storage and
 * contract promotion also need time. Keep this finite, but strictly above the
 * renderer's own bound so successful renders are not detached and retried.
 */
export const LEGAL_BOOKING_CONFIRMED_SUBSCRIBER_TIMEOUT_MS = 45_000
