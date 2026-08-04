"use client"

import type { AllocationPlanPreview } from "@voyant-travel/operations-react/availability"
import {
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components"
import { AlertTriangle } from "lucide-react"

import type { AllocationUiMessages } from "../i18n/index.js"

/**
 * The dry run before auto-allocate writes anything.
 *
 * `POST .../auto-allocate/preview` computes the plan under the same lock the
 * writer takes and returns it uncommitted, so the operator sees who moves where
 * — and any capacity violation the plan would create — before a single traveler
 * is repositioned. Confirming runs the real `auto-allocate` leg; it re-plans
 * server-side, so this is a review step, not a client-held plan being replayed.
 */
export interface AllocationPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `null` while the preview request is still in flight. */
  plan: AllocationPlanPreview | null
  pending: boolean
  confirmPending: boolean
  error: string | null
  onConfirm: () => void
  /**
   * Human label for a resource id. The plan carries the target's label but only
   * the id of where a traveler sits today, so the "currently" column needs the
   * page's own resource list to name it — never the id.
   */
  resolveResourceLabel?: (resourceId: string) => string | null
  messages: AllocationUiMessages
}

export function AllocationPreviewDialog({
  open,
  onOpenChange,
  plan,
  pending,
  confirmPending,
  error,
  onConfirm,
  resolveResourceLabel,
  messages,
}: AllocationPreviewDialogProps) {
  const copy = messages.preview
  const hasViolations = (plan?.violations.length ?? 0) > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-slot="allocation-preview">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">{copy.description}</p>

          {error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm">
              {error}
            </p>
          ) : null}

          {pending ? <p className="text-muted-foreground text-sm">{copy.planning}</p> : null}

          {plan ? (
            <>
              <p className="text-sm">
                {copy.summary
                  .replace("{assigned}", String(plan.assigned))
                  .replace("{skipped}", String(plan.skipped))}
              </p>

              {hasViolations ? (
                <div
                  data-slot="allocation-preview-violations"
                  className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm"
                  role="alert"
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>
                    <strong className="font-medium">{copy.violationsTitle}</strong>{" "}
                    {copy.violationsDescription}
                  </span>
                </div>
              ) : null}

              {plan.entries.length === 0 ? (
                <p className="rounded-md border border-dashed px-4 py-6 text-muted-foreground text-sm">
                  {copy.emptyPlan}
                </p>
              ) : (
                <div className="overflow-hidden rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>{copy.travelerColumn}</TableHead>
                        <TableHead className="w-32">{copy.bookingColumn}</TableHead>
                        <TableHead className="w-40">{copy.fromColumn}</TableHead>
                        <TableHead className="w-40">{copy.toColumn}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {plan.entries.map((entry) => (
                        <TableRow
                          key={entry.travelerId}
                          data-slot="allocation-preview-entry"
                          data-unchanged={entry.unchanged ? "true" : "false"}
                        >
                          <TableCell className="font-medium">
                            <span className="inline-flex flex-wrap items-center gap-1.5">
                              {entry.travelerName}
                              {entry.unchanged ? (
                                <Badge variant="outline">{copy.unchangedBadge}</Badge>
                              ) : null}
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {entry.bookingNumber}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {entry.currentResourceId
                              ? (resolveResourceLabel?.(entry.currentResourceId) ??
                                copy.unassignedValue)
                              : copy.unassignedValue}
                          </TableCell>
                          <TableCell className="text-xs">
                            {entry.resourceLabel ?? copy.unassignedValue}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {messages.cancel}
          </Button>
          <Button
            type="button"
            data-slot="allocation-preview-confirm"
            onClick={onConfirm}
            disabled={pending || confirmPending || !plan || hasViolations}
          >
            {confirmPending ? copy.confirming : copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
