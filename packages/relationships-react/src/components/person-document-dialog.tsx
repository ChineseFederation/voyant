"use client"

import {
  Button,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@voyant-travel/ui/components"
import { Checkbox } from "@voyant-travel/ui/components/checkbox"
import { DatePicker } from "@voyant-travel/ui/components/date-picker"
import { Input } from "@voyant-travel/ui/components/input"
import { Label } from "@voyant-travel/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components/select"
import { Textarea } from "@voyant-travel/ui/components/textarea"
import * as React from "react"
import { useCrmUiMessagesOrDefault } from "../i18n/index.js"
import {
  type PersonDocumentType,
  usePersonDocumentMutation,
  useRevealPersonDocument,
} from "../index.js"

const DOCUMENT_TYPES: PersonDocumentType[] = [
  "passport",
  "id_card",
  "driver_license",
  "visa",
  "other",
]

export interface PersonDocumentDialogDocument {
  id: string
  type: PersonDocumentType
  issuingCountry: string | null
  issuingAuthority: string | null
  issueDate: string | null
  expiryDate: string | null
  isPrimary: boolean
  notes: string | null
}

export interface PersonDocumentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  personId: string
  document?: PersonDocumentDialogDocument
}

interface FormState {
  type: PersonDocumentType
  number: string
  issuingCountry: string
  issuingAuthority: string
  issueDate: string
  expiryDate: string
  isPrimary: boolean
  notes: string
}

function buildInitialState(
  document: PersonDocumentDialogDocument | undefined,
  revealedNumber: string | null,
): FormState {
  return {
    type: document?.type ?? "passport",
    number: revealedNumber ?? "",
    issuingCountry: document?.issuingCountry ?? "",
    issuingAuthority: document?.issuingAuthority ?? "",
    issueDate: document?.issueDate ?? "",
    expiryDate: document?.expiryDate ?? "",
    isPrimary: document?.isPrimary ?? false,
    notes: document?.notes ?? "",
  }
}

export function PersonDocumentDialog({
  open,
  onOpenChange,
  personId,
  document,
}: PersonDocumentDialogProps) {
  const revealQuery = useRevealPersonDocument(document?.id, { enabled: open && Boolean(document) })
  const revealedNumber = revealQuery.data?.data.number ?? null
  const { createFromPlaintext, updateFromPlaintext } = usePersonDocumentMutation(personId)
  const messages = useCrmUiMessagesOrDefault()
  const dialog = messages.personDocument.dialog
  const typeLabels = messages.personDetail.documentTypeLabels
  const isEditing = Boolean(document)

  const [state, setState] = React.useState<FormState>(() => buildInitialState(document, null))
  const initializedRef = React.useRef(false)

  React.useEffect(() => {
    if (!open) {
      initializedRef.current = false
      return
    }
    if (!initializedRef.current && !revealQuery.isLoading) {
      setState(buildInitialState(document, revealedNumber))
      initializedRef.current = true
    }
  }, [open, document, revealedNumber, revealQuery.isLoading])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const input = {
      type: state.type,
      number: state.number.trim() === "" ? null : state.number.trim(),
      issuingCountry: state.issuingCountry.trim() === "" ? null : state.issuingCountry.trim(),
      issuingAuthority: state.issuingAuthority.trim() === "" ? null : state.issuingAuthority.trim(),
      issueDate: state.issueDate === "" ? null : state.issueDate,
      expiryDate: state.expiryDate === "" ? null : state.expiryDate,
      isPrimary: state.isPrimary,
      notes: state.notes.trim() === "" ? null : state.notes.trim(),
    }
    if (document) {
      await updateFromPlaintext.mutateAsync({ id: document.id, input })
    } else {
      await createFromPlaintext.mutateAsync(input)
    }
    onOpenChange(false)
  }

  const revealError = revealQuery.error
  const saveMutation = isEditing ? updateFromPlaintext : createFromPlaintext
  const saveError = saveMutation.error

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="data-[side=right]:w-full sm:max-w-[520px]">
        <SheetHeader>
          <SheetTitle>{isEditing ? dialog.title : dialog.addTitle}</SheetTitle>
          <SheetDescription>
            {isEditing ? dialog.description : dialog.addDescription}
          </SheetDescription>
        </SheetHeader>
        {revealQuery.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{dialog.loading}</p>
        ) : revealError ? (
          <p className="py-4 text-sm text-destructive">
            {revealError instanceof Error ? revealError.message : dialog.revealFailed}
          </p>
        ) : null}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 overflow-hidden">
          <SheetBody className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="doc-type">{dialog.fields.type}</Label>
              <Select
                value={state.type}
                onValueChange={(value) => set("type", value as PersonDocumentType)}
              >
                <SelectTrigger className="w-full" id="doc-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {typeLabels[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="doc-number">{dialog.fields.number}</Label>
              <Input
                id="doc-number"
                value={state.number}
                onChange={(event) => set("number", event.target.value)}
                placeholder={dialog.placeholders.number}
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="doc-country">{dialog.fields.issuingCountry}</Label>
              <Input
                id="doc-country"
                value={state.issuingCountry}
                onChange={(event) => set("issuingCountry", event.target.value)}
                placeholder={dialog.placeholders.issuingCountry}
                maxLength={3}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="doc-authority">{dialog.fields.issuingAuthority}</Label>
              <Input
                id="doc-authority"
                value={state.issuingAuthority}
                onChange={(event) => set("issuingAuthority", event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{dialog.fields.issueDate}</Label>
              <DatePicker
                value={state.issueDate || null}
                onChange={(next) => set("issueDate", next ?? "")}
                className="w-full"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{dialog.fields.expiryDate}</Label>
              <DatePicker
                value={state.expiryDate || null}
                onChange={(next) => set("expiryDate", next ?? "")}
                className="w-full"
              />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <Checkbox
                id="doc-primary"
                checked={state.isPrimary}
                onCheckedChange={(checked) => set("isPrimary", checked === true)}
              />
              <Label htmlFor="doc-primary" className="cursor-pointer">
                {dialog.fields.primary}
              </Label>
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="doc-notes">{dialog.fields.notes}</Label>
              <Textarea
                id="doc-notes"
                value={state.notes}
                onChange={(event) => set("notes", event.target.value)}
                rows={3}
              />
            </div>
          </SheetBody>
          {saveError ? (
            <p className="text-sm text-destructive">
              {saveError instanceof Error ? saveError.message : dialog.saveFailed}
            </p>
          ) : null}
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {dialog.cancel}
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? dialog.saving : dialog.save}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
