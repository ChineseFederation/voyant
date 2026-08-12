import { Badge, Button } from "@voyant-travel/ui/components"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { useBookingRequirementsUiMessagesOrDefault } from "../i18n/index.js"
import { type BookingQuestion, type BookingQuestionOption, SELECT_TYPES } from "../index.js"

export function BookingRequirementsQuestionsTab({
  rows,
  expandedIds,
  questionOptionsById,
  onToggle,
  onCreate,
  onEdit,
  onDelete,
  onCreateOption,
  onEditOption,
  onDeleteOption,
}: {
  rows: BookingQuestion[]
  expandedIds: Set<string>
  questionOptionsById: Map<string, BookingQuestionOption[]>
  onToggle: (questionId: string) => void
  onCreate: () => void
  onEdit: (question: BookingQuestion) => void
  onDelete: (question: BookingQuestion) => void
  onCreateOption: (question: BookingQuestion, nextSort: number) => void
  onEditOption: (question: BookingQuestion, option: BookingQuestionOption) => void
  onDeleteOption: (option: BookingQuestionOption) => void
}) {
  const messages = useBookingRequirementsUiMessagesOrDefault()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{messages.questionsTab.title}</h2>
          <p className="text-sm text-muted-foreground">{messages.questionsTab.description}</p>
        </div>
        <Button size="sm" onClick={onCreate}>
          <Plus className="mr-2 h-4 w-4" />
          {messages.questionsTab.addQuestion}
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">{messages.questionsTab.empty}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((question) => {
            const expanded = expandedIds.has(question.id)
            const options = (questionOptionsById.get(question.id) ?? []).slice()
            const hasChoices = SELECT_TYPES.has(question.fieldType)
            const nextSort =
              options.length > 0 ? Math.max(...options.map((option) => option.sortOrder)) + 1 : 0

            return (
              <div key={question.id} className="rounded-md border">
                <div className="flex items-center gap-3 p-3">
                  <button
                    type="button"
                    onClick={() => onToggle(question.id)}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    {expanded ? messages.common.hide : messages.common.show}
                  </button>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{question.label}</span>
                      {question.code ? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {question.code}
                        </span>
                      ) : null}
                      <Badge variant="outline">
                        {messages.common.questionFieldTypeLabels[question.fieldType]}
                      </Badge>
                      <Badge variant="secondary">
                        {messages.common.questionTargetLabels[question.target]}
                      </Badge>
                      {question.isRequired ? (
                        <Badge variant="default">{messages.common.required}</Badge>
                      ) : null}
                      <Badge variant={question.active ? "default" : "outline"}>
                        {question.active ? messages.common.active : messages.common.inactive}
                      </Badge>
                    </div>
                    {question.description ? (
                      <p className="mt-1 text-xs text-muted-foreground">{question.description}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(question)}
                      aria-label={messages.common.edit}
                      title={messages.common.edit}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(question)}
                      aria-label={messages.common.delete}
                      title={messages.common.delete}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {expanded ? (
                  <div className="border-t bg-muted/30 p-3">
                    {!hasChoices ? (
                      <p className="py-2 text-center text-xs text-muted-foreground">
                        {messages.questionsTab.choiceTypesHint}
                      </p>
                    ) : null}

                    {hasChoices ? (
                      <>
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {messages.questionsTab.choices}
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onCreateOption(question, nextSort)}
                          >
                            <Plus className="mr-1 h-3 w-3" />
                            {messages.questionsTab.addChoice}
                          </Button>
                        </div>

                        {options.length === 0 ? (
                          <p className="py-2 text-center text-xs text-muted-foreground">
                            {messages.questionsTab.noChoices}
                          </p>
                        ) : (
                          <div className="overflow-x-auto rounded border bg-background">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b text-muted-foreground">
                                  <th className="p-2 text-left font-medium">
                                    {messages.questionsTab.columns.sort}
                                  </th>
                                  <th className="p-2 text-left font-medium">
                                    {messages.questionsTab.columns.value}
                                  </th>
                                  <th className="p-2 text-left font-medium">
                                    {messages.questionsTab.columns.label}
                                  </th>
                                  <th className="p-2 text-left font-medium">
                                    {messages.questionsTab.columns.default}
                                  </th>
                                  <th className="p-2 text-left font-medium">
                                    {messages.questionsTab.columns.status}
                                  </th>
                                  <th className="w-16 p-2" />
                                </tr>
                              </thead>
                              <tbody>
                                {options.map((option) => (
                                  <tr key={option.id} className="border-b last:border-b-0">
                                    <td className="p-2 font-mono">{option.sortOrder}</td>
                                    <td className="p-2 font-mono text-muted-foreground">
                                      {option.value}
                                    </td>
                                    <td className="p-2">{option.label}</td>
                                    <td className="p-2">
                                      {option.isDefault ? (
                                        <Badge variant="secondary">{messages.common.default}</Badge>
                                      ) : (
                                        <span className="text-muted-foreground">-</span>
                                      )}
                                    </td>
                                    <td className="p-2">
                                      <Badge variant={option.active ? "default" : "outline"}>
                                        {option.active
                                          ? messages.common.active
                                          : messages.common.inactive}
                                      </Badge>
                                    </td>
                                    <td className="p-2">
                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() => onEditOption(question, option)}
                                          aria-label={messages.common.edit}
                                          title={messages.common.edit}
                                          className="text-muted-foreground hover:text-foreground"
                                        >
                                          <Pencil className="h-3 w-3" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => onDeleteOption(option)}
                                          aria-label={messages.common.delete}
                                          title={messages.common.delete}
                                          className="text-muted-foreground hover:text-destructive"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
