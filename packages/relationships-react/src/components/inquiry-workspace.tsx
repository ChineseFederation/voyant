"use client"

import type {
  CloseInquiryInput,
  InquiryCloseOutcome,
  InquiryPriority,
  InquiryRecord,
  TransitionInquiryInput,
} from "@voyant-travel/relationships-contracts"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@voyant-travel/ui/components"
import { ArrowLeft, CalendarClock, UserRound } from "lucide-react"
import { useState } from "react"
import { useCrmUiI18nOrDefault } from "../i18n/index.js"
import type {
  InquiryBookingSessionConversionOptions,
  InquiryBookingSessionConversionOutcome,
} from "../inquiry-booking-session-conversion.js"
import { inquiryBookingSessionConversionFailureKind } from "../inquiry-booking-session-conversion.js"
import type {
  InquiryProposalConversionOptions,
  InquiryProposalConversionOutcome,
} from "../inquiry-proposal-conversion.js"
import { inquiryProposalConversionFailureKind } from "../inquiry-proposal-conversion.js"
import { buildCloseInput, buildTransitionInput } from "../inquiry-ui-model.js"

export interface InquiryWorkspaceProps {
  inquiry: InquiryRecord
  isSaving?: boolean
  onBack: () => void
  onUpdate: (input: {
    internalSummary?: string | null
    nextActionAt?: string | null
  }) => Promise<unknown>
  onAssign: (ownerId: string | null) => Promise<unknown>
  onTransition: (input: TransitionInquiryInput) => Promise<unknown>
  onClose: (input: CloseInquiryInput) => Promise<unknown>
  onReopen: () => Promise<unknown>
  onConvertToProposal: (
    input: InquiryProposalConversionOptions,
  ) => Promise<InquiryProposalConversionOutcome>
  isConverting?: boolean
  onConvertToBookingSession: (
    input: InquiryBookingSessionConversionOptions,
  ) => Promise<InquiryBookingSessionConversionOutcome>
  isCreatingBookingSession?: boolean
}

const closeOutcomes: InquiryCloseOutcome[] = [
  "lost",
  "no_response",
  "spam",
  "duplicate",
  "not_serviceable",
  "customer_withdrew",
  "other",
]
const dateTimeValue = (value: string | null) => (value ? value.slice(0, 16) : "")
export function InquiryWorkspace(props: InquiryWorkspaceProps) {
  const { inquiry } = props
  const i18n = useCrmUiI18nOrDefault()
  const messages = i18n.messages.inquiryDetail
  const labels = i18n.messages.inquiryLabels
  const [summary, setSummary] = useState(inquiry.internalSummary ?? "")
  const [nextActionAt, setNextActionAt] = useState(dateTimeValue(inquiry.nextActionAt))
  const [ownerId, setOwnerId] = useState(inquiry.ownerId ?? "")
  const [unassignedReason, setUnassignedReason] = useState(inquiry.unassignedReason ?? "")
  const [closeOutcome, setCloseOutcome] = useState<InquiryCloseOutcome>("lost")
  const [duplicateOfInquiryId, setDuplicateOfInquiryId] = useState("")
  const [closeNote, setCloseNote] = useState("")
  const [noFollowUpExpected, setNoFollowUpExpected] = useState(false)
  const [proposalPipelineId, setProposalPipelineId] = useState("")
  const [proposalStageId, setProposalStageId] = useState("")
  const [keepInquiryOpen, setKeepInquiryOpen] = useState(false)
  const [conversionError, setConversionError] = useState<string | null>(null)
  const productTargets = inquiry.targets.filter((target) => target.kind === "product")
  const [bookingTargetLinkId, setBookingTargetLinkId] = useState(productTargets[0]?.linkId ?? "")
  const [bookingConversionError, setBookingConversionError] = useState<string | null>(null)
  const [createdBookingSessionId, setCreatedBookingSessionId] = useState<string | null>(null)
  const followUp = nextActionAt
    ? { nextActionAt: new Date(nextActionAt).toISOString() }
    : { noFollowUpExpected }
  const transition = (status: TransitionInquiryInput["status"]) => {
    const input = buildTransitionInput(inquiry, status, {
      ...followUp,
      ...(status === "triaged" ? { unassignedReason } : {}),
    })
    if (input) void props.onTransition(input)
  }
  const canAdvanceWithFollowUp = Boolean(nextActionAt || noFollowUpExpected)
  const hasCustomer = Boolean(inquiry.personId || inquiry.organizationId)
  const canTriage = Boolean(inquiry.ownerId || inquiry.unassignedReason || unassignedReason.trim())
  const closeInput = buildCloseInput(closeOutcome, { duplicateOfInquiryId, note: closeNote })
  const canConvert = inquiry.status === "qualified" && hasCustomer
  const convertToProposal = async () => {
    setConversionError(null)
    try {
      const outcome = await props.onConvertToProposal({
        pipelineId: proposalPipelineId.trim() || undefined,
        stageId: proposalStageId.trim() || undefined,
        keepInquiryOpen,
      })
      if (outcome.kind === "refused") {
        setConversionError(messages.proposalRefusals[outcome.reason])
      }
    } catch (error) {
      setConversionError(
        inquiryProposalConversionFailureKind(error) === "unavailable"
          ? messages.proposalUnavailable
          : messages.proposalFailed,
      )
    }
  }
  const convertToBookingSession = async () => {
    setBookingConversionError(null)
    setCreatedBookingSessionId(null)
    try {
      const outcome = await props.onConvertToBookingSession({
        targetLinkId: bookingTargetLinkId,
        keepInquiryOpen,
        ...(keepInquiryOpen && nextActionAt
          ? { nextActionAt: new Date(nextActionAt).toISOString() }
          : {}),
      })
      if (outcome.kind === "refused") {
        setBookingConversionError(messages.bookingSessionRefusals[outcome.reason])
      } else {
        setCreatedBookingSessionId(outcome.result.target.id)
      }
    } catch (error) {
      setBookingConversionError(
        inquiryBookingSessionConversionFailureKind(error) === "unavailable"
          ? messages.bookingSessionUnavailable
          : messages.bookingSessionFailed,
      )
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Button variant="ghost" size="sm" className="mb-2" onClick={props.onBack}>
          <ArrowLeft className="mr-1 size-4" />
          {messages.back}
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{inquiry.subject}</h1>
            <div className="mt-2 flex gap-2">
              <Badge variant="outline" className="capitalize">
                {labels.statuses[inquiry.status]}
              </Badge>
              <Badge
                variant={inquiry.priority === "urgent" ? "destructive" : "secondary"}
                className="capitalize"
              >
                {labels.priorities[inquiry.priority as InquiryPriority] ?? inquiry.priority}
              </Badge>
              <Badge variant="outline" className="capitalize">
                {labels.kinds[inquiry.kind]}
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {inquiry.status === "new" ? (
              <Button
                variant="outline"
                disabled={!canTriage}
                title={!canTriage ? messages.ownerRequired : undefined}
                onClick={() => transition("triaged")}
              >
                {messages.triage}
              </Button>
            ) : null}
            {inquiry.status === "triaged" || inquiry.status === "waiting_on_customer" ? (
              <Button
                variant="outline"
                disabled={!canAdvanceWithFollowUp}
                title={!canAdvanceWithFollowUp ? messages.followUpRequired : undefined}
                onClick={() => transition("in_progress")}
              >
                {inquiry.status === "waiting_on_customer"
                  ? messages.returnToWork
                  : messages.startWork}
              </Button>
            ) : null}
            {inquiry.status === "in_progress" ? (
              <Button
                variant="outline"
                disabled={!canAdvanceWithFollowUp}
                title={!canAdvanceWithFollowUp ? messages.followUpRequired : undefined}
                onClick={() => transition("waiting_on_customer")}
              >
                {messages.waitForCustomer}
              </Button>
            ) : null}
            {["triaged", "in_progress", "waiting_on_customer"].includes(inquiry.status) ? (
              <Button
                disabled={!hasCustomer}
                title={!hasCustomer ? messages.customerRequired : undefined}
                onClick={() => transition("qualified")}
              >
                {messages.qualify}
              </Button>
            ) : null}
            {inquiry.status === "closed" ? (
              <Button onClick={() => void props.onReopen()}>{messages.reopen}</Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{messages.customerRequest}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm">{inquiry.customerMessage || "—"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{messages.bookingSessionConversion}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="text-sm font-medium" htmlFor="inquiry-booking-target">
                {messages.bookingSessionTarget}
              </label>
              <Select value={bookingTargetLinkId} onValueChange={setBookingTargetLinkId}>
                <SelectTrigger id="inquiry-booking-target">
                  <SelectValue placeholder={messages.bookingSessionTargetPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {productTargets.map((target) => (
                    <SelectItem key={target.linkId} value={target.linkId}>
                      {target.snapshot.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!canConvert || !bookingTargetLinkId ? (
                <p className="text-xs text-muted-foreground">
                  {messages.bookingSessionRequiresProduct}
                </p>
              ) : null}
              {bookingConversionError ? (
                <p className="text-sm text-destructive" role="alert">
                  {bookingConversionError}
                </p>
              ) : null}
              {createdBookingSessionId ? (
                <p className="text-sm" role="status">
                  {messages.bookingSessionCreated}: {createdBookingSessionId}
                </p>
              ) : null}
              <Button
                className="w-full"
                disabled={
                  !canConvert ||
                  !bookingTargetLinkId ||
                  (keepInquiryOpen && !nextActionAt) ||
                  props.isCreatingBookingSession
                }
                onClick={() => void convertToBookingSession()}
              >
                {messages.createBookingSession}
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{messages.context}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {inquiry.travelBrief ? (
                <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(inquiry.travelBrief, null, 2)}
                </pre>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{messages.operations}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="block text-sm font-medium" htmlFor="inquiry-summary">
                {messages.internalSummary}
              </label>
              <Textarea
                id="inquiry-summary"
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                rows={5}
              />
              <label className="block text-sm font-medium" htmlFor="inquiry-next-action">
                {messages.nextAction}
              </label>
              <Input
                id="inquiry-next-action"
                type="datetime-local"
                value={nextActionAt}
                onChange={(event) => setNextActionAt(event.target.value)}
              />
              <label className="flex items-center gap-2 text-sm" htmlFor="inquiry-no-follow-up">
                <input
                  id="inquiry-no-follow-up"
                  type="checkbox"
                  checked={noFollowUpExpected}
                  onChange={(event) => setNoFollowUpExpected(event.target.checked)}
                />
                {messages.noFollowUpExpected}
              </label>
              <Button
                disabled={props.isSaving}
                onClick={() =>
                  void props.onUpdate({
                    internalSummary: summary || null,
                    nextActionAt: nextActionAt ? new Date(nextActionAt).toISOString() : null,
                  })
                }
              >
                {messages.save}
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{messages.proposalConversion}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-sm font-medium" htmlFor="inquiry-proposal-pipeline">
                  {messages.proposalPipeline}
                </label>
                <Input
                  id="inquiry-proposal-pipeline"
                  value={proposalPipelineId}
                  placeholder={messages.proposalOptional}
                  onChange={(event) => setProposalPipelineId(event.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium" htmlFor="inquiry-proposal-stage">
                  {messages.proposalStage}
                </label>
                <Input
                  id="inquiry-proposal-stage"
                  value={proposalStageId}
                  placeholder={messages.proposalOptional}
                  onChange={(event) => setProposalStageId(event.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm" htmlFor="keep-inquiry-open">
                <input
                  id="keep-inquiry-open"
                  type="checkbox"
                  checked={keepInquiryOpen}
                  onChange={(event) => setKeepInquiryOpen(event.target.checked)}
                />
                {messages.keepInquiryOpen}
              </label>
              {!canConvert ? (
                <p className="text-xs text-muted-foreground">
                  {messages.proposalRequiresQualified}
                </p>
              ) : null}
              {conversionError ? (
                <p className="text-sm text-destructive" role="alert">
                  {conversionError}
                </p>
              ) : null}
              <Button
                className="w-full"
                disabled={!canConvert || props.isConverting}
                onClick={() => void convertToProposal()}
              >
                {messages.convertToProposal}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{messages.contact}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <UserRound className="size-4" />
                {inquiry.contactSnapshot.name ?? "—"}
              </div>
              <div>{inquiry.contactSnapshot.email ?? "—"}</div>
              <div>{inquiry.contactSnapshot.phone ?? "—"}</div>
              {inquiry.personId ? <Badge variant="secondary">{messages.personLinked}</Badge> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{messages.operations}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">{messages.source}: </span>
                {labels.sources[inquiry.source as keyof typeof labels.sources] ?? inquiry.source}
              </div>
              <div className="flex items-center gap-2">
                <CalendarClock className="size-4" />
                <span>
                  {messages.firstResponseDue}:{" "}
                  {inquiry.firstResponseDueAt
                    ? i18n.formatDateTime(inquiry.firstResponseDueAt)
                    : "—"}
                </span>
              </div>
              <div className="flex gap-2">
                <Input
                  aria-label={messages.ownerPlaceholder}
                  placeholder={messages.ownerPlaceholder}
                  value={ownerId}
                  onChange={(event) => setOwnerId(event.target.value)}
                />
                <Button
                  variant="outline"
                  disabled={!ownerId.trim()}
                  onClick={() => void props.onAssign(ownerId.trim())}
                >
                  {messages.assign}
                </Button>
              </div>
              {!inquiry.ownerId ? (
                <Input
                  aria-label={messages.unassignedReason}
                  placeholder={messages.unassignedReason}
                  value={unassignedReason}
                  onChange={(event) => setUnassignedReason(event.target.value)}
                />
              ) : null}
              {inquiry.status !== "closed" && inquiry.status !== "converted" ? (
                <div className="flex gap-2">
                  <Select
                    value={closeOutcome}
                    onValueChange={(value) => setCloseOutcome(value as InquiryCloseOutcome)}
                  >
                    <SelectTrigger aria-label={messages.closeOutcome}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {closeOutcomes.map((outcome) => (
                        <SelectItem value={outcome} key={outcome}>
                          {labels.closeOutcomes[outcome]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="destructive"
                    disabled={!closeInput}
                    onClick={() => closeInput && void props.onClose(closeInput)}
                  >
                    {messages.close}
                  </Button>
                </div>
              ) : null}
              {closeOutcome === "duplicate" ? (
                <Input
                  aria-label={messages.duplicateInquiryId}
                  placeholder={messages.duplicateInquiryId}
                  value={duplicateOfInquiryId}
                  onChange={(event) => setDuplicateOfInquiryId(event.target.value)}
                />
              ) : null}
              {closeOutcome === "other" ? (
                <Textarea
                  aria-label={messages.closeNote}
                  placeholder={messages.closeNote}
                  value={closeNote}
                  onChange={(event) => setCloseNote(event.target.value)}
                />
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
