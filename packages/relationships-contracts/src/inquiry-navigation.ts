/** Canonical semantic destination owned by the Inquiry admin surface. */
export const INQUIRY_DETAIL_DESTINATION = "inquiry.detail" as const

/** Canonical operator mount used by notifications and the selected admin extension. */
export const INQUIRIES_ADMIN_PATH = "/inquiries" as const

export function inquiryDetailAdminPath(inquiryId: string): string {
  return `${INQUIRIES_ADMIN_PATH}/${encodeURIComponent(inquiryId)}`
}
