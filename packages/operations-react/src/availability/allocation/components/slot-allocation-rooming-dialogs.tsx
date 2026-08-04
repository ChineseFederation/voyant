"use client"

import {
  type AllocationConstraintViolation,
  type AllocationManifestTraveler,
  VoyantApiError,
} from "@voyant-travel/operations-react/availability"
import {
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@voyant-travel/ui/components"
import { Loader2 } from "lucide-react"
import { type FormEvent, useEffect, useState } from "react"

import type { AllocationUiMessages } from "../i18n/index.js"

/** The bed preferences the server accepts (`bookingTravelerBedPreferenceSchema`). */
const BED_PREFERENCES = ["single", "twin", "double", "no-preference"] as const
/** Sentinel for "clear the stored preference"; a Select cannot hold `null`. */
const NO_BED_PREFERENCE = "__none__"

export interface RoomingPreferencesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  traveler: AllocationManifestTraveler | null
  messages: AllocationUiMessages
  pending: boolean
  onSubmit: (input: { bedPreference: string | null; roomTypeId: string | null }) => Promise<unknown>
}

/**
 * The admin affordance for the two fields the room rules read.
 *
 * Only these two: identity, dietary and accessibility notes stay behind the
 * travel-details API, which owns their KMS envelopes, and sharing-group
 * membership already has its own mutation.
 */
export function RoomingPreferencesDialog({
  open,
  onOpenChange,
  traveler,
  messages,
  pending,
  onSubmit,
}: RoomingPreferencesDialogProps) {
  const copy = messages.roomingPreferences
  const [bedPreference, setBedPreference] = useState<string>(NO_BED_PREFERENCE)
  const [roomTypeId, setRoomTypeId] = useState<string>("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setBedPreference(traveler?.bedPreference ?? NO_BED_PREFERENCE)
    setRoomTypeId(traveler?.roomTypeId ?? "")
    setError(null)
  }, [open, traveler?.bedPreference, traveler?.roomTypeId])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    try {
      await onSubmit({
        bedPreference: bedPreference === NO_BED_PREFERENCE ? null : bedPreference,
        roomTypeId: roomTypeId.trim() || null,
      })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.saveFailed)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {traveler ? `${copy.title} — ${traveler.fullName}` : copy.title}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit}>
          <DialogBody className="grid gap-4">
            <p className="text-muted-foreground text-xs">{copy.description}</p>
            <div className="grid gap-1.5">
              <Label htmlFor="rooming-bed-preference">{copy.bedPreferenceLabel}</Label>
              {/* The Select clears to `null`; the sentinel is what "no
                  preference" means in this form's state, and `submit` maps it
                  back to a null bed preference on the wire. */}
              <Select
                value={bedPreference}
                onValueChange={(value) => setBedPreference(value ?? NO_BED_PREFERENCE)}
              >
                <SelectTrigger id="rooming-bed-preference" className="w-full">
                  <SelectValue placeholder={copy.bedPreferenceNone} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_BED_PREFERENCE}>{copy.bedPreferenceNone}</SelectItem>
                  {BED_PREFERENCES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {copy.bedPreferences[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rooming-room-type">{copy.roomTypeLabel}</Label>
              <Input
                id="rooming-room-type"
                value={roomTypeId}
                placeholder={copy.roomTypePlaceholder}
                onChange={(event) => setRoomTypeId(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">{copy.roomTypeHint}</p>
            </div>
            {error ? <p className="text-destructive text-xs">{error}</p> : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {copy.cancel}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />
              ) : null}
              {pending ? copy.saving : copy.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export interface ConstraintOverrideDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  violations: readonly AllocationConstraintViolation[]
  messages: AllocationUiMessages
  pending: boolean
  onConfirm: (reason: string) => Promise<unknown>
}

/**
 * The operator's way past a blocking room constraint.
 *
 * A rooming plan that cannot be overridden is a rooming plan operators route
 * around — they will place the family through some other screen and the reason
 * will be in nobody's head but theirs. So the escape hatch exists, the reason is
 * mandatory, and both the reason and the exact rules it waived go into the
 * departure's audit trail.
 */
export function ConstraintOverrideDialog({
  open,
  onOpenChange,
  violations,
  messages,
  pending,
  onConfirm,
}: ConstraintOverrideDialogProps) {
  const copy = messages.override
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setReason("")
    setError(null)
  }, [open])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = reason.trim()
    if (trimmed.length < 3) {
      setError(copy.reasonRequired)
      return
    }
    setError(null)
    try {
      await onConfirm(trimmed)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.allocationFailed)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit}>
          <DialogBody className="grid gap-4">
            <p className="text-muted-foreground text-sm">{copy.description}</p>
            <section className="grid gap-2">
              <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                {copy.violationsHeading}
              </h3>
              <ul className="flex flex-col gap-2">
                {violations.map((violation) => (
                  <li
                    key={`${violation.code}:${String(violation.expected ?? "")}`}
                    data-slot="allocation-constraint-violation"
                    data-code={violation.code}
                    className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm"
                  >
                    <span className="min-w-0 flex-1">
                      {copy.codes[violation.code] ?? violation.message}
                    </span>
                    <Badge variant="outline">{copy.severities[violation.severity]}</Badge>
                  </li>
                ))}
              </ul>
            </section>
            <div className="grid gap-1.5">
              <Label htmlFor="allocation-override-reason">{copy.reasonLabel}</Label>
              <Textarea
                id="allocation-override-reason"
                value={reason}
                rows={3}
                placeholder={copy.reasonPlaceholder}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            {error ? <p className="text-destructive text-xs">{error}</p> : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {copy.cancel}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />
              ) : null}
              {pending ? copy.confirming : copy.confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Pull the structured violations out of a rejected assignment.
 *
 * The route answers 409 with `{ error, detail: { violations } }` and
 * `VoyantApiError` carries that body verbatim, so this reads the payload back
 * rather than pattern-matching on the prose in `message`. Returns `null` for
 * any other failure — a 404, a network error — which the caller then reports as
 * a plain error rather than offering an override for something an override
 * cannot fix.
 */
export function parseConstraintViolations(error: unknown): AllocationConstraintViolation[] | null {
  if (!(error instanceof VoyantApiError) || error.status !== 409) return null
  const detail = (error.body as { detail?: { violations?: unknown } } | undefined)?.detail
  const violations = detail?.violations
  if (!Array.isArray(violations)) return null
  const parsed = violations.filter(
    (entry): entry is AllocationConstraintViolation =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as { code?: unknown }).code === "string" &&
      typeof (entry as { severity?: unknown }).severity === "string",
  )
  // Only offer the override when there is something blocking to override.
  return parsed.some((entry) => entry.severity === "blocking") ? parsed : null
}
