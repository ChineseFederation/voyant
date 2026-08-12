"use client"

import { Skeleton } from "@voyant-travel/ui/components/skeleton"
import { SECONDARY_COLUMN_CLASS } from "@voyant-travel/ui/lib/responsive"
import { cn } from "@voyant-travel/ui/lib/utils"

// `className` mirrors which columns SuppliersPage drops below `md`. Without it
// the placeholder is two columns wider than the table it stands in for, so the
// list visibly reflows once the query resolves.
const COLUMNS = [
  { id: "name", headerWidth: "w-16", width: "w-40", className: undefined },
  { id: "type", headerWidth: "w-12", width: "w-20", className: undefined },
  { id: "status", headerWidth: "w-16", width: "w-16", className: undefined },
  { id: "country", headerWidth: "w-16", width: "w-20", className: SECONDARY_COLUMN_CLASS },
  { id: "currency", headerWidth: "w-16", width: "w-12", className: SECONDARY_COLUMN_CLASS },
] as const

/**
 * Route-level placeholder for the suppliers list. Mirrors `SuppliersPage`:
 *   - Page title + description
 *   - Filter row: search input (left), Filters button, "New Supplier" (right)
 *   - 5-column table: Name / Type / Status / Country / Currency
 *   - Summary + pagination footer
 */
export function SuppliersListSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 min-w-[14rem] flex-1" />
        <Skeleton className="h-9 w-24" />
        <div className="ml-auto">
          <Skeleton className="h-9 w-36" />
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-muted-foreground">
            <tr>
              {COLUMNS.map((column) => (
                <th key={column.id} className={cn("px-4 py-3 font-medium", column.className)}>
                  <Skeleton className={`h-3.5 ${column.headerWidth}`} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }, (_, rowIndex) => `row-${rowIndex}`).map((rowKey) => (
              <tr key={rowKey} className="border-t">
                {COLUMNS.map((column) => (
                  <td key={`${rowKey}-${column.id}`} className={cn("px-4 py-3", column.className)}>
                    <Skeleton className={`h-4 ${column.width}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-4 w-44" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>
    </div>
  )
}
