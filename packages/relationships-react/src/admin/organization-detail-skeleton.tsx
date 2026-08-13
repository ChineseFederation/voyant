"use client"

import { Card, CardContent, CardHeader } from "@voyant-travel/ui/components/card"
import { Skeleton } from "@voyant-travel/ui/components/skeleton"

/**
 * Layout-matched placeholder for OrganizationDetailPage. Mirrors the real page
 * class-for-class so nothing shifts when the data lands:
 *   - header: avatar + name/badges + actions (no breadcrumb — the chrome owns it)
 *   - grid-cols-[minmax(0,1fr)_320px]:
 *       - main: tab strip + panel card
 *       - sidebar: About field list + Tags
 */
export function OrganizationDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex flex-col gap-1">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Main */}
        <main className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-wrap items-center gap-1">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-8 w-28" />
          </div>
          <Card>
            <CardContent className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: stable placeholder -- owner: relationships-react; existing suppression is intentional pending typed cleanup.
                <div key={i} className="flex items-center gap-3 py-1.5">
                  <Skeleton className="size-9 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </main>

        {/* Sidebar */}
        <aside className="flex flex-col gap-6">
          <Card>
            <CardHeader className="pb-3">
              <Skeleton className="h-4 w-20" />
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: stable placeholder -- owner: relationships-react; existing suppression is intentional pending typed cleanup.
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="mt-0.5 h-4 w-4" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-4 w-4/5" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <Skeleton className="h-4 w-16" />
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}
