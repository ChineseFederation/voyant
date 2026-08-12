import { formatMessage } from "@voyant-travel/i18n"
import { Badge, Button, confirmDialog } from "@voyant-travel/ui/components"
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import type { ReactNode } from "react"
import { useState } from "react"
import { useLegalUiMessagesOrDefault } from "../i18n/index.js"
import {
  type LegalContractNumberSeriesRecord,
  useLegalContractNumberSeries,
  useLegalContractNumberSeriesMutation,
} from "../index.js"

export interface NumberSeriesDialogRenderProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  series?: LegalContractNumberSeriesRecord
  onSuccess: () => void
}

export interface NumberSeriesPageProps {
  renderNumberSeriesDialog?: (props: NumberSeriesDialogRenderProps) => ReactNode
}

export function NumberSeriesPage({ renderNumberSeriesDialog }: NumberSeriesPageProps = {}) {
  const messages = useLegalUiMessagesOrDefault()
  const page = messages.numberSeriesPage
  const common = messages.common
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSeries, setEditingSeries] = useState<LegalContractNumberSeriesRecord | undefined>()
  const { remove } = useLegalContractNumberSeriesMutation()
  const { data, isPending, refetch } = useLegalContractNumberSeries()
  const rows = data?.data ?? []

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{page.title}</h1>
          <p className="text-sm text-muted-foreground">{page.description}</p>
        </div>
        {renderNumberSeriesDialog ? (
          <Button
            onClick={() => {
              setEditingSeries(undefined)
              setDialogOpen(true)
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            {page.actions.create}
          </Button>
        ) : null}
      </div>

      {isPending ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : null}

      {!isPending && rows.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">{page.empty}</p>
        </div>
      ) : null}

      {!isPending && rows.length > 0 ? (
        <div className="overflow-x-auto rounded border bg-background">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="p-3 text-left font-medium">{page.columns.name}</th>
                <th className="p-3 text-left font-medium">{page.columns.prefix}</th>
                <th className="p-3 text-left font-medium">{page.columns.separator}</th>
                <th className="p-3 text-left font-medium">{page.columns.pad}</th>
                <th className="p-3 text-left font-medium">{page.columns.current}</th>
                <th className="p-3 text-left font-medium">{page.columns.reset}</th>
                <th className="p-3 text-left font-medium">{page.columns.scope}</th>
                <th className="p-3 text-left font-medium">{page.columns.status}</th>
                <th className="w-20 p-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((series) => (
                <tr key={series.id} className="border-b last:border-b-0">
                  <td className="p-3">{series.name}</td>
                  <td className="p-3 font-mono">{series.prefix}</td>
                  <td className="p-3 font-mono">{series.separator || common.none}</td>
                  <td className="p-3">{series.padLength}</td>
                  <td className="p-3 font-mono">{series.currentSequence}</td>
                  <td className="p-3 capitalize">{series.resetStrategy}</td>
                  <td className="p-3">
                    <Badge variant="outline" className="capitalize">
                      {series.scope}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <Badge variant={series.active ? "default" : "secondary"}>
                      {series.active ? page.active : page.inactive}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      {renderNumberSeriesDialog ? (
                        <button
                          type="button"
                          aria-label={page.editAction}
                          title={page.editAction}
                          onClick={() => {
                            setEditingSeries(series)
                            setDialogOpen(true)
                          }}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        aria-label={page.deleteAction}
                        title={page.deleteAction}
                        onClick={async () => {
                          if (
                            await confirmDialog({
                              description: formatMessage(page.deleteConfirm, { name: series.name }),
                              destructive: true,
                            })
                          ) {
                            remove.mutate(series.id, { onSuccess: () => void refetch() })
                          }
                        }}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {renderNumberSeriesDialog?.({
        open: dialogOpen,
        onOpenChange: setDialogOpen,
        series: editingSeries,
        onSuccess: () => {
          setDialogOpen(false)
          setEditingSeries(undefined)
          void refetch()
        },
      })}
    </div>
  )
}
