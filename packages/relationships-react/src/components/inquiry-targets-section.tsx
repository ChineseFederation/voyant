"use client"

import type {
  AddInquiryTargetInput,
  InquiryTargetRecord,
} from "@voyant-travel/relationships-contracts"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components"
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@voyant-travel/ui/components/combobox"
import { Package } from "lucide-react"
import { useState } from "react"
import type { InquiryTargetDeparture } from "../hooks/use-inquiry-target-departures.js"
import type { InquiryTargetProduct } from "../hooks/use-inquiry-target-products.js"
import { useCrmUiI18nOrDefault } from "../i18n/index.js"

export interface InquiryUnresolvedTarget {
  kind: string
  targetId: string
  reason?: string
}

export interface InquiryTargetsSectionProps {
  targets: InquiryTargetRecord[]
  /**
   * References the customer supplied that no owning module could resolve.
   * Shown so an operator can act on what was actually asked for rather than
   * seeing an Inquiry that silently lost half its context.
   */
  unresolved?: InquiryUnresolvedTarget[]
  /** Candidate products for the picker; the host supplies the current search results. */
  products?: InquiryTargetProduct[]
  productSearch: string
  onProductSearchChange: (search: string) => void
  /** Departures of {@link departureProductId}; the host supplies the current results. */
  departures?: InquiryTargetDeparture[]
  /** Which attached Product the departure list is scoped to. */
  departureProductId?: string | null
  onDepartureProductChange?: (productId: string | null) => void
  onAddTarget?: (input: AddInquiryTargetInput) => Promise<unknown>
  onRemoveTarget?: (linkId: string) => Promise<unknown>
  /** Targets cannot change once the Inquiry is closed or converted. */
  readOnly?: boolean
  isMutating?: boolean
}

/**
 * Search results, with the chosen product kept present.
 *
 * Choosing a product writes its name into the search box, which re-queries. The
 * results that come back need not contain the selection — a name is not always
 * its own best search term — and a picker that resolves its selection out of the
 * results would then show the raw id and attach nothing.
 */
export function mergeSelectedProduct(
  results: readonly InquiryTargetProduct[],
  selected: InquiryTargetProduct | null,
): InquiryTargetProduct[] {
  if (!selected || results.some((product) => product.id === selected.id)) return [...results]
  return [selected, ...results]
}

/**
 * The line under a target's title, or "" when it would only repeat it.
 *
 * A departure's title IS its date, so echoing the snapshot's `startDate`
 * underneath printed the same day twice. The caller passes the SAME formatter
 * the title was built with, so the comparison is between like and like.
 */
export function targetSubtitle(
  target: Pick<InquiryTargetRecord, "snapshot">,
  formatDate: (value: string) => string,
): string {
  const title = target.snapshot.title
  const parts = [
    target.snapshot.optionLabel,
    target.snapshot.startDate ? formatDate(target.snapshot.startDate) : null,
  ].filter((part): part is string => Boolean(part) && !title.includes(part as string))
  return parts.join(" · ")
}

export function InquiryTargetsSection(props: InquiryTargetsSectionProps) {
  const i18n = useCrmUiI18nOrDefault()
  const messages = i18n.messages.inquiryDetail
  const labels = i18n.messages.inquiryLabels
  // The chosen product is held whole, not as an id looked up in the results.
  // Selecting writes the product's name into the search box, which re-queries;
  // the results then no longer contain the selection, and an id-only selection
  // would resolve to its own id and attach nothing.
  const [selected, setSelected] = useState<InquiryTargetProduct | null>(null)
  const [selectedDepartureId, setSelectedDepartureId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const attachedProducts = props.targets.filter((target) => target.kind === "product")
  const formatTargetDate = (value: string) => i18n.formatDate(value, { dateStyle: "medium" })
  const departureLabel = (departure: InquiryTargetDeparture) =>
    [
      formatTargetDate(departure.startsAt),
      typeof departure.remainingPax === "number" ? `${departure.remainingPax} pax` : null,
    ]
      .filter(Boolean)
      .join(" · ")
  const products = mergeSelectedProduct(props.products ?? [], selected)
  const productById = new Map(products.map((product) => [product.id, product]))
  const labelFor = (id: string) => productById.get(id)?.name ?? id

  const attach = async () => {
    const product = selected
    if (!product || !props.onAddTarget) return
    setError(null)
    try {
      await props.onAddTarget({
        kind: "product",
        targetId: product.id,
        snapshot: {
          title: product.name,
          ...(product.startDate ? { startDate: product.startDate } : {}),
          ...(product.endDate ? { endDate: product.endDate } : {}),
        },
      })
      setSelected(null)
      props.onProductSearchChange("")
    } catch {
      setError(messages.targetAddFailed)
    }
  }

  const attachDeparture = async () => {
    const departure = (props.departures ?? []).find((row) => row.id === selectedDepartureId)
    if (!departure || !props.onAddTarget) return
    setError(null)
    try {
      await props.onAddTarget({
        kind: "departure",
        targetId: departure.id,
        snapshot: {
          title: departureLabel(departure),
          startDate: departure.dateLocal,
          ...(departure.endsAt ? { endDate: departure.endsAt.slice(0, 10) } : {}),
        },
      })
      setSelectedDepartureId("")
    } catch {
      setError(messages.targetAddFailed)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.targets}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {props.targets.length === 0 ? (
          <p className="text-sm text-muted-foreground">{messages.noTargets}</p>
        ) : (
          <ul className="space-y-2">
            {props.targets.map((target) => (
              <li
                key={target.linkId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Package className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{target.snapshot.title}</div>
                    {targetSubtitle(target, formatTargetDate) ? (
                      <div className="truncate text-xs text-muted-foreground">
                        {targetSubtitle(target, formatTargetDate)}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {labels.targetKinds[target.kind as keyof typeof labels.targetKinds] ??
                      target.kind}
                  </Badge>
                  {props.readOnly ? null : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={!props.onRemoveTarget || props.isMutating}
                      onClick={() => void props.onRemoveTarget?.(target.linkId)}
                    >
                      {messages.removeTarget}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {(props.unresolved ?? []).length > 0 ? (
          <div className="rounded-md border border-dashed p-3">
            <p className="text-xs font-medium text-muted-foreground">
              {messages.unresolvedTargets}
            </p>
            <ul className="mt-1 space-y-1 text-sm">
              {(props.unresolved ?? []).map((reference) => (
                <li key={`${reference.kind}:${reference.targetId}`} className="flex gap-2">
                  <Badge variant="secondary">
                    {labels.targetKinds[reference.kind as keyof typeof labels.targetKinds] ??
                      reference.kind}
                  </Badge>
                  <span className="truncate font-mono text-xs">{reference.targetId}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {props.readOnly || !props.onAddTarget ? null : (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-64 flex-1">
              <Combobox
                items={products.map((product) => product.id)}
                value={selected?.id ?? null}
                inputValue={props.productSearch}
                autoHighlight
                itemToStringLabel={(id) => labelFor(id as string)}
                itemToStringValue={(id) => id as string}
                onInputValueChange={(next) => props.onProductSearchChange(next)}
                onValueChange={(next) => {
                  const id = (next as string | null) ?? null
                  const product = id ? productById.get(id) : undefined
                  setSelected(product ?? null)
                  props.onProductSearchChange(product?.name ?? "")
                }}
              >
                <ComboboxInput
                  aria-label={messages.addTarget}
                  placeholder={messages.targetSearchPlaceholder}
                  showClear={Boolean(selected)}
                />
                <ComboboxContent>
                  <ComboboxEmpty>{messages.targetEmpty}</ComboboxEmpty>
                  <ComboboxList>
                    <ComboboxCollection>
                      {(id) => {
                        const product = productById.get(id as string)
                        if (!product) return null
                        return (
                          <ComboboxItem key={product.id} value={product.id}>
                            <span className="truncate">{product.name}</span>
                          </ComboboxItem>
                        )
                      }}
                    </ComboboxCollection>
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!selected || props.isMutating}
              onClick={() => void attach()}
            >
              {messages.addTarget}
            </Button>
          </div>
        )}

        {/* A departure belongs to a Product, so it is only offered once one is
            attached, and it is scoped to whichever Product the operator names. */}
        {props.readOnly || !props.onAddTarget || attachedProducts.length === 0 ? null : (
          <div className="flex flex-wrap items-end gap-2 border-t pt-3">
            {attachedProducts.length > 1 ? (
              <div className="min-w-48">
                <label className="text-xs text-muted-foreground" htmlFor="inquiry-departure-scope">
                  {messages.departureScope}
                </label>
                <Select
                  value={props.departureProductId ?? attachedProducts[0]?.targetId ?? ""}
                  onValueChange={(value) => props.onDepartureProductChange?.(value ?? null)}
                >
                  <SelectTrigger id="inquiry-departure-scope">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {attachedProducts.map((target) => (
                      <SelectItem key={target.linkId} value={target.targetId}>
                        {target.snapshot.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="min-w-64 flex-1">
              <Select
                value={selectedDepartureId}
                onValueChange={(value) => setSelectedDepartureId(value ?? "")}
              >
                <SelectTrigger aria-label={messages.addDeparture}>
                  <SelectValue placeholder={messages.departurePlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {(props.departures ?? []).map((departure) => (
                    <SelectItem key={departure.id} value={departure.id}>
                      {departureLabel(departure)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(props.departures ?? []).length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">{messages.departureEmpty}</p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!selectedDepartureId || props.isMutating}
              onClick={() => void attachDeparture()}
            >
              {messages.addDeparture}
            </Button>
          </div>
        )}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
