"use client"

// agent-quality: file-size exception -- owner: reporting-react; the report
// builder keeps its view/edit toggle, widget-preview and config Sheets, export
// menu, date-window and base-currency controls, and autosave/unsaved-guard state
// co-located because they share one draft/document controller that cannot be
// split without duplicating that coordinated state. Intentional until the shared
// controller is extracted.

import { useQueryClient } from "@tanstack/react-query"
import type { ReportWidgetDefinition } from "@voyant-travel/reporting-contracts"
import {
  Button,
  DateRangePicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  SegmentedControl,
  Separator,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Switch,
} from "@voyant-travel/ui/components"
import { Download, Plus, Sparkles, Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { resolveLabels } from "../components/labels.js"
import { ReportCanvas } from "../components/report-canvas.js"
import { useNarrowViewport } from "../hooks/use-narrow-viewport.js"
import { useReducedMotion } from "../hooks/use-reduced-motion.js"
import { moveItem, normalizeLayout, resizeItem } from "../layout/grid-model.js"
import { buildRegistry, constraintsFromRegistry, renderableItems } from "../report-model.js"
import { CANONICAL_COLUMNS, type LayoutItem, type WidgetDefinition } from "../types.js"
import {
  exportReport,
  getReportQueryOptions,
  type ReportDefinitionRow,
  type ReportExportFormat,
  updateReport,
} from "./api.js"
import type { ReportingClient } from "./client.js"
import { CustomWidgetEditor } from "./query-editor.js"
import { ReportWidgetView } from "./renderers/report-widget-view.js"
import {
  addCustomInstance,
  addPresetInstance,
  applyItemsToDraft,
  instanceTitle,
  type ReportingCatalog,
  removeInstance,
  resolveDraft,
  setCustomInstanceDefinition,
  setInstanceTitle,
} from "./report-document.js"
import { generateReportPdf } from "./report-pdf.js"
import { type ReportDocumentController, useReportDocument } from "./use-report-document.js"

export interface ReportBuilderAdminProps {
  readonly client: ReportingClient
  readonly catalog: ReportingCatalog
  readonly report: ReportDefinitionRow
  readonly initialMode?: "view" | "edit"
  readonly columns?: number
  readonly rowHeight?: number
  readonly autosaveDelayMs?: number
  readonly narrowBreakpointPx?: number
}

/**
 * The cohesive admin report builder: an explicit view/edit toggle over an
 * instance-aware {@link ReportDraft}. Layout edits, added/removed instances,
 * titles, and custom query definitions all flow through the document controller
 * and are autosaved with revision-guarded PATCHes.
 *
 * Editing affordances stay out of the canvas: presets are added from a menu,
 * custom widgets are authored in a dialog, and per-widget configuration opens a
 * side sheet — so the grid itself always reads as the finished report.
 */
export function ReportBuilderAdmin({
  client,
  catalog,
  report,
  initialMode = "view",
  columns = CANONICAL_COLUMNS,
  rowHeight = 64,
  autosaveDelayMs,
  narrowBreakpointPx = 640,
}: ReportBuilderAdminProps) {
  const labels = useMemo(() => resolveLabels(), [])
  const queryClient = useQueryClient()

  const adapter = useMemo(
    () => ({
      save: (input: Parameters<typeof updateReport>[2]) => updateReport(client, report.id, input),
      reload: () => queryClient.fetchQuery(getReportQueryOptions(client, report.id)),
    }),
    [client, report.id, queryClient],
  )

  const doc = useReportDocument(
    {
      draft: report.draft,
      name: report.name,
      description: report.description,
      revision: report.revision,
    },
    adapter,
    { autosaveDelayMs },
  )

  const [mode, setMode] = useState<"view" | "edit">(initialMode)
  // The instance whose configuration sheet is open (also drives the canvas
  // selection highlight). Distinct from "added" so presets don't force a sheet.
  const [configuringId, setConfiguringId] = useState<string | null>(null)
  const [addingPreset, setAddingPreset] = useState(false)
  const [addingCustom, setAddingCustom] = useState(false)

  const narrow = useNarrowViewport(narrowBreakpointPx)
  const animate = !useReducedMotion()
  const editable = mode === "edit"

  // Guard against losing edits: warn on tab close / reload while a save is still
  // pending, failed, or conflicted. Steady state (everything saved) adds no
  // listener, so normal navigation is never interrupted.
  const hasPendingChanges =
    doc.isDirty || doc.status === "saving" || doc.status === "error" || doc.status === "conflict"
  useEffect(() => {
    if (!hasPendingChanges) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // Legacy browsers require a truthy returnValue to show the prompt.
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [hasPendingChanges])

  const resolved = useMemo(() => resolveDraft(doc.draft, catalog), [doc.draft, catalog])
  const parameters = doc.draft.parameters

  // Page-level date range → the reserved `dateFrom`/`dateTo` parameters. Empty
  // means "all time"; datasets that declare a default date field get an inclusive
  // window applied server-side to every widget.
  const dateFrom = typeof parameters.dateFrom === "string" ? parameters.dateFrom : null
  const dateTo = typeof parameters.dateTo === "string" ? parameters.dateTo : null
  const handleDateRange = useCallback(
    (range: { from: string | null; to: string | null } | null) => {
      doc.updateDraft((draft) => {
        const next = { ...draft.parameters }
        if (range?.from) next.dateFrom = range.from
        else delete next.dateFrom
        if (range?.to) next.dateTo = range.to
        else delete next.dateTo
        return { ...draft, parameters: next }
      })
    },
    [doc],
  )

  // A template can declare inputs its widgets read but cannot supply — a
  // reporting period, most of all. Without rendering them, adding a
  // period-scoped template gives the operator a report whose every widget
  // errors on a missing parameter, with nowhere to say which period.
  const templateParameters = useMemo(() => {
    if (!report.sourceTemplateId) return []
    const template = catalog.templates.find(
      (candidate) =>
        candidate.id === report.sourceTemplateId &&
        (report.sourceTemplateVersion == null ||
          candidate.version === report.sourceTemplateVersion),
    )
    return template?.parameters ?? []
  }, [catalog.templates, report.sourceTemplateId, report.sourceTemplateVersion])

  const handleTemplateParameter = useCallback(
    (id: string, value: string) => {
      doc.updateDraft((draft) => {
        const next = { ...draft.parameters }
        if (value) next[id] = value
        else delete next[id]
        return { ...draft, parameters: next }
      })
    },
    [doc],
  )

  // "Show in base currency": converts every money widget to the operator's base
  // currency using each record's recording-time FX snapshot (handled server-side).
  const baseCurrency = parameters.reportCurrency === "base"
  const handleBaseCurrency = useCallback(
    (on: boolean) => {
      doc.updateDraft((draft) => {
        const next = { ...draft.parameters }
        if (on) next.reportCurrency = "base"
        else delete next.reportCurrency
        return { ...draft, parameters: next }
      })
    },
    [doc],
  )

  const [exporting, setExporting] = useState<ReportExportFormat | null>(null)
  const handleExport = useCallback(
    async (format: ReportExportFormat) => {
      setExporting(format)
      try {
        // Export re-runs the saved report server-side, so flush pending edits first.
        if (doc.isDirty) await doc.flush()
        if (format === "pdf") {
          // The PDF is visual: it captures the live rendered charts/tables, which
          // only exist in the browser — so it's generated client-side, not on the API.
          const blob = await generateReportPdf({ name: doc.name, description: doc.description })
          const slug = doc.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
          const objectUrl = URL.createObjectURL(blob)
          const anchor = document.createElement("a")
          anchor.href = objectUrl
          anchor.download = `${slug || "report"}.pdf`
          document.body.append(anchor)
          anchor.click()
          anchor.remove()
          URL.revokeObjectURL(objectUrl)
        } else {
          await exportReport(client, report.id, format, parameters)
        }
      } finally {
        setExporting(null)
      }
    },
    [client, report.id, doc, parameters],
  )

  // One grid `WidgetDefinition` per AVAILABLE instance, keyed by the *instance*
  // id (not the preset id) so multiple instances of one preset coexist.
  const widgets = useMemo<WidgetDefinition[]>(
    () =>
      resolved
        .filter((entry) => entry.available && entry.definition)
        .map((entry): WidgetDefinition => {
          const definition = entry.definition as ReportWidgetDefinition
          return {
            id: entry.instance.id,
            title: instanceTitle(entry.instance, definition),
            description: definition.description,
            defaultSize: definition.defaultSize,
            minSize: definition.minimumSize,
            maxSize: definition.maximumSize,
            render: () => (
              <ReportWidgetView definition={definition} client={client} parameters={parameters} />
            ),
            // Presence enables the configure affordance; the actual inspector is
            // rendered by this component in a side sheet, keyed by the instance.
            renderConfig: () => null,
          }
        }),
    [resolved, client, parameters],
  )

  const registry = useMemo(() => buildRegistry(widgets), [widgets])
  const constraints = useMemo(() => constraintsFromRegistry(registry), [registry])

  const items = useMemo(() => resolved.map((entry) => entry.item), [resolved])
  const visibleItems = useMemo(
    () => renderableItems(items, registry, mode),
    [items, registry, mode],
  )

  const handleLayoutChange = useCallback(
    (nextItems: LayoutItem[]) => {
      const normalized = normalizeLayout(nextItems, columns, constraints)
      doc.updateDraft((draft) => applyItemsToDraft(draft, normalized))
    },
    [doc, columns, constraints],
  )

  const handleMove = useCallback(
    (widgetId: string, delta: { dx: number; dy: number }) => {
      const next = moveItem(items, widgetId, delta, columns, constraints[widgetId])
      doc.updateDraft((draft) => applyItemsToDraft(draft, next))
    },
    [doc, items, columns, constraints],
  )

  const handleResize = useCallback(
    (widgetId: string, delta: { dWidth: number; dHeight: number }) => {
      const next = resizeItem(items, widgetId, delta, columns, constraints[widgetId])
      doc.updateDraft((draft) => applyItemsToDraft(draft, next))
    },
    [doc, items, columns, constraints],
  )

  const handleRemove = useCallback(
    (widgetId: string) => {
      doc.updateDraft((draft) => removeInstance(draft, widgetId))
      setConfiguringId((current) => (current === widgetId ? null : current))
    },
    [doc],
  )

  const handleAddPreset = useCallback(
    (widget: ReportWidgetDefinition) => {
      doc.updateDraft((draft) => addPresetInstance(draft, widget, { columns }).draft)
    },
    [doc, columns],
  )

  const handleAddCustom = useCallback(
    (definition: ReportWidgetDefinition) => {
      doc.updateDraft((draft) => addCustomInstance(draft, definition, { columns }).draft)
      setAddingCustom(false)
    },
    [doc, columns],
  )

  const configuringEntry = configuringId
    ? (resolved.find((entry) => entry.instance.id === configuringId) ?? null)
    : null

  const canvas = (
    <ReportCanvas
      items={visibleItems}
      registry={registry}
      mode={mode}
      labels={labels}
      columns={columns}
      rowHeight={rowHeight}
      narrow={narrow}
      animate={animate}
      selectedId={configuringId}
      onLayoutChange={editable ? handleLayoutChange : undefined}
      onMove={handleMove}
      onResize={handleResize}
      onRemove={handleRemove}
      onConfigure={setConfiguringId}
    />
  )

  return (
    <div className="flex flex-col gap-6" data-mode={mode}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{doc.name}</h1>
          {doc.description ? (
            <p className="text-muted-foreground text-sm">{doc.description}</p>
          ) : (
            <p className="text-muted-foreground text-sm">
              {editable ? "Add, arrange, and configure widgets." : "Live report dashboard."}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <SaveStatus doc={doc} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={exporting !== null}>
                <Download className="size-4" />
                {exporting ? "Exporting…" : "Export"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void handleExport("csv")}>
                CSV (.csv)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleExport("xlsx")}>
                Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleExport("pdf")}>
                PDF (.pdf)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <SegmentedControl
            aria-label="Report mode"
            options={[
              { label: "View", value: "view" },
              { label: "Edit", value: "edit" },
            ]}
            value={mode}
            onValueChange={(next) => setMode(next as "view" | "edit")}
          />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Period
        </span>
        <DateRangePicker
          value={{ from: dateFrom, to: dateTo }}
          onChange={handleDateRange}
          placeholder="All time"
          className="w-[18rem]"
        />
        <Separator
          orientation="vertical"
          className="mx-1 h-5 data-[orientation=vertical]:self-center"
        />
        <label htmlFor="vrb-base-currency" className="flex cursor-pointer items-center gap-2">
          <Switch
            id="vrb-base-currency"
            checked={baseCurrency}
            onCheckedChange={handleBaseCurrency}
          />
          <span className="text-muted-foreground text-xs font-medium">Show in base currency</span>
        </label>
      </div>

      {templateParameters.length === 0 ? null : (
        <div className="flex flex-wrap items-end gap-3">
          {templateParameters.map((parameter) => {
            const value = parameters[parameter.id]
            const current = typeof value === "string" ? value : ""
            const inputId = `vrb-parameter-${parameter.id}`
            return (
              <div key={parameter.id} className="flex flex-col gap-1">
                <Label htmlFor={inputId} className="text-muted-foreground text-xs font-medium">
                  {parameter.label}
                  {parameter.required && !current ? (
                    <span className="text-destructive ml-1" aria-hidden="true">
                      *
                    </span>
                  ) : null}
                </Label>
                <Input
                  id={inputId}
                  type={
                    parameter.valueType === "date"
                      ? "date"
                      : parameter.valueType === "number"
                        ? "number"
                        : "text"
                  }
                  value={current}
                  aria-describedby={parameter.description ? `${inputId}-hint` : undefined}
                  aria-required={parameter.required || undefined}
                  onChange={(event) => handleTemplateParameter(parameter.id, event.target.value)}
                  className="w-[11rem]"
                />
                {parameter.description ? (
                  <span id={`${inputId}-hint`} className="text-muted-foreground text-xs">
                    {parameter.description}
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      {doc.status === "conflict" ? (
        <div
          className="border-destructive/40 bg-destructive/5 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
          role="alert"
        >
          <span>This report changed elsewhere since you opened it.</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void doc.resolveConflict("reload")}>
              Reload theirs
            </Button>
            <Button size="sm" onClick={() => void doc.resolveConflict("overwrite")}>
              Keep mine
            </Button>
          </div>
        </div>
      ) : null}

      {editable ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card/40 p-2">
          <Button
            size="sm"
            variant="outline"
            disabled={catalog.widgets.length === 0}
            onClick={() => setAddingPreset(true)}
          >
            <Plus className="size-4" />
            Add widget
          </Button>

          <Separator
            orientation="vertical"
            className="h-5 data-[orientation=vertical]:self-center"
          />

          <Button size="sm" variant="ghost" onClick={() => setAddingCustom(true)}>
            <Sparkles className="size-4" />
            Custom widget
          </Button>

          <span className="text-muted-foreground ml-auto hidden pr-1 text-xs sm:inline">
            Drag a widget's title to move it · drag the corner to resize
          </span>
        </div>
      ) : null}

      {canvas}

      {/* Widget picker: a wide sheet showing a live preview of each preset so the
          author sees the visualization before adding it — not a bare menu. */}
      <Sheet open={editable && addingPreset} onOpenChange={setAddingPreset}>
        <SheetContent size="xl" className="gap-0">
          <SheetHeader>
            <SheetTitle>Add a widget</SheetTitle>
            <SheetDescription>Preview a preset, then add it to your report.</SheetDescription>
          </SheetHeader>
          <SheetBody>
            {catalog.widgets.length === 0 ? (
              <p className="text-muted-foreground text-sm">No preset widgets available.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {catalog.widgets.map((widget) => (
                  <button
                    key={`${widget.id}@${widget.version}`}
                    type="button"
                    className="group hover:border-primary focus-visible:ring-ring flex flex-col gap-2 rounded-lg border bg-card p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
                    onClick={() => {
                      handleAddPreset(widget)
                      setAddingPreset(false)
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{widget.label}</span>
                      <span className="text-muted-foreground rounded-sm border px-1.5 py-0.5 text-[0.625rem] font-medium uppercase tracking-wide">
                        {widget.visualization.type}
                      </span>
                    </div>
                    {widget.description ? (
                      <p className="text-muted-foreground line-clamp-2 text-xs">
                        {widget.description}
                      </p>
                    ) : null}
                    <div className="bg-background/40 pointer-events-none h-40 overflow-hidden rounded-md border p-2">
                      <ReportWidgetView
                        definition={widget}
                        client={client}
                        parameters={parameters}
                      />
                    </div>
                    <span className="text-muted-foreground group-hover:text-primary inline-flex items-center gap-1 text-xs font-medium">
                      <Plus className="size-3.5" />
                      Add to report
                    </span>
                  </button>
                ))}
              </div>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>

      {/* Per-widget configuration lives in a side sheet, keyed by instance so the
          title field resets cleanly when switching between widgets. */}
      <Sheet
        open={editable && configuringEntry !== null}
        onOpenChange={(open) => {
          if (!open) setConfiguringId(null)
        }}
      >
        <SheetContent size="default" className="gap-0">
          {configuringEntry ? (
            <>
              <SheetHeader>
                <SheetTitle>Configure widget</SheetTitle>
                <SheetDescription>
                  {configuringEntry.instance.source.kind === "custom"
                    ? "Rename the widget or refine its query."
                    : "Rename this widget."}
                </SheetDescription>
              </SheetHeader>
              <SheetBody>
                <InstanceInspector
                  key={configuringEntry.instance.id}
                  client={client}
                  catalog={catalog}
                  doc={doc}
                  instanceId={configuringEntry.instance.id}
                  definition={configuringEntry.definition}
                  isCustom={configuringEntry.instance.source.kind === "custom"}
                  titleValue={configuringEntry.instance.title ?? ""}
                  onRemove={() => handleRemove(configuringEntry.instance.id)}
                />
              </SheetBody>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Custom widget authoring is a side sheet, consistent with the widget
          picker and per-widget configuration. */}
      <Sheet open={editable && addingCustom} onOpenChange={setAddingCustom}>
        <SheetContent size="lg" className="gap-0">
          <SheetHeader>
            <SheetTitle>Add custom widget</SheetTitle>
            <SheetDescription>
              Author a bounded query and pick how to visualize it.
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            <CustomWidgetEditor
              client={client}
              catalog={catalog}
              onCommit={handleAddCustom}
              onCancel={() => setAddingCustom(false)}
            />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function SaveStatus({ doc }: { doc: ReportDocumentController }) {
  // The saved/idle steady state is intentionally silent — a persistent
  // "All changes saved" label is noise. Only transient or attention-worthy
  // states surface, and unsaved work is additionally guarded on unload.
  if (doc.status === "error") {
    return (
      <span className="text-destructive text-sm" role="status" aria-live="polite">
        Couldn't save
        <button type="button" className="ml-2 underline" onClick={() => void doc.flush()}>
          Retry
        </button>
      </span>
    )
  }
  if (doc.status === "conflict") {
    return (
      <span className="text-destructive text-sm" role="status" aria-live="polite">
        Save conflict
      </span>
    )
  }
  if (doc.status === "saving" || doc.isDirty) {
    return (
      <span className="text-muted-foreground text-sm" role="status" aria-live="polite">
        {doc.status === "saving" ? "Saving…" : "Unsaved changes"}
      </span>
    )
  }
  return null
}

function InstanceInspector({
  client,
  catalog,
  doc,
  instanceId,
  definition,
  isCustom,
  titleValue,
  onRemove,
}: {
  client: ReportingClient
  catalog: ReportingCatalog
  doc: ReportDocumentController
  instanceId: string
  definition: ReportWidgetDefinition | undefined
  isCustom: boolean
  titleValue: string
  onRemove: () => void
}) {
  const [title, setTitle] = useState(titleValue)

  const removeButton = (
    <Button type="button" variant="destructive" size="sm" className="self-start" onClick={onRemove}>
      <Trash2 className="size-4" />
      Remove widget
    </Button>
  )

  // Custom widgets are fully described by their own editor (title, visualization,
  // query) — rendering a second instance-title field on top would duplicate the
  // "Title" control, so the editor is the single source of truth here.
  if (isCustom && definition) {
    return (
      <div className="flex flex-col gap-4">
        <CustomWidgetEditor
          client={client}
          catalog={catalog}
          initialDefinition={definition}
          onCommit={(next) =>
            doc.updateDraft((draft) => setCustomInstanceDefinition(draft, instanceId, next))
          }
        />
        <Separator />
        {removeButton}
      </div>
    )
  }

  // Preset widgets have no editable definition; the only configuration is a
  // display-title override (empty = fall back to the preset's own label).
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`widget-title-${instanceId}`}>Title</Label>
        <Input
          id={`widget-title-${instanceId}`}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
            doc.updateDraft((draft) => setInstanceTitle(draft, instanceId, event.target.value))
          }}
          placeholder={definition?.label ?? "Widget title"}
        />
      </div>
      <Separator />
      {removeButton}
    </div>
  )
}
