"use client"

import { useAdminHref, useAdminNavigate } from "@voyant-travel/admin"
import { useState } from "react"
import { InquiryQueue, type InquiryQueueFilters } from "../components/inquiry-queue.js"
import { useInquiries } from "../hooks/use-inquiries.js"

export function InquiryQueueHost() {
  const navigate = useAdminNavigate()
  const href = useAdminHref()
  const [filters, setFilters] = useState<InquiryQueueFilters>({ view: "actionable" })
  const [offset, setOffset] = useState(0)
  const limit = 50
  const query = useInquiries({ ...filters, limit, offset })
  return (
    <InquiryQueue
      inquiries={query.data?.data ?? []}
      filters={filters}
      onFiltersChange={(next) => {
        setFilters(next)
        setOffset(0)
      }}
      onInquiryOpen={(inquiry) => navigate("inquiry.detail", { inquiryId: inquiry.id })}
      getInquiryHref={(inquiry) => href("inquiry.detail", { inquiryId: inquiry.id })}
      total={query.data?.total ?? 0}
      limit={query.data?.limit ?? limit}
      offset={query.data?.offset ?? offset}
      onPageChange={setOffset}
      isPending={query.isPending}
      error={query.error}
    />
  )
}
