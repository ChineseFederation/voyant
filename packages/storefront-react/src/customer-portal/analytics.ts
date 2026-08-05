"use client"

import { useVoyantAnalytics } from "@voyant-travel/react"
import { useCallback, useEffect, useMemo, useRef } from "react"

/**
 * Customer-portal analytics.
 *
 * Two of the three are automatic, because the portal's reads are the visits:
 * loading the bookings list *is* the start of a portal session, and loading a
 * booking *is* viewing it. The third is not, because the package ships no
 * download action — a document is a `fileUrl` the host renders as a link — so
 * `documentDownloaded` is a callback the host attaches to it.
 *
 * `portal.payment.made` and `portal.support.contacted`, which the analytics
 * brief also asks for, are not here: the portal serves profile, companions,
 * documents and bookings, and has no payment leg or support-contact leg to
 * emit them from. They are undeclared rather than stubbed — an event with no
 * emitter is a line in a dashboard that silently reads zero forever.
 */

export interface CustomerPortalAnalytics {
  /** The visitor's document was downloaded. `type` is the document kind, never its file name. */
  documentDownloaded(input: { documentType: string }): void
}

export function useCustomerPortalAnalytics(): CustomerPortalAnalytics {
  const analytics = useVoyantAnalytics()

  const documentDownloaded = useCallback<CustomerPortalAnalytics["documentDownloaded"]>(
    ({ documentType }) => {
      analytics.track("portal.document.downloaded", { document_type: documentType })
    },
    [analytics],
  )

  return useMemo(() => ({ documentDownloaded }), [documentDownloaded])
}

/**
 * `portal.session.started`, once, when the portal's bookings first resolve.
 *
 * Keyed on the arrival of data rather than on mount: a mount that never
 * resolves is a visitor who saw a spinner, and counting it as a session start
 * would make every load failure look like a healthy visit.
 */
export function useCustomerPortalSessionAnalytics(bookingCount: number | undefined): void {
  const analytics = useVoyantAnalytics()
  const reported = useRef(false)

  useEffect(() => {
    if (bookingCount === undefined || reported.current) return
    reported.current = true
    analytics.track("portal.session.started", { booking_count: bookingCount })
  }, [analytics, bookingCount])
}

/** `portal.booking.viewed`, once per booking the visitor opens. */
export function useCustomerPortalBookingAnalytics(bookingId: string | null | undefined): void {
  const analytics = useVoyantAnalytics()
  const reported = useRef<string | null>(null)

  useEffect(() => {
    if (!bookingId || reported.current === bookingId) return
    reported.current = bookingId
    analytics.track("portal.booking.viewed", { booking_id: bookingId })
  }, [analytics, bookingId])
}
