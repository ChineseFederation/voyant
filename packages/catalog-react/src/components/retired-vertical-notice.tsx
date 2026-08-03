"use client"

import { owningVerticalFor } from "@voyant-travel/catalog-contracts/indexer/contract"
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@voyant-travel/ui/components"
import { useCatalogUiI18nOrDefault } from "../i18n/index.js"

export interface RetiredVerticalNoticeProps {
  /** The vertical the old link asked for (e.g. `extras`). */
  vertical: string
  /** Navigate to the owning vertical. Omitted when the host owns routing. */
  onGoToOwner?: () => void
}

/**
 * Compatibility state for a deep link into a vertical that is no longer
 * independently browsable. Rather than 404 or silently redirect to a different
 * result set, it explains where the record now lives and why.
 */
export function RetiredVerticalNotice({ vertical, onGoToOwner }: RetiredVerticalNoticeProps) {
  const { messages: rootMessages } = useCatalogUiI18nOrDefault()
  const messages = rootMessages.catalogPage.retiredVertical
  // Rendered only for a vertical the contract marks as product-owned; the guard
  // keeps a stray prop from producing a dead-end page.
  if (!owningVerticalFor(vertical)) return null

  return (
    <Empty className="mx-auto max-w-2xl py-16">
      <EmptyHeader>
        <EmptyTitle>{messages.title}</EmptyTitle>
        <EmptyDescription>{messages.description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <p className="text-muted-foreground text-sm">{messages.guidance}</p>
        {onGoToOwner ? (
          <Button variant="outline" onClick={onGoToOwner}>
            {messages.action}
          </Button>
        ) : null}
      </EmptyContent>
    </Empty>
  )
}
