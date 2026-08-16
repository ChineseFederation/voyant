"use client"

import { Badge } from "@voyant-travel/ui/components/badge"
import { Button } from "@voyant-travel/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@voyant-travel/ui/components/card"
import { useState } from "react"

import { useChannels } from "../../hooks/use-channels.js"
import { usePublicationMutation, useSupplierPublications } from "../../hooks/use-publications.js"
import { useSuppliersUiMessagesOrDefault } from "../i18n/index.js"
import {
  isDecided,
  nextDecision,
  type PublicationDecision,
  type SupplierChannelRow,
  supplierChannelRows,
} from "./supplier-publication-model.js"

/**
 * Channels shown, and rules fetched.
 *
 * These are deliberately not the same number. The rules query must cover every
 * channel on screen — a rule that fell off its first page would be joined as
 * "no rule" and displayed as "Not decided", which is a decided channel being
 * reported as undecided. Fetching strictly more rules than channels makes that
 * impossible rather than unlikely. (The publication list defaults to 50 and
 * caps at 200; the channel list caps at 100.)
 */
const CHANNEL_PAGE_SIZE = 100
const RULE_PAGE_SIZE = 200

export interface SupplierPublicationSectionProps {
  supplierId: string
}

/** A decision awaiting confirmation, with the impact the server reported. */
interface PendingChange {
  channelId: string
  decision: PublicationDecision
  affectedProductCount: number
}

/**
 * Where a supplier is published, on the supplier's own page.
 *
 * The rules themselves already existed and were reachable — from Channels, via
 * a per-channel sheet. That is the wrong way round for the question an operator
 * actually arrives with, which is formed while looking at a supplier ("stop
 * putting this one on the website"), not while looking at a channel. Same
 * authority, same endpoints, and — importantly — the same safeguard: a supplier
 * rule is a bulk action over every product they supply, so it is previewed and
 * confirmed here exactly as the channel sheet does it.
 */
export function SupplierPublicationSection({ supplierId }: SupplierPublicationSectionProps) {
  const messages = useSuppliersUiMessagesOrDefault().supplierDetailPage.publication
  const channelsQuery = useChannels({ limit: CHANNEL_PAGE_SIZE })
  const rulesQuery = useSupplierPublications({ supplierId, limit: RULE_PAGE_SIZE })
  const { previewSupplier, upsertSupplier, removeSupplier } = usePublicationMutation()
  const [pending, setPending] = useState<PendingChange | null>(null)

  const channels = channelsQuery.data?.data ?? []
  const rows = supplierChannelRows(channels, rulesQuery.data?.data ?? [], supplierId)
  const isLoading = channelsQuery.isLoading || rulesQuery.isLoading
  const isError = channelsQuery.isError || rulesQuery.isError
  const isBusy = previewSupplier.isPending || upsertSupplier.isPending || removeSupplier.isPending
  // More channels than one page can carry: the list below is not all of them,
  // and saying so beats implying this supplier is absent from the rest.
  const channelsTruncated = (channelsQuery.data?.total ?? 0) > channels.length

  const requestChange = async (channelId: string, decision: PublicationDecision) => {
    const result = await previewSupplier.mutateAsync({ channelId, supplierId, decision })
    setPending({ channelId, decision, affectedProductCount: result.affectedProductCount })
  }

  const confirmChange = async () => {
    if (!pending) return
    await upsertSupplier.mutateAsync({
      channelId: pending.channelId,
      supplierId,
      decision: pending.decision,
    })
    setPending(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.title}</CardTitle>
        <CardDescription>{messages.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isError ? (
          <p className="text-destructive text-sm">{messages.loadError}</p>
        ) : isLoading ? (
          <p className="text-muted-foreground text-sm">{messages.loading}</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{messages.noChannels}</p>
        ) : (
          <>
            <ul className="flex flex-col divide-y">
              {rows.map((row) => (
                <ChannelRow
                  key={row.channel.id}
                  row={row}
                  disabled={isBusy}
                  pending={pending?.channelId === row.channel.id ? pending : null}
                  onRequest={(decision) => void requestChange(row.channel.id, decision)}
                  onConfirm={() => void confirmChange()}
                  onCancel={() => setPending(null)}
                  onClear={() => {
                    if (row.rule) removeSupplier.mutate(row.rule.id)
                  }}
                />
              ))}
            </ul>
            {channelsTruncated && (
              <p className="text-muted-foreground text-xs">
                {messages.channelsTruncated
                  .replace("{shown}", String(channels.length))
                  .replace("{count}", String(channelsQuery.data?.total ?? 0))}
              </p>
            )}
            <p className="text-muted-foreground text-xs">{messages.reindexNote}</p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function ChannelRow({
  row,
  disabled,
  pending,
  onRequest,
  onConfirm,
  onCancel,
  onClear,
}: {
  row: SupplierChannelRow
  disabled: boolean
  pending: PendingChange | null
  onRequest: (decision: PublicationDecision) => void
  onConfirm: () => void
  onCancel: () => void
  onClear: () => void
}) {
  const messages = useSuppliersUiMessagesOrDefault().supplierDetailPage.publication
  const inactive = row.state === "channel_inactive"

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2.5">
      <div className="min-w-0">
        <div className="truncate font-medium text-sm">{row.channel.name}</div>
        {pending ? (
          // A supplier rule is a bulk action over everything they supply, so
          // the count it will move is shown before it is written, not after.
          <div className="text-amber-600 text-xs dark:text-amber-500">
            {messages.impact.replace("{count}", String(pending.affectedProductCount))}
          </div>
        ) : (
          row.state === "undecided" && (
            <div className="text-muted-foreground text-xs">{messages.undecidedHint}</div>
          )
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {pending ? (
          <>
            <Button type="button" size="sm" disabled={disabled} onClick={onConfirm}>
              {messages.confirm}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={onCancel}>
              {messages.cancel}
            </Button>
          </>
        ) : (
          <>
            <Badge variant={badgeVariant(row.state)}>
              {stateLabel(row.state, messages.states)}
            </Badge>
            {!inactive && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant={row.state === "included" ? "outline" : "secondary"}
                  disabled={disabled}
                  onClick={() => onRequest(nextDecision(row.state))}
                >
                  {row.state === "included" ? messages.hide : messages.publish}
                </Button>
                {isDecided(row) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    onClick={onClear}
                  >
                    {messages.clear}
                  </Button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </li>
  )
}

function stateLabel(
  state: SupplierChannelRow["state"],
  labels: { included: string; excluded: string; undecided: string; channelInactive: string },
): string {
  if (state === "included") return labels.included
  if (state === "excluded") return labels.excluded
  if (state === "channel_inactive") return labels.channelInactive
  return labels.undecided
}

function badgeVariant(state: SupplierChannelRow["state"]): "default" | "secondary" | "outline" {
  if (state === "included") return "default"
  if (state === "excluded") return "secondary"
  return "outline"
}
