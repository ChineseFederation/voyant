/** Canonical semantic destination owned by the Inquiry admin surface. */
export const INQUIRY_DETAIL_DESTINATION = "inquiry.detail" as const

/** Build the serializable destination template from the selected admin mount. */
export function inquiryDetailPathTemplate(inquiriesBasePath: string): string {
  const basePath = `/${inquiriesBasePath}`.replace(/\/{2,}/g, "/").replace(/\/$/, "")
  return `${basePath}/{inquiryId}`
}
