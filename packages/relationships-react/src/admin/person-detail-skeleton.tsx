"use client"

import { Card, CardContent, CardHeader } from "@voyant-travel/ui/components/card"
import { Skeleton } from "@voyant-travel/ui/components/skeleton"

/**
 * Layout-matched placeholder for PersonDetailPage.
 *   - Top bar (back button + name + edit/delete actions)
 *   - 12-col body grid:
 *       - lg:col-span-3  sidebar: avatar + identity card + details card
 *       - lg:col-span-6  main: tabs (Notes / Activities / Proposals) + editor + list
 *       - lg:col-span-3  aside: organization card + proposals summary
 */
export function PersonDetailSkeleton() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b px-4 py-3 lg:px-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>

      {/* Body */}
      <div className="grid flex-1 grid-cols-12 gap-4 p-4 lg:p-6">
        {/* Sidebar */}
        <aside className="col-span-12 flex flex-col gap-4 lg:col-span-3">
          <Card>
            <CardContent className="flex flex-col items-center gap-3">
              <Skeleton className="h-20 w-20 rounded-full" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-4 w-20" />
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: stable placeholder -- owner: relationships-react; existing suppression is intentional pending typed cleanup.
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="mt-0.5 h-4 w-4" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-4 w-4/5" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </aside>

        {/* Main */}
        <main className="col-span-12 flex flex-col gap-4 lg:col-span-6">
          {/* Tab row */}
          <div className="flex items-center gap-1 border-b">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-28" />
          </div>

          {/* Composer */}
          <Card>
            <CardContent className="space-y-3 py-4">
              <Skeleton className="h-20 w-full" />
              <div className="flex justify-end">
                <Skeleton className="h-9 w-24" />
              </div>
            </CardContent>
          </Card>

          {/* Feed */}
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: stable placeholder -- owner: relationships-react; existing suppression is intentional pending typed cleanup.
              <Card key={i}>
                <CardContent className="flex items-start gap-3 py-4">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </main>

        {/* Aside */}
        <aside className="col-span-12 flex flex-col gap-4 lg:col-span-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-7 w-7 rounded" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-48" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border p-3">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="mt-2 h-5 w-24" />
              </div>
              <div className="rounded-md border p-3">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-2 h-5 w-16" />
              </div>
              <div className="rounded-md border p-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-2 h-5 w-16" />
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}
