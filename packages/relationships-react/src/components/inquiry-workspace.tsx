"use client"

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
import { useCrmUiMessagesOrDefault } from "../i18n/index.js"
import type { InquiryCloseOutcome, InquiryRecord, InquiryStatus } from "../inquiry-schemas.js"

export interface InquiryWorkspaceProps {
  inquiry: InquiryRecord
  isSaving?: boolean
  onBack: () => void
  onUpdate: (input: {
    internalSummary?: string | null
    nextActionAt?: string | null
  }) => Promise<unknown>
  onAssign: (ownerId: string | null) => Promise<unknown>
  onTransition: (status: InquiryStatus) => Promise<unknown>
  onClose: (outcome: InquiryCloseOutcome) => Promise<unknown>
  onReopen: () => Promise<unknown>
  onConvertToProposal: () => Promise<unknown>
  onConvertToBookingSession: (targetLinkId: string) => Promise<unknown>
}

const closeOutcomes: InquiryCloseOutcome[] = [
  "lost",
  "spam",
  "duplicate",
  "not_serviceable",
  "customer_withdrew",
  "other",
]
const humanize = (value: string) => value.replaceAll("_", " ")
const dateTimeValue = (value: string | null) => (value ? value.slice(0, 16) : "")
const formatDateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value),
      )
    : "—"

export function InquiryWorkspace(props: InquiryWorkspaceProps) {
  const { inquiry } = props
  const messages = useCrmUiMessagesOrDefault().inquiryDetail
  const [summary, setSummary] = useState(inquiry.internalSummary ?? "")
  const [nextActionAt, setNextActionAt] = useState(dateTimeValue(inquiry.nextActionAt))
  const [ownerId, setOwnerId] = useState(inquiry.ownerId ?? "")
  const [closeOutcome, setCloseOutcome] = useState<InquiryCloseOutcome>("lost")
  const productTarget = inquiry.targets[0]

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
                {humanize(inquiry.status)}
              </Badge>
              <Badge
                variant={inquiry.priority === "urgent" ? "destructive" : "secondary"}
                className="capitalize"
              >
                {inquiry.priority}
              </Badge>
              <Badge variant="outline" className="capitalize">
                {humanize(inquiry.kind)}
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {inquiry.status === "new" ? (
              <Button variant="outline" onClick={() => void props.onTransition("in_progress")}>
                {messages.startWork}
              </Button>
            ) : null}
            {inquiry.status === "in_progress" ? (
              <Button
                variant="outline"
                onClick={() => void props.onTransition("waiting_on_customer")}
              >
                {messages.waitForCustomer}
              </Button>
            ) : null}
            {["new", "in_progress", "waiting_on_customer"].includes(inquiry.status) ? (
              <Button onClick={() => void props.onTransition("qualified")}>
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
              <CardTitle>{messages.context}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {inquiry.targets.length === 0 ? (
                <p className="text-sm text-muted-foreground">{messages.noTargets}</p>
              ) : (
                inquiry.targets.map((target) => (
                  <div key={target.id} className="rounded-md border p-3">
                    <div className="font-medium">{target.label ?? target.targetId}</div>
                    <div className="text-xs capitalize text-muted-foreground">
                      {humanize(target.kind)}
                    </div>
                  </div>
                ))
              )}
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
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <UserRound className="size-4" />
                {inquiry.contactSnapshot.name ?? "—"}
              </div>
              <div>{inquiry.contactSnapshot.email ?? "—"}</div>
              <div>{inquiry.contactSnapshot.phone ?? "—"}</div>
              {inquiry.personId ? <Badge variant="secondary">Person linked</Badge> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{messages.operations}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">{messages.source}: </span>
                {inquiry.source}
              </div>
              <div className="flex items-center gap-2">
                <CalendarClock className="size-4" />
                <span>
                  {messages.firstResponseDue}: {formatDateTime(inquiry.firstResponseDueAt)}
                </span>
              </div>
              <div className="flex gap-2">
                <Input
                  aria-label={messages.ownerPlaceholder}
                  placeholder={messages.ownerPlaceholder}
                  value={ownerId}
                  onChange={(event) => setOwnerId(event.target.value)}
                />
                <Button variant="outline" onClick={() => void props.onAssign(ownerId || null)}>
                  {messages.assign}
                </Button>
              </div>
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
                        <SelectItem value={outcome} key={outcome} className="capitalize">
                          {humanize(outcome)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="destructive" onClick={() => void props.onClose(closeOutcome)}>
                    {messages.close}
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{messages.conversion}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">{messages.conversionHint}</p>
              <Button
                className="w-full"
                disabled={inquiry.status !== "qualified"}
                onClick={() => void props.onConvertToProposal()}
              >
                {messages.convertProposal}
              </Button>
              <Button
                className="w-full"
                variant="outline"
                disabled={inquiry.status !== "qualified" || !productTarget}
                onClick={() =>
                  productTarget && void props.onConvertToBookingSession(productTarget.id)
                }
              >
                {messages.convertBookingSession}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
