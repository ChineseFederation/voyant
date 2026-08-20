"use client"

import { Button } from "@voyant-travel/ui/components"
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@voyant-travel/ui/components/combobox"
import { useState } from "react"
import { useCrmUiI18nOrDefault } from "../i18n/index.js"

export interface InquiryOwnerOption {
  id: string
  name: string
  email?: string | null
  /** The signed-in operator, offered as a one-click assignment. */
  isCurrentUser?: boolean
}

export interface InquiryOwnerFieldProps {
  ownerId: string | null
  options: InquiryOwnerOption[]
  /**
   * Clearing the owner MUST carry a reason: `assignInquirySchema` refuses an
   * ownerless assignment without one, so a clear that omits it is a guaranteed
   * 400 and the Inquiry can never be unassigned.
   */
  onAssign: (ownerId: string | null, unassignedReason?: string) => Promise<unknown>
  /** The reason captured alongside this field, used when clearing the owner. */
  unassignedReason?: string
  disabled?: boolean
}

/**
 * Assign an Inquiry to a colleague by name.
 *
 * The field was a free-text "Owner ID" box: an operator had to know, and type,
 * a `user_…` id to give the work to a colleague. Operators recognise people by
 * name, so the candidates are named here and the id never surfaces.
 */
export function InquiryOwnerField(props: InquiryOwnerFieldProps) {
  const i18n = useCrmUiI18nOrDefault()
  const messages = i18n.messages.inquiryDetail
  const labelFor = (id: string) => props.options.find((option) => option.id === id)?.name ?? id
  const [inputValue, setInputValue] = useState(props.ownerId ? labelFor(props.ownerId) : "")
  const [clearBlocked, setClearBlocked] = useState(false)
  const currentUser = props.options.find((option) => option.isCurrentUser)
  const reason = props.unassignedReason?.trim() ?? ""

  const clearOwner = () => {
    if (!reason) {
      // Restore the name rather than leaving the box empty and the owner set.
      setInputValue(props.ownerId ? labelFor(props.ownerId) : "")
      setClearBlocked(true)
      return
    }
    setClearBlocked(false)
    setInputValue("")
    void props.onAssign(null, reason)
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">{messages.owner}:</span>
        <span className="font-medium">
          {props.ownerId ? labelFor(props.ownerId) : messages.ownerUnassigned}
        </span>
      </div>
      <Combobox
        items={props.options.map((option) => option.id)}
        value={props.ownerId}
        inputValue={inputValue}
        autoHighlight
        disabled={props.disabled}
        itemToStringLabel={(id) => labelFor(id as string)}
        itemToStringValue={(id) => id as string}
        onInputValueChange={(next) => {
          setInputValue(next)
          if (!next && props.ownerId) clearOwner()
        }}
        onValueChange={(next) => {
          const id = (next as string | null) ?? null
          if (!id) {
            clearOwner()
            return
          }
          setClearBlocked(false)
          setInputValue(labelFor(id))
          void props.onAssign(id)
        }}
      >
        <ComboboxInput
          aria-label={messages.owner}
          placeholder={messages.ownerSearchPlaceholder}
          showClear={Boolean(props.ownerId)}
          disabled={props.disabled}
        />
        <ComboboxContent>
          <ComboboxEmpty>{messages.ownerEmpty}</ComboboxEmpty>
          <ComboboxList>
            <ComboboxCollection>
              {(id) => {
                const option = props.options.find((candidate) => candidate.id === id)
                if (!option) return null
                return (
                  <ComboboxItem key={option.id} value={option.id}>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{option.name}</span>
                      {option.email ? (
                        <span className="truncate text-xs text-muted-foreground">
                          {option.email}
                        </span>
                      ) : null}
                    </div>
                  </ComboboxItem>
                )
              }}
            </ComboboxCollection>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {clearBlocked ? (
        <p className="text-xs text-destructive" role="alert">
          {messages.unassignedReasonRequired}
        </p>
      ) : null}
      {currentUser && props.ownerId !== currentUser.id ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={props.disabled}
          onClick={() => {
            setClearBlocked(false)
            setInputValue(currentUser.name)
            void props.onAssign(currentUser.id)
          }}
        >
          {messages.assignToMe}
        </Button>
      ) : null}
    </div>
  )
}
