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
import { useLocale } from "@voyant-travel/admin/providers/locale"
import { useVoyantReactContext } from "@voyant-travel/react"
import {
  Badge,
  Button,
  buttonVariants,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Progress,
} from "@voyant-travel/ui/components"
import { Check, ExternalLink, Loader2, Minus, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import {
  dismissSetupClient,
  getSetupStateClient,
  initializeSetupClient,
  updateSetupStepClient,
} from "./client.js"
import { resolveSetupMessages } from "./i18n/index.js"

const setupQueryKey = (stepIds: readonly string[]) => ["organization-setup", ...stepIds] as const

export async function initializeSelectedSetup(
  context: AdminRouteLoaderContext,
  input: { stepIds: readonly string[]; fresh: boolean },
) {
  await initializeSetupClient(context.runtime, {
    stepIds: [...input.stepIds],
    fresh: input.fresh,
  })
  return {}
}

export async function canInitializeSelectedSetup(context: AdminRouteLoaderContext) {
  return (await getSetupStateClient(context.runtime)).canManage
}

export async function loadSelectedSetupState(
  runtime: AdminRouteRuntime,
  stepIds: readonly string[],
) {
  const snapshot = await getSetupStateClient(runtime)
  if (!snapshot.canManage) return snapshot
  return {
    state: await initializeSetupClient(runtime, { stepIds: [...stepIds], fresh: false }),
    canManage: true,
  }
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
  const [dismissing, setDismissing] = useState(false)
  const checked = useRef(new Set<string>())
  const query = useQuery({
    queryKey: setupQueryKey(stepIds),
    queryFn: () => loadSelectedSetupState(runtime, stepIds),
    refetchOnMount: "always",
  })

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

  if (query.isPending) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {messages.loading}
      </div>
    )
  }
  if (query.isError || !query.data?.state) {
    return null
  }

  const state = query.data.state
  if (state.dismissedAt) return null

  const canManage = Boolean(query.data.canManage) && !query.isFetching
  const states = new Map(state.steps.map((step) => [step.stepId, step]))
  const completed = steps.filter((step) => states.get(step.id)?.completedAt).length
  const terminal = steps.filter((step) => {
    const stepState = states.get(step.id)
    return stepState?.completedAt || stepState?.skippedAt
  }).length

  if (steps.length > 0 && terminal === steps.length) return null

  return (
    <Card className="rounded-md shadow-none">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-lg">{messages.title}</CardTitle>
          <CardDescription>{messages.description}</CardDescription>
        </div>
        {canManage ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={dismissing}
            onClick={() => {
              setDismissing(true)
              void dismissSetupClient(runtime)
                .then(() => query.refetch())
                .finally(() => setDismissing(false))
            }}
          >
            {dismissing ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
            {messages.dismiss}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>
              {messages.progress
                .replace("{complete}", String(completed))
                .replace("{total}", String(steps.length))}
            </span>
            <span className="text-muted-foreground">
              {Math.round((terminal / Math.max(steps.length, 1)) * 100)}%
            </span>
          </div>
          <Progress value={(terminal / Math.max(steps.length, 1)) * 100} />
        </div>

        {predicateError ? (
          <p className="text-sm text-muted-foreground">{messages.loadFailed}</p>
        ) : null}

        <div className="grid gap-3">
          {steps.map((step) => (
            <SetupStepCard
              key={step.id}
              step={step}
              state={states.get(step.id)}
              prefill={state.prefill[step.id]}
              locale={resolvedLocale}
              canManage={canManage}
              onSkip={async () => {
                await updateSetupStepClient(runtime, step.id, "skip")
                await query.refetch()
              }}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function SetupStepCard({
  step,
  state,
  prefill,
  locale,
  canManage,
  onSkip,
}: {
  step: AdminSetupStepContribution
  state?: { completedAt: string | null; skippedAt: string | null }
  prefill: unknown
  locale: string | null | undefined
  canManage: boolean
  onSkip: () => Promise<void>
}) {
  const shell = resolveSetupMessages(locale)
  const copy = resolveStepMessages(step, locale)
  const [skipping, setSkipping] = useState(false)
  const complete = Boolean(state?.completedAt)
  const skipped = Boolean(state?.skippedAt)
  const Action = step.actionComponent
  const resolvedPrefill = step.prefill ? step.prefill(prefill) : prefill

  return (
    <Card className="rounded-md shadow-none">
      <CardHeader className="gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base">{copy.title}</CardTitle>
          <CardDescription>{copy.description}</CardDescription>
        </div>
        <Badge variant={complete ? "secondary" : "outline"}>
          {complete ? <Check className="size-3" /> : skipped ? <Minus className="size-3" /> : null}
          {complete ? shell.complete : skipped ? shell.skipped : shell.pending}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        {Action ? (
          <Action label={copy.action} prefill={resolvedPrefill} />
        ) : step.href ? (
          <a
            href={createAdminSetupPrefillHref(step.href, step.id)}
            className={buttonVariants()}
            onClick={() => storeAdminSetupPrefill(step.id, resolvedPrefill)}
          >
            {copy.action}
            <ExternalLink className="size-4" />
          </a>
        ) : null}
        {canManage && !complete && !skipped && step.skippable ? (
          <Button
            type="button"
            variant="ghost"
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
      </CardContent>
    </Card>
  )
}

function resolveStepMessages(step: AdminSetupStepContribution, locale: string | null | undefined) {
  const language = locale?.toLowerCase().startsWith("ro") ? "ro" : "en"
  return step.messages[language] ?? step.messages.en ?? Object.values(step.messages)[0]!
}
