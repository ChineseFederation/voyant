"use client"

/**
 * Channel publication rules for whole supply sources.
 *
 * Where the product and supplier tabs address an operator's own records, this
 * one addresses a connection: "sell TUI on the website, do not sell Supplier B
 * anywhere". That is the decision an operator actually makes when they attach
 * a supply connection, and until #4089 there was no way to express it — every
 * connected supplier's catalogue published itself to every channel.
 *
 * A supply source has no single id. Its identity is the provenance pair
 * `(sourceKind, sourceConnectionId)` recorded on each sourced entry, with a
 * null connection meaning "every connection of this kind". The shared controls
 * want one opaque id per subject, so the pair is encoded into one here and
 * decoded on the way back out.
 */

import { useEffect, useState } from "react"

import { useDistributionUiI18nOrDefault } from "../i18n/index.js"
import type { ChannelRow, ChannelSourcePublicationRow, PublicationSourceRow } from "../index.js"
import { usePublicationMutation, usePublicationSources, useSourcePublications } from "../index.js"
import {
  defaultPublicationDecision,
  type PublicationDecision,
  PublicationRuleForm,
  PublicationRuleList,
  type PublicationSubjectOption,
} from "./publication-rule-controls.js"

/** Separator that cannot occur in a source kind or a connection id. */
const SUBJECT_SEPARATOR = "\u0000"

function encodeSubjectId(source: {
  sourceKind: string
  sourceConnectionId: string | null
}): string {
  return `${source.sourceKind}${SUBJECT_SEPARATOR}${source.sourceConnectionId ?? ""}`
}

function decodeSubjectId(id: string): { sourceKind: string; sourceConnectionId: string | null } {
  const [sourceKind = "", connection = ""] = id.split(SUBJECT_SEPARATOR)
  return { sourceKind, sourceConnectionId: connection || null }
}

type SourcePreview = { key: string; affectedEntryCount: number }

export function PublicationSourcesTab({ channel, open }: { channel?: ChannelRow; open: boolean }) {
  const { messages } = useDistributionUiI18nOrDefault()
  const page = messages.settings.channelsPage.publication
  const sourcesQuery = usePublicationSources({ enabled: open })
  const rulesQuery = useSourcePublications({
    channelId: channel?.id,
    limit: 200,
    offset: 0,
    enabled: open && !!channel,
  })
  const publication = usePublicationMutation()

  const sources: PublicationSourceRow[] = sourcesQuery.data?.data ?? []
  const rules: ChannelSourcePublicationRow[] = rulesQuery.data?.data ?? []

  const [subjectId, setSubjectId] = useState("")
  const [decision, setDecision] = useState<PublicationDecision>(defaultPublicationDecision)
  const [reason, setReason] = useState("")
  const [preview, setPreview] = useState<SourcePreview | null>(null)
  const [previewConfirmed, setPreviewConfirmed] = useState(false)

  useEffect(() => {
    if (!open) {
      setSubjectId("")
      setDecision(defaultPublicationDecision)
      setReason("")
      setPreview(null)
      setPreviewConfirmed(false)
    }
  }, [open])

  // A source rule can move thousands of entries in or out of a live storefront,
  // so the preview is keyed to the exact input it was run for: change any part
  // of the form and the confirmation goes stale rather than authorising a
  // different rule than the one the count described.
  const previewKey = [channel?.id ?? "", subjectId, decision, reason.trim()].join("|")
  const previewIsFresh = preview?.key === previewKey

  const resetPreview = () => {
    setPreview(null)
    setPreviewConfirmed(false)
  }

  const subjectOptions: PublicationSubjectOption[] = sources.map((source) => ({
    id: encodeSubjectId(source),
    name: formatSourceLabel(source, page.sourceEntryCount),
  }))

  // Rules may address a kind or a connection the current discovery pass has no
  // entries for — a supplier that went quiet, or a kind-wide rule authored
  // ahead of connecting. Those still need a readable row and an editable
  // subject, so the rule's own subject is folded into the options.
  for (const rule of rules) {
    const id = encodeSubjectId(rule)
    if (subjectOptions.some((option) => option.id === id)) continue
    subjectOptions.push({ id, name: formatSourceLabel(rule, page.sourceEntryCount) })
  }

  const save = async () => {
    if (!channel || !subjectId || !previewIsFresh || !previewConfirmed) return
    await publication.upsertSource.mutateAsync({
      channelId: channel.id,
      ...decodeSubjectId(subjectId),
      decision,
      reason: reason.trim() || null,
    })
    setSubjectId("")
    setReason("")
    resetPreview()
    await rulesQuery.refetch()
  }

  const runPreview = async () => {
    if (!channel || !subjectId) return
    const result = await publication.previewSource.mutateAsync({
      channelId: channel.id,
      ...decodeSubjectId(subjectId),
      decision,
      reason: reason.trim() || null,
    })
    setPreview({ key: previewKey, affectedEntryCount: result.affectedEntryCount })
    setPreviewConfirmed(false)
  }

  const impact = (template: string) =>
    previewIsFresh && preview
      ? template.replace("{count}", String(preview.affectedEntryCount))
      : null

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{page.sourcesDescription}</p>
      <PublicationRuleForm
        idPrefix="publication-source"
        title={page.sourcesTitle}
        subjectLabel={page.sourceLabel}
        subjectPlaceholder={page.sourcePlaceholder}
        subjects={subjectOptions}
        subjectId={subjectId}
        setSubjectId={(value) => {
          setSubjectId(value)
          resetPreview()
        }}
        decision={decision}
        setDecision={(value) => {
          setDecision(value)
          resetPreview()
        }}
        reason={reason}
        setReason={(value) => {
          setReason(value)
          resetPreview()
        }}
        onSave={save}
        onPreview={runPreview}
        previewResult={impact(page.sourceImpact)}
        confirmationLabel={impact(page.confirmSourceImpact)}
        confirmed={previewConfirmed}
        setConfirmed={setPreviewConfirmed}
        saveLabel={page.saveSource}
        previewLabel={page.previewSource}
        saveHelp={subjectId && !previewIsFresh ? page.previewRequiredCurrent : undefined}
        disabled={!channel || publication.upsertSource.isPending}
        saveDisabled={!previewIsFresh || !previewConfirmed}
        previewDisabled={publication.previewSource.isPending}
      />
      <PublicationRuleList
        empty={page.sourcesEmpty}
        rules={rules.map((rule) => ({ ...rule, subjectId: encodeSubjectId(rule) }))}
        subjects={subjectOptions}
        subjectKey="subjectId"
        includeLabel={page.include}
        excludeLabel={page.exclude}
        noReason={page.noReason}
        onEdit={(rule) => {
          setSubjectId(rule.subjectId)
          setDecision(rule.decision)
          setReason(rule.reason ?? "")
          resetPreview()
        }}
        onDelete={(id) => publication.removeSource.mutateAsync(id).then(() => rulesQuery.refetch())}
        editLabel={page.editRule}
        deleteLabel={page.deleteRule}
      />
    </div>
  )
}

/**
 * Label a source the way an operator recognises it: the connector kind, the
 * connection it came through, and how much inventory rides on the decision.
 * A source with no connection id is the kind-wide default.
 */
function formatSourceLabel(
  source: { sourceKind: string; sourceConnectionId: string | null; entryCount?: number },
  entryCountTemplate: string,
): string {
  const subject = source.sourceConnectionId
    ? `${source.sourceKind} · ${source.sourceConnectionId}`
    : source.sourceKind
  if (typeof source.entryCount !== "number") return subject
  return `${subject} — ${entryCountTemplate.replace("{count}", String(source.entryCount))}`
}
