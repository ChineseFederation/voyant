"use client"

import { Button } from "@voyant-travel/ui/components"
import { Plus, Sparkles, Wand2 } from "lucide-react"
import type { ReactNode } from "react"

import type { AllocationUiMessages } from "../i18n/index.js"
import { AllocationExportMenu } from "./slot-allocation-export-menu.js"

/**
 * The workspace toolbar: exports and print, the one automation button the
 * active kind offers, and "add resource".
 *
 * Which automation shows is a single either/or the operator never sees both
 * halves of — a kind with no resources yet offers materialisation from its
 * templates, a kind that has them offers the previewed auto-allocation.
 */
export interface AllocationToolbarActionsProps {
  slotId: string
  kind: string
  messages: AllocationUiMessages
  /** An extra tab is showing, or this tab has no allocation view. */
  hidden: boolean
  isTravelerAssignable: boolean
  hasResources: boolean
  hasTemplatesForKind: boolean
  materializePending: boolean
  autoAllocatePending: boolean
  previewPending: boolean
  exportPending: boolean
  renderExtraActions?: (context: { slotId: string; kind: string }) => ReactNode
  onGenerateResources: () => void
  onAutoAllocate: () => void
  onExportPassengers: () => void
  onExportResources: () => void
  onPrint: () => void
  onAddResource: () => void
}

export function AllocationToolbarActions({
  slotId,
  kind,
  messages,
  hidden,
  isTravelerAssignable,
  hasResources,
  hasTemplatesForKind,
  materializePending,
  autoAllocatePending,
  previewPending,
  exportPending,
  renderExtraActions,
  onGenerateResources,
  onAutoAllocate,
  onExportPassengers,
  onExportResources,
  onPrint,
  onAddResource,
}: AllocationToolbarActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {hidden ? null : renderExtraActions?.({ slotId, kind })}
      {hidden ? null : (
        <AllocationExportMenu
          kind={kind}
          messages={messages}
          pending={exportPending}
          onExportPassengers={onExportPassengers}
          onExportResources={onExportResources}
          onPrint={onPrint}
        />
      )}
      {hidden || !isTravelerAssignable ? null : hasResources ? (
        <Button
          variant="outline"
          data-slot="allocation-auto-allocate"
          onClick={onAutoAllocate}
          disabled={previewPending || autoAllocatePending}
        >
          <Wand2 data-icon="inline-start" aria-hidden="true" />
          {autoAllocatePending ? messages.autoAllocating : messages.autoAllocate}
        </Button>
      ) : hasTemplatesForKind ? (
        <Button variant="outline" onClick={onGenerateResources} disabled={materializePending}>
          <Sparkles data-icon="inline-start" aria-hidden="true" />
          {materializePending ? messages.generatingResources : messages.generateResources}
        </Button>
      ) : null}
      {hidden ? null : (
        <Button variant="outline" onClick={onAddResource}>
          <Plus data-icon="inline-start" aria-hidden="true" />
          {messages.addResource}
        </Button>
      )}
    </div>
  )
}
