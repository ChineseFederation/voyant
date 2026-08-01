"use client"

import { Card, CardContent, CardHeader } from "@voyant-travel/ui/components/card"
import { Skeleton } from "@voyant-travel/ui/components/skeleton"

/**
 * Layout-matched placeholder for OrganizationDetailPage.
 *   - Top bar: back + org name + delete
 *   - 12-col grid:
 *       - lg:col-span-3  sidebar: identity + org details card
 *       - lg:col-span-6  main: tabs (People / Proposals / Activities) + list rows
 *       - lg:col-span-3  aside: metrics summary
 */
export function OrganizationDetailSkeleton() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b px-4 py-3 lg:px-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-6 w-56" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-24" />
        </div>
      </div>

      <div className="grid flex-1 grid-cols-12 gap-4 p-4 lg:p-6">
        {/* Sidebar */}
        <aside className="col-span-12 flex flex-col gap-4 lg:col-span-3">
          <Card>
            <CardContent className="flex flex-col items-center gap-3">
              <Skeleton className="h-16 w-16 rounded-lg" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-28" />
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
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-4 w-4/5" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </aside>

        {/* Main */}
        <main className="col-span-12 flex flex-col gap-4 lg:col-span-6">
          <div className="flex items-center gap-1 border-b">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-24" />
          </div>

          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: stable placeholder -- owner: relationships-react; existing suppression is intentional pending typed cleanup.
              <Card key={i}>
                <CardContent className="flex items-center gap-3 py-3">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </main>

        {/* Aside */}
        <aside className="col-span-12 flex flex-col gap-4 lg:col-span-3">
          <Card>
            <CardHeader>
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border p-3 space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-5 w-28" />
              </div>
              <div className="rounded-md border p-3 space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-16" />
              </div>
              <div className="rounded-md border p-3 space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-16" />
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}
