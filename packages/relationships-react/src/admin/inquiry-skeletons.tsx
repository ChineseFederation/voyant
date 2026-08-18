import { Skeleton } from "@voyant-travel/ui/components/skeleton"

export function InquiryQueueSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="flex gap-2">
        {["new", "mine", "unassigned", "overdue", "waiting", "qualified"].map((view) => (
          <Skeleton key={view} className="h-8 w-20" />
        ))}
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-80 w-full" />
    </div>
  )
}

export function InquiryDetailSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-8 w-72" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-96 lg:col-span-2" />
        <Skeleton className="h-96" />
      </div>
    </div>
  )
}
