"use client"

// agent-quality: file-size exception -- owner: relationships-react; existing inquiry detail workflow stays co-located while this PR only fixes branch-local select typing.

import type {
  CloseInquiryInput,
  InquiryActivityRecord,
  InquiryCloseOutcome,
  InquiryPriority,
  InquiryRecord,
  RecordInquiryActivityInput,
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
import { type ReactNode, useRef, useState } from "react"
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
import { InquiryOwnerField, type InquiryOwnerOption } from "./inquiry-owner-field.js"
import { InquiryTravelBrief } from "./inquiry-travel-brief.js"

export interface InquiryWorkspaceProps {
  inquiry: InquiryRecord
  apiBaseUrl?: string
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
  onRecordFirstResponse: () => Promise<unknown>
  isRecordingFirstResponse?: boolean
  onUploadAttachment?: (file: File, caption?: string) => Promise<unknown>
  onUpdateAttachmentCaption?: (linkId: string, caption: string | null) => Promise<unknown>
  onRemoveAttachment?: (linkId: string) => Promise<unknown>
  isUploadingAttachment?: boolean
  onConvertToProposal: (
    input: InquiryProposalConversionOptions,
  ) => Promise<InquiryProposalConversionOutcome>
  isConverting?: boolean
  onConvertToBookingSession: (
    input: InquiryBookingSessionConversionOptions,
  ) => Promise<InquiryBookingSessionConversionOutcome>
  isCreatingBookingSession?: boolean
  activities?: InquiryActivityRecord[]
  onRecordActivity?: (input: RecordInquiryActivityInput) => Promise<unknown>
  isRecordingActivity?: boolean
  /**
   * Target management, supplied by the host so this component stays free of the
   * Product read it would otherwise need.
   */
  targetsSection?: ReactNode
  /** Colleagues an Inquiry can be assigned to. Falls back to the raw id field when absent. */
  ownerOptions?: InquiryOwnerOption[]
  /** Resolves a created Booking Session to a page the operator can open. */
  getBookingSessionHref?: (bookingSessionId: string) => string
  /** Proposal pipelines the conversion may target; absent hides the override. */
  proposalPipelines?: { id: string; name: string; isDefault: boolean }[]
  /** Stages of the chosen pipeline. */
  proposalStages?: { id: string; name: string }[]
  /** Lets the host fetch the stages of whichever pipeline is chosen. */
  onProposalPipelineChange?: (pipelineId: string | null) => void
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
const activityTypes = ["call", "email", "meeting", "task", "follow_up", "note"] as const

function inquiryActivityDirection(activity: InquiryActivityRecord) {
  const relationships = activity.customFields.relationships
  const communication = relationships?.inquiryCommunication
  if (!communication || typeof communication !== "object") return null
  const direction = (communication as { direction?: unknown }).direction
  return direction === "inbound" || direction === "outbound" ? direction : null
}

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
  const [activitySubject, setActivitySubject] = useState("")
  const [activityDescription, setActivityDescription] = useState("")
  const [activityType, setActivityType] = useState<(typeof activityTypes)[number]>("note")
  const [activityDirection, setActivityDirection] = useState<"internal" | "inbound" | "outbound">(
    "internal",
  )
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [attachmentCaption, setAttachmentCaption] = useState("")
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
  /**
   * Why the visible lifecycle actions are unavailable, in the operator's own
   * terms. Only reasons that block an action offered for THIS status appear, so
   * the list stays a next step rather than a list of rules.
   */
  const blockedReasons = [
    ...(inquiry.status === "new" && !canTriage ? [messages.ownerRequired] : []),
    ...(!canAdvanceWithFollowUp &&
    ["triaged", "in_progress", "waiting_on_customer"].includes(inquiry.status)
      ? [messages.followUpRequired]
      : []),
    ...(!hasCustomer && ["triaged", "in_progress", "waiting_on_customer"].includes(inquiry.status)
      ? [messages.customerRequired]
      : []),
  ]
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
            {/* Deliberately not `capitalize`: these are translated sentences,
                and the utility title-cases every word ("Waiting On Customer"). */}
            <div className="mt-2 flex gap-2">
              <Badge variant="outline">{labels.statuses[inquiry.status]}</Badge>
              <Badge variant={inquiry.priority === "urgent" ? "destructive" : "secondary"}>
                {labels.priorities[inquiry.priority as InquiryPriority] ?? inquiry.priority}
              </Badge>
              <Badge variant="outline">{labels.kinds[inquiry.kind]}</Badge>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap gap-2">
              {inquiry.status === "new" ? (
                <Button
                  variant="outline"
                  disabled={!canTriage}
                  onClick={() => transition("triaged")}
                >
                  {messages.triage}
                </Button>
              ) : null}
              {inquiry.status === "triaged" || inquiry.status === "waiting_on_customer" ? (
                <Button
                  variant="outline"
                  disabled={!canAdvanceWithFollowUp}
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
                  onClick={() => transition("waiting_on_customer")}
                >
                  {messages.waitForCustomer}
                </Button>
              ) : null}
              {["triaged", "in_progress", "waiting_on_customer"].includes(inquiry.status) ? (
                <Button disabled={!hasCustomer} onClick={() => transition("qualified")}>
                  {messages.qualify}
                </Button>
              ) : null}
              {inquiry.status === "closed" ? (
                <Button onClick={() => void props.onReopen()}>{messages.reopen}</Button>
              ) : null}
            </div>
            {/* A disabled button has to say why it is disabled. These reasons
                used to ride on `title`, which the shared Button can never show:
                its base class sets `disabled:pointer-events-none`, so the
                tooltip never fires and a screen reader is told nothing. */}
            {blockedReasons.length > 0 ? (
              <ul className="max-w-sm text-right text-xs text-muted-foreground">
                {blockedReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {/* Order follows triage: what they asked, the detail behind it, what
              it points at, what has happened since, then the paperwork. */}
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
              <CardTitle>{messages.context}</CardTitle>
            </CardHeader>
            <CardContent>
              <InquiryTravelBrief brief={inquiry.travelBrief} />
            </CardContent>
          </Card>
          {props.targetsSection}
          <Card>
            <CardHeader>
              <CardTitle>{messages.attachments}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {inquiry.attachments.length === 0 ? (
                <p className="text-sm text-muted-foreground">{messages.noAttachments}</p>
              ) : (
                <ul className="space-y-2">
                  {inquiry.attachments.map((attachment) => (
                    <li key={attachment.linkId} className="rounded-md border p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <a
                          className="font-medium underline"
                          href={`${props.apiBaseUrl?.replace(/\/$/, "") ?? ""}${attachment.downloadPath}`}
                        >
                          {attachment.name}
                        </a>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={!props.onRemoveAttachment}
                          onClick={() => void props.onRemoveAttachment?.(attachment.linkId)}
                        >
                          {messages.removeAttachment}
                        </Button>
                      </div>
                      <Input
                        aria-label={messages.attachmentCaption}
                        defaultValue={attachment.caption ?? ""}
                        onBlur={(event) =>
                          void props.onUpdateAttachmentCaption?.(
                            attachment.linkId,
                            event.currentTarget.value.trim() || null,
                          )
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
              {/* The same hidden-input + Button shape the Media uploader uses,
                  so the control reads as part of the product rather than as the
                  browser's native "Choose File". */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => attachmentInputRef.current?.click()}
                >
                  {messages.chooseAttachment}
                </Button>
                {attachmentFile ? (
                  <span className="truncate text-sm text-muted-foreground">
                    {attachmentFile.name}
                  </span>
                ) : null}
                <input
                  ref={attachmentInputRef}
                  type="file"
                  className="hidden"
                  aria-label={messages.chooseAttachment}
                  onChange={(event) => {
                    setAttachmentFile(event.currentTarget.files?.[0] ?? null)
                    event.currentTarget.value = ""
                  }}
                />
              </div>
              <Input
                aria-label={messages.attachmentCaption}
                value={attachmentCaption}
                placeholder={messages.attachmentCaption}
                onChange={(event) => setAttachmentCaption(event.currentTarget.value)}
              />
              <Button
                type="button"
                disabled={
                  !attachmentFile || !props.onUploadAttachment || props.isUploadingAttachment
                }
                onClick={() => {
                  if (!attachmentFile || !props.onUploadAttachment) return
                  void props.onUploadAttachment(attachmentFile, attachmentCaption).then(() => {
                    setAttachmentFile(null)
                    setAttachmentCaption("")
                  })
                }}
              >
                {messages.uploadAttachment}
              </Button>
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
              <Select
                value={bookingTargetLinkId}
                onValueChange={(value) => setBookingTargetLinkId(value ?? "")}
              >
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
              {bookingConversionError ? (
                <p className="text-sm text-destructive" role="alert">
                  {bookingConversionError}
                </p>
              ) : null}
              {createdBookingSessionId ? (
                // Success replaces the requirement note rather than sitting under
                // it. The session reference is support metadata, so it is shown
                // as such — not as the answer to "what happened?".
                <div role="status">
                  <p className="text-sm font-medium">{messages.bookingSessionCreated}</p>
                  {props.getBookingSessionHref ? (
                    <a
                      className="text-sm underline"
                      href={props.getBookingSessionHref(createdBookingSessionId)}
                    >
                      {messages.openBookingSession}
                    </a>
                  ) : (
                    <p className="font-mono text-xs text-muted-foreground">
                      {createdBookingSessionId}
                    </p>
                  )}
                </div>
              ) : !canConvert || !bookingTargetLinkId ? (
                <p className="text-xs text-muted-foreground">
                  {messages.bookingSessionRequiresProduct}
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
              <CardTitle>{messages.activityTimeline}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {props.onRecordActivity ? (
                <div className="grid gap-3 rounded-md border p-3">
                  <Input
                    aria-label={messages.activitySubject}
                    placeholder={messages.activitySubject}
                    value={activitySubject}
                    onChange={(event) => setActivitySubject(event.target.value)}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Select
                      value={activityType}
                      onValueChange={(value) => setActivityType(value as typeof activityType)}
                    >
                      <SelectTrigger aria-label={messages.activityType}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {activityTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {labels.activityTypes[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={activityDirection}
                      onValueChange={(value) =>
                        setActivityDirection(value as typeof activityDirection)
                      }
                      disabled={!(["call", "email", "meeting"] as string[]).includes(activityType)}
                    >
                      <SelectTrigger aria-label={messages.activityAudience}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="internal">{messages.activityInternal}</SelectItem>
                        <SelectItem value="inbound">{messages.activityInbound}</SelectItem>
                        <SelectItem value="outbound">{messages.activityOutbound}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Textarea
                    aria-label={messages.activityDescription}
                    placeholder={messages.activityDescription}
                    value={activityDescription}
                    onChange={(event) => setActivityDescription(event.target.value)}
                  />
                  <Button
                    disabled={!activitySubject.trim() || props.isRecordingActivity}
                    onClick={() => {
                      const communicationDirection = ["call", "email", "meeting"].includes(
                        activityType,
                      )
                        ? activityDirection === "internal"
                          ? null
                          : activityDirection
                        : null
                      void props
                        .onRecordActivity?.({
                          subject: activitySubject.trim(),
                          type: activityType,
                          description: activityDescription.trim() || null,
                          communicationDirection,
                        })
                        .then(() => {
                          setActivitySubject("")
                          setActivityDescription("")
                        })
                    }}
                  >
                    {messages.recordActivity}
                  </Button>
                </div>
              ) : null}
              {(props.activities ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{messages.noActivities}</p>
              ) : (
                <ol className="space-y-3">
                  {(props.activities ?? []).map((activity) => {
                    const direction = inquiryActivityDirection(activity)
                    return (
                      <li key={activity.id} className="rounded-md border p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong>{activity.subject}</strong>
                          <span className="text-xs text-muted-foreground">
                            {i18n.formatDateTime(activity.completedAt ?? activity.createdAt)}
                          </span>
                        </div>
                        <div className="mt-1 flex gap-2">
                          <Badge variant="outline">
                            {labels.activityTypes[
                              activity.type as keyof typeof labels.activityTypes
                            ] ?? activity.type}
                          </Badge>
                          <Badge variant="secondary">
                            {direction === "inbound"
                              ? messages.activityInbound
                              : direction === "outbound"
                                ? messages.activityOutbound
                                : messages.activityInternal}
                          </Badge>
                        </div>
                        {activity.description ? (
                          <p className="mt-2 whitespace-pre-wrap">{activity.description}</p>
                        ) : null}
                      </li>
                    )
                  })}
                </ol>
              )}
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
              {/* Both are optional overrides that take a pipeline/stage id, and
                  the default is right for almost every conversion. Leading with
                  them asked an agent to know an id to do the ordinary thing. */}
              {props.proposalPipelines?.length ? (
                <details className="rounded-md border px-3 py-2">
                  <summary className="cursor-pointer text-sm font-medium">
                    {messages.proposalAdvanced}
                  </summary>
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="text-sm font-medium" htmlFor="inquiry-proposal-pipeline">
                        {messages.proposalPipeline}
                      </label>
                      <Select
                        value={proposalPipelineId}
                        onValueChange={(value) => {
                          setProposalPipelineId(value ?? "")
                          props.onProposalPipelineChange?.(value ?? null)
                          // A stage belongs to one pipeline; keeping the old one
                          // would send a mismatched pair the API then refuses.
                          setProposalStageId("")
                        }}
                      >
                        <SelectTrigger id="inquiry-proposal-pipeline">
                          <SelectValue placeholder={messages.proposalOptional} />
                        </SelectTrigger>
                        <SelectContent>
                          {props.proposalPipelines.map((pipeline) => (
                            <SelectItem key={pipeline.id} value={pipeline.id}>
                              {pipeline.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {proposalPipelineId ? (
                      <div>
                        <label className="text-sm font-medium" htmlFor="inquiry-proposal-stage">
                          {messages.proposalStage}
                        </label>
                        <Select
                          value={proposalStageId}
                          onValueChange={(value) => setProposalStageId(value ?? "")}
                        >
                          <SelectTrigger id="inquiry-proposal-stage">
                            <SelectValue placeholder={messages.proposalOptional} />
                          </SelectTrigger>
                          <SelectContent>
                            {(props.proposalStages ?? []).map((stage) => (
                              <SelectItem key={stage.id} value={stage.id}>
                                {stage.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                  </div>
                </details>
              ) : null}
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
              {inquiry.firstRespondedAt ? (
                <div>
                  <span className="text-muted-foreground">{messages.firstResponded}: </span>
                  {i18n.formatDateTime(inquiry.firstRespondedAt)}
                </div>
              ) : null}
              <div>{inquiry.contactSnapshot.email ?? "—"}</div>
              <div>{inquiry.contactSnapshot.phone ?? "—"}</div>
              {inquiry.personId ? <Badge variant="secondary">{messages.personLinked}</Badge> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{messages.assignment}</CardTitle>
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
              {props.ownerOptions ? (
                <InquiryOwnerField
                  ownerId={inquiry.ownerId}
                  options={props.ownerOptions}
                  onAssign={props.onAssign}
                />
              ) : (
                // No colleague list is reachable (a deployment without the
                // members endpoint). Keep the id field rather than removing the
                // only way to assign.
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
              )}
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
