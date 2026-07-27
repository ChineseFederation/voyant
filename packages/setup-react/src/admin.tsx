"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  type AdminExtension,
  type AdminRouteLoaderContext,
  type AdminRouteRuntime,
  type AdminSetupStepContribution,
  createAdminSetupPrefillHref,
  defineAdminExtension,
  resolveAdminSetupSteps,
  type SelectedAdminExtensionFactoryContext,
  storeAdminSetupPrefill,
  useAdminExtensions,
} from "@voyant-travel/admin"
import {
  DASHBOARD_HEADER_STRIP_HEIGHT,
  readDashboardHeaderSlotHint,
  writeDashboardHeaderSlotHint,
} from "@voyant-travel/admin/dashboard/layout"
import { useLocale } from "@voyant-travel/admin/providers/locale"
import { useVoyantReactContext } from "@voyant-travel/react"
import type { SetupStateSnapshot } from "@voyant-travel/setup"
import {
  Button,
  buttonVariants,
  Progress,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
} from "@voyant-travel/ui/components"
import { Check, CircleDashed, ExternalLink, Loader2, Minus, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"

import {
  dismissSetupClient,
  getSetupStateClient,
  initializeSetupClient,
  updateSetupStepClient,
} from "./client.js"
import { resolveSetupMessages } from "./i18n/index.js"

/**
 * Query key the dashboard widget reads and the route loader seeds. Exported
 * because that seeding is the contract that keeps the setup strip from
 * resolving after the dashboard has already painted.
 */
export const setupQueryKey = (stepIds: readonly string[]) =>
  ["organization-setup", ...stepIds] as const

/**
 * Where {@link canInitializeSelectedSetup} parks the snapshot it already paid
 * for, so {@link initializeSelectedSetup} can reuse it instead of issuing a
 * second serial round trip inside the same route load.
 */
const setupSnapshotQueryKey = ["organization-setup-snapshot"] as const

/**
 * Height of the dashboard strip, shared with the dashboard's pending boundary
 * so the placeholder, the resolved strip, and the skeleton's reservation are
 * one box from first paint. The setup state resolves well after the dashboard
 * aggregates (which the route loader prefetches), so anything variable-height
 * here shifts the entire dashboard.
 */
const STRIP_HEIGHT = DASHBOARD_HEADER_STRIP_HEIGHT

const EMPTY_SUBSCRIPTION = () => () => {}

/**
 * Route-loader half of the setup flow. Beyond persisting state it SEEDS the
 * dashboard widget's query cache, so the strip renders resolved on first paint
 * instead of resolving a fresh two-round-trip chain after the dashboard has
 * already painted (which pushed the whole page down).
 *
 * The `initialize` POST is skipped when the snapshot {@link
 * canInitializeSelectedSetup} already fetched covers every selected step: the
 * server derives `shouldRedirect` from `created && fresh`, and an existing
 * organization row means `created` is false — so the skipped POST could not
 * have redirected.
 */
export async function initializeSelectedSetup(
  context: AdminRouteLoaderContext,
  input: { stepIds: readonly string[]; fresh: boolean },
) {
  const cached = context.queryClient.getQueryData<SetupStateSnapshot>(setupSnapshotQueryKey)
  if (cached?.state && coversEverySelectedStep(cached.state.steps, input.stepIds)) {
    context.queryClient.setQueryData(setupQueryKey(input.stepIds), {
      state: cached.state,
      canManage: true,
    })
    return {}
  }
  const state = await initializeSetupClient(context.runtime, {
    stepIds: [...input.stepIds],
    fresh: input.fresh,
  })
  context.queryClient.setQueryData(setupQueryKey(input.stepIds), { state, canManage: true })
  return {}
}

export async function canInitializeSelectedSetup(context: AdminRouteLoaderContext) {
  const snapshot = await getSetupStateClient(context.runtime)
  context.queryClient.setQueryData(setupSnapshotQueryKey, snapshot)
  return snapshot.canManage
}

/**
 * Resolves the setup state in ONE round trip whenever the server already has a
 * row for every selected step: `GET /v1/admin/setup` returns the same state
 * `initialize` would, plus `canManage`. `initialize` is only needed to create
 * missing step rows (first run, or after an extension contributes a new step),
 * so calling it unconditionally cost a second serial round trip on every
 * dashboard load.
 */
export async function loadSelectedSetupState(
  runtime: AdminRouteRuntime,
  stepIds: readonly string[],
) {
  const snapshot = await getSetupStateClient(runtime)
  if (!snapshot.canManage) return snapshot
  if (snapshot.state && coversEverySelectedStep(snapshot.state.steps, stepIds)) {
    return { state: snapshot.state, canManage: true }
  }
  return {
    state: await initializeSetupClient(runtime, { stepIds: [...stepIds], fresh: false }),
    canManage: true,
  }
}

function coversEverySelectedStep(
  steps: ReadonlyArray<{ stepId: string }>,
  stepIds: readonly string[],
) {
  const present = new Set(steps.map((step) => step.stepId))
  return stepIds.every((stepId) => present.has(stepId))
}

export function createSelectedSetupAdminExtension({
  navMessages: _navMessages,
}: SelectedAdminExtensionFactoryContext): AdminExtension {
  return defineAdminExtension({
    id: "setup",
    setupFlow: {
      id: "@voyant-travel/setup#flow.organization-setup",
      canInitialize: canInitializeSelectedSetup,
      initialize: initializeSelectedSetup,
    },
    widgets: [
      {
        id: "setup-dashboard-checklist",
        slot: "dashboard.header",
        order: 10,
        component: SetupDashboardWidget,
      },
    ],
  })
}

export function SetupDashboardWidget() {
  const extensions = useAdminExtensions()
  const steps = useMemo(() => resolveAdminSetupSteps(extensions), [extensions])
  const stepIds = useMemo(() => steps.map((step) => step.id), [steps])
  const runtime = useVoyantReactContext()
  const queryClient = useQueryClient()
  const { resolvedLocale } = useLocale()
  const messages = resolveSetupMessages(resolvedLocale)
  const [predicateError, setPredicateError] = useState(false)
  const checked = useRef(new Set<string>())
  const query = useQuery({
    queryKey: setupQueryKey(stepIds),
    queryFn: () => loadSelectedSetupState(runtime, stepIds),
    refetchOnMount: "always",
  })
  // Matches the pending boundary's reservation, so the placeholder and the
  // skeleton agree about whether this slot occupies space.
  const reserveWhilePending = useSyncExternalStore(
    EMPTY_SUBSCRIPTION,
    readDashboardHeaderSlotHint,
    () => true,
  )

  useEffect(() => {
    if (query.isFetching || !query.data?.canManage || !query.data.state) return
    if (query.data.state.dismissedAt) return
    const states = new Map(query.data.state.steps.map((state) => [state.stepId, state]))
    const pending = steps.filter((step) => {
      const state = states.get(step.id)
      return !state?.completedAt && !checked.current.has(step.id)
    })
    if (pending.length === 0) return
    for (const step of pending) checked.current.add(step.id)
    const context: AdminRouteLoaderContext = { queryClient, runtime, params: {} }
    void Promise.all(
      pending.map(async (step) => {
        if (await step.isComplete(context)) {
          await updateSetupStepClient(runtime, step.id, "complete")
          return true
        }
        return false
      }),
    )
      .then((results) => {
        if (results.some(Boolean)) void query.refetch()
      })
      .catch(() => setPredicateError(true))
  }, [query.data, query.isFetching, query.refetch, queryClient, runtime, steps])

  const state = query.data?.state ?? null
  const states = new Map((state?.steps ?? []).map((step) => [step.stepId, step]))
  const completed = steps.filter((step) => states.get(step.id)?.completedAt).length
  const skipped = steps.filter(
    (step) => !states.get(step.id)?.completedAt && states.get(step.id)?.skippedAt,
  ).length
  const terminal = completed + skipped
  const allTerminal = steps.length > 0 && terminal === steps.length
  const occupiesSpace = Boolean(state) && !state?.dismissedAt && !allTerminal

  // Record whether this slot takes up space so the dashboard's pending
  // boundary can reserve it only for workspaces that will actually see a
  // strip. Established workspaces (dismissed, or every step terminal) then
  // reserve nothing and lose no height on the skeleton-to-page swap.
  useEffect(() => {
    if (query.isPending) return
    writeDashboardHeaderSlotHint(occupiesSpace)
  }, [query.isPending, occupiesSpace])

  if (query.isPending) {
    return reserveWhilePending ? <SetupStripPlaceholder label={messages.loading} /> : null
  }
  if (query.isError || !state) return null
  if (state.dismissedAt || allTerminal) return null

  return (
    <SetupStrip
      steps={steps}
      states={states}
      prefill={state.prefill}
      completed={completed}
      skipped={skipped}
      terminal={terminal}
      canManage={Boolean(query.data.canManage)}
      predicateError={predicateError}
      locale={resolvedLocale}
      onDismiss={async () => {
        await dismissSetupClient(runtime)
        await query.refetch()
      }}
      onSkip={async (stepId) => {
        await updateSetupStepClient(runtime, stepId, "skip")
        await query.refetch()
      }}
    />
  )
}

/**
 * Occupies the resolved strip's exact box while the setup state is in flight,
 * so the dashboard below never moves.
 */
function SetupStripPlaceholder({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className={`flex ${STRIP_HEIGHT} items-center gap-3 rounded-md bg-card px-4 ring-1 ring-foreground/10`}
    >
      <Skeleton className="size-5 shrink-0 rounded-full" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="ml-auto hidden h-1.5 w-40 sm:block" />
      <Skeleton className="h-8 w-24 rounded-md" />
    </div>
  )
}

function SetupStrip({
  steps,
  states,
  prefill,
  completed,
  skipped,
  terminal,
  canManage,
  predicateError,
  locale,
  onDismiss,
  onSkip,
}: {
  steps: readonly AdminSetupStepContribution[]
  states: Map<string, SetupStepStateLike>
  prefill: Record<string, unknown>
  completed: number
  skipped: number
  terminal: number
  canManage: boolean
  predicateError: boolean
  locale: string | null | undefined
  onDismiss: () => Promise<void>
  onSkip: (stepId: string) => Promise<void>
}) {
  const messages = resolveSetupMessages(locale)
  const [open, setOpen] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const total = Math.max(steps.length, 1)
  const percent = Math.round((terminal / total) * 100)
  const progressLabel = messages.progress
    .replace("{complete}", String(completed))
    .replace("{total}", String(steps.length))
  const skippedLabel =
    skipped > 0 ? messages.skippedCount.replace("{count}", String(skipped)) : null

  const dismiss = () => {
    setDismissing(true)
    void onDismiss().finally(() => setDismissing(false))
  }

  return (
    <>
      <div
        className={`flex ${STRIP_HEIGHT} items-center gap-3 rounded-md bg-card px-4 ring-1 ring-foreground/10`}
      >
        <ProgressRing percent={percent} />
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate font-heading text-sm font-medium">{messages.title}</span>
          <span className="hidden shrink-0 text-xs text-muted-foreground md:inline">
            {progressLabel}
            {skippedLabel ? ` · ${skippedLabel}` : ""}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden items-center gap-2 sm:flex">
            <Progress value={percent} className="h-1.5 w-32" />
            <span className="font-data w-9 text-right text-xs text-muted-foreground tabular-nums">
              {percent}%
            </span>
          </div>
          <Button type="button" size="sm" onClick={() => setOpen(true)}>
            {messages.continueAction}
          </Button>
          {canManage ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={messages.dismiss}
              disabled={dismissing}
              onClick={dismiss}
            >
              {dismissing ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
            </Button>
          ) : null}
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" aria-label={messages.openChecklist}>
          <SheetHeader>
            <SheetTitle>{messages.title}</SheetTitle>
            <SheetDescription>{messages.description}</SheetDescription>
            <div className="mt-2 space-y-2">
              <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                <span>
                  {progressLabel}
                  {skippedLabel ? ` · ${skippedLabel}` : ""}
                </span>
                <span className="font-data tabular-nums">{percent}%</span>
              </div>
              <Progress value={percent} className="h-1.5" />
            </div>
          </SheetHeader>
          <SheetBody className="px-0 py-0">
            {predicateError ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">{messages.loadFailed}</p>
            ) : null}
            <ul className="divide-y divide-border">
              {steps.map((step) => (
                <SetupStepRow
                  key={step.id}
                  step={step}
                  state={states.get(step.id)}
                  prefill={prefill[step.id]}
                  locale={locale}
                  canManage={canManage}
                  onSkip={() => onSkip(step.id)}
                />
              ))}
            </ul>
          </SheetBody>
          {canManage ? (
            <SheetFooter>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={dismissing}
                onClick={dismiss}
              >
                {dismissing ? <Loader2 className="size-4 animate-spin" /> : null}
                {messages.dismiss}
              </Button>
            </SheetFooter>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  )
}

/** Compact circular progress used as the strip's leading glyph. */
function ProgressRing({ percent }: { percent: number }) {
  const radius = 8
  const circumference = 2 * Math.PI * radius
  return (
    <svg
      aria-hidden="true"
      className="size-5 shrink-0 -rotate-90"
      viewBox="0 0 20 20"
      fill="none"
      role="presentation"
    >
      <circle cx="10" cy="10" r={radius} className="stroke-foreground/15" strokeWidth="2.5" />
      <circle
        cx="10"
        cy="10"
        r={radius}
        className="stroke-primary transition-[stroke-dashoffset] duration-500"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - percent / 100)}
      />
    </svg>
  )
}

interface SetupStepStateLike {
  completedAt: string | null
  skippedAt: string | null
}

function SetupStepRow({
  step,
  state,
  prefill,
  locale,
  canManage,
  onSkip,
}: {
  step: AdminSetupStepContribution
  state?: SetupStepStateLike
  prefill: unknown
  locale: string | null | undefined
  canManage: boolean
  onSkip: () => Promise<void>
}) {
  const shell = resolveSetupMessages(locale)
  const copy = resolveStepMessages(step, locale)
  const [skipping, setSkipping] = useState(false)
  const complete = Boolean(state?.completedAt)
  const skipped = !complete && Boolean(state?.skippedAt)
  const Action = step.actionComponent
  const resolvedPrefill = step.prefill ? step.prefill(prefill) : prefill
  const statusLabel = complete ? shell.complete : skipped ? shell.skipped : shell.pending

  return (
    <li className="flex gap-3 px-4 py-4">
      <span
        role="img"
        aria-label={statusLabel}
        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${
          complete
            ? "bg-success/15 text-success"
            : skipped
              ? "bg-muted text-muted-foreground"
              : "text-muted-foreground"
        }`}
      >
        {complete ? (
          <Check className="size-3.5" />
        ) : skipped ? (
          <Minus className="size-3.5" />
        ) : (
          <CircleDashed className="size-4" />
        )}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p
          className={`text-sm font-medium ${complete ? "text-muted-foreground" : "text-foreground"}`}
        >
          {copy.title}
        </p>
        {/* Only a completed step collapses. A skipped step keeps its
            description and action: skipping is "not now", there is no unskip
            control, and the shell copy promises you can leave and return. */}
        {complete ? null : <p className="text-sm text-muted-foreground">{copy.description}</p>}
        {complete ? null : (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {Action ? (
              <Action label={copy.action} prefill={resolvedPrefill} />
            ) : step.href ? (
              <a
                href={createAdminSetupPrefillHref(step.href, step.id)}
                className={buttonVariants({ variant: "outline", size: "sm" })}
                onClick={() => storeAdminSetupPrefill(step.id, resolvedPrefill)}
              >
                {copy.action}
                <ExternalLink className="size-4" />
              </a>
            ) : null}
            {canManage && !skipped && step.skippable ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={skipping}
                onClick={() => {
                  setSkipping(true)
                  void onSkip().finally(() => setSkipping(false))
                }}
              >
                {skipping ? <Loader2 className="size-4 animate-spin" /> : null}
                {shell.skip}
              </Button>
            ) : null}
          </div>
        )}
      </div>
      {complete || skipped ? (
        <span className="shrink-0 self-start text-xs text-muted-foreground">{statusLabel}</span>
      ) : null}
    </li>
  )
}

function resolveStepMessages(step: AdminSetupStepContribution, locale: string | null | undefined) {
  const language = locale?.toLowerCase().startsWith("ro") ? "ro" : "en"
  return step.messages[language] ?? step.messages.en ?? Object.values(step.messages)[0]!
}
