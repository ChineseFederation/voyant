import type { AdminRoutePageProps } from "@voyant-travel/admin"
import { InquiryDetailHost } from "../inquiry-detail-host.js"

// fallow-ignore-next-line unused-export
export default function InquiryDetailPage({ params }: AdminRoutePageProps) {
  return <InquiryDetailHost id={params.id ?? ""} />
}
