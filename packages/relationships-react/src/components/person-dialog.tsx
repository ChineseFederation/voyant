"use client"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@voyant-travel/ui/components"
import { useCrmUiMessagesOrDefault } from "../i18n/index.js"
import type { PersonRecord } from "../index.js"
import { PersonForm } from "./person-form.js"

export interface PersonDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  person?: PersonRecord
  initialOrganizationId?: string
  onSuccess?: (person: PersonRecord) => void
}

/**
 * Sheet wrapper for `<PersonForm />`. Determines create vs edit mode from
 * the presence of `person`. Closes the sheet on successful save. The form
 * fills the sheet: fields scroll in a `SheetBody` and the actions pin to a
 * sticky `SheetFooter`.
 */
export function PersonDialog({
  open,
  onOpenChange,
  person,
  initialOrganizationId,
  onSuccess,
}: PersonDialogProps) {
  const isEdit = Boolean(person)
  const messages = useCrmUiMessagesOrDefault()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        data-slot="person-dialog"
        side="right"
        size="lg"
        className="data-[side=right]:w-full"
      >
        <SheetHeader>
          <SheetTitle>
            {isEdit ? messages.personDialog.titles.edit : messages.personDialog.titles.create}
          </SheetTitle>
          <SheetDescription>
            {isEdit
              ? messages.personDialog.descriptions.edit
              : messages.personDialog.descriptions.create}
          </SheetDescription>
        </SheetHeader>
        <PersonForm
          layout="sheet"
          mode={person ? { kind: "edit", person } : { kind: "create" }}
          initialOrganizationId={initialOrganizationId}
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
