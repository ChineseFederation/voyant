"use client"

import { useAdminNavigate } from "@voyant-travel/admin"
import { useState } from "react"
import { InquiryQueue, type InquiryQueueFilters } from "../components/inquiry-queue.js"
import { useInquiries } from "../hooks/use-inquiries.js"

export function InquiryQueueHost() {
  const navigate = useAdminNavigate()
  const [filters, setFilters] = useState<InquiryQueueFilters>({})
  const query = useInquiries({ ...filters, limit: 50, sortBy: "nextActionAt", sortDir: "asc" })
  return (
    <InquiryQueue
      inquiries={query.data?.data ?? []}
      filters={filters}
      onFiltersChange={setFilters}
      onInquiryOpen={(inquiry) => navigate("inquiry.detail", { inquiryId: inquiry.id })}
      isPending={query.isPending}
      error={query.error}
    />
  )
}
