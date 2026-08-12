"use client"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@voyant-travel/ui/components"
import { useCrmUiMessagesOrDefault } from "../i18n/index.js"
import type { OrganizationRecord } from "../index.js"
import { OrganizationForm } from "./organization-form.js"

export interface OrganizationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  organization?: OrganizationRecord
  onSuccess?: (organization: OrganizationRecord) => void
}

/**
 * Sheet wrapper for `<OrganizationForm />`. Determines create vs edit mode
 * from the presence of `organization`. The form fills the sheet: fields
 * scroll in a `SheetBody` and the actions pin to a sticky `SheetFooter`.
 */
export function OrganizationDialog({
  open,
  onOpenChange,
  organization,
  onSuccess,
}: OrganizationDialogProps) {
  const isEdit = Boolean(organization)
  const messages = useCrmUiMessagesOrDefault()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        data-slot="organization-dialog"
        side="right"
        size="lg"
        className="data-[side=right]:w-full"
      >
        <SheetHeader>
          <SheetTitle>
            {isEdit
              ? messages.organizationDialog.titles.edit
              : messages.organizationDialog.titles.create}
          </SheetTitle>
          <SheetDescription>
            {isEdit
              ? messages.organizationDialog.descriptions.edit
              : messages.organizationDialog.descriptions.create}
          </SheetDescription>
        </SheetHeader>
        <OrganizationForm
          layout="sheet"
          mode={organization ? { kind: "edit", organization } : { kind: "create" }}
          onSuccess={(saved) => {
            onSuccess?.(saved)
            onOpenChange(false)
          }}
          onCancel={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  )
}
