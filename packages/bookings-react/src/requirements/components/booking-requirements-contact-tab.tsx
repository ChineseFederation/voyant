import { Badge, Button } from "@voyant-travel/ui/components"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { useBookingRequirementsUiMessagesOrDefault } from "../i18n/index.js"
import type { ContactRequirement } from "../index.js"

export function BookingRequirementsContactTab({
  rows,
  onCreate,
  onEdit,
  onDelete,
}: {
  rows: ContactRequirement[]
  onCreate: () => void
  onEdit: (row: ContactRequirement) => void
  onDelete: (row: ContactRequirement) => void
}) {
  const messages = useBookingRequirementsUiMessagesOrDefault()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{messages.contactTab.title}</h2>
          <p className="text-sm text-muted-foreground">{messages.contactTab.description}</p>
        </div>
        <Button size="sm" onClick={onCreate}>
          <Plus className="mr-2 h-4 w-4" />
          {messages.contactTab.addRequirement}
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">{messages.contactTab.empty}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="p-3 text-left font-medium">{messages.contactTab.columns.field}</th>
                <th className="p-3 text-left font-medium">{messages.contactTab.columns.scope}</th>
                <th className="p-3 text-left font-medium">
                  {messages.contactTab.columns.required}
                </th>
                <th className="p-3 text-left font-medium">
                  {messages.contactTab.columns.perTraveler}
                </th>
                <th className="p-3 text-left font-medium">{messages.contactTab.columns.sort}</th>
                <th className="p-3 text-left font-medium">{messages.contactTab.columns.status}</th>
                <th className="w-20 p-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b last:border-b-0">
                  <td className="p-3 font-medium">
                    {messages.common.fieldKeyLabels[row.fieldKey]}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {messages.common.scopeLabels[row.scope]}
                  </td>
                  <td className="p-3">
                    {row.isRequired ? (
                      <Badge variant="default">{messages.common.required}</Badge>
                    ) : (
                      <Badge variant="outline">{messages.common.optional}</Badge>
                    )}
                  </td>
                  <td className="p-3">
                    {row.perTraveler ? (
                      <Badge variant="secondary">{messages.common.yes}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">{messages.common.no}</span>
                    )}
                  </td>
                  <td className="p-3 font-mono text-xs">{row.sortOrder}</td>
                  <td className="p-3">
                    <Badge variant={row.active ? "default" : "outline"}>
                      {row.active ? messages.common.active : messages.common.inactive}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onEdit(row)}
                        aria-label={messages.common.edit}
                        title={messages.common.edit}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(row)}
                        aria-label={messages.common.delete}
                        title={messages.common.delete}
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
      )}
    </div>
  )
}
