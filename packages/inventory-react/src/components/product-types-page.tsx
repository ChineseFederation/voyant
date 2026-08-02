"use client"

import {
  Badge,
  Button,
  confirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Switch,
  Textarea,
} from "@voyant-travel/ui/components"
import { cn } from "@voyant-travel/ui/lib/utils"
import { zodResolver } from "@voyant-travel/ui/lib/zod-resolver"
import { Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod/v4"
import { useProductsUiMessagesOrDefault } from "../i18n/index.js"
import type { ProductsUiMessages } from "../i18n/messages.js"
import { type ProductTypeRecord, useProductTypeMutation, useProductTypes } from "../index.js"

const DEFAULT_PAGE_SIZE = 25

type ProductTypesPageMessages = ProductsUiMessages["productTypesPage"]

export interface ProductTypesPageProps {
  pageSize?: number
  className?: string
}

function getFormSchema(messages: ProductTypesPageMessages) {
  return z.object({
    name: z.string().min(1, messages.validation.nameRequired).max(255),
    code: z
      .string()
      .min(1, messages.validation.codeRequired)
      .max(100)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, messages.validation.codeRequired),
    description: z.string().optional().nullable(),
    sortOrder: z.coerce.number().int().default(0),
    active: z.boolean().default(true),
  })
}

type FormSchema = ReturnType<typeof getFormSchema>
type FormValues = z.input<FormSchema>
type FormOutput = z.output<FormSchema>

export function ProductTypesPage({
  pageSize = DEFAULT_PAGE_SIZE,
  className,
}: ProductTypesPageProps = {}) {
  const messages = useProductsUiMessagesOrDefault()
  const pageMessages = messages.productTypesPage
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<ProductTypeRecord | undefined>()
  const [pageIndex, setPageIndex] = useState(0)
  const { data, isPending, refetch } = useProductTypes({
    limit: pageSize,
    offset: pageIndex * pageSize,
  })
  const { remove } = useProductTypeMutation()

  const items = data?.data ?? []
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div data-slot="product-types-page" className={cn("flex flex-col gap-6", className)}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{pageMessages.title}</h2>
          <p className="text-sm text-muted-foreground">{pageMessages.description}</p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(undefined)
            setSheetOpen(true)
          }}
        >
          <Plus className="mr-1.5 size-3.5" />
          {pageMessages.addType}
        </Button>
      </div>

      {isPending ? (
        <ProductTypesListLoading loadingLabel={messages.common.loading} />
      ) : (
        <div className="rounded-md border bg-card text-card-foreground shadow-sm">
          {items.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">{pageMessages.empty}</p>
          ) : (
            <div className="flex flex-col divide-y">
              {items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-4 px-6 py-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{item.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{item.code}</span>
                      {!item.active ? (
                        <Badge variant="secondary" className="text-xs">
                          {messages.common.inactive}
                        </Badge>
                      ) : null}
                    </div>
                    {item.description ? (
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    ) : null}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8 text-muted-foreground">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setEditing(item)
                          setSheetOpen(true)
                        }}
                      >
                        <Pencil className="size-4" />
                        {pageMessages.edit}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={async () => {
                          if (
                            await confirmDialog({
                              description: pageMessages.deleteConfirm,
                              destructive: true,
                            })
                          ) {
                            remove.mutate(item.id, { onSuccess: () => void refetch() })
                          }
                        }}
                      >
                        <Trash2 className="size-4" />
                        {pageMessages.delete}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {pageMessages.showingSummary
            .replace("{count}", String(items.length))
            .replace("{total}", String(total))}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pageIndex === 0}
            onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
          >
            {messages.common.previous}
          </Button>
          <span>
            {messages.common.page} {pageIndex + 1} / {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={(pageIndex + 1) * pageSize >= total}
            onClick={() => setPageIndex((current) => current + 1)}
          >
            {messages.common.next}
          </Button>
        </div>
      </div>

      <ProductTypeSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        item={editing}
        onSuccess={() => {
          setSheetOpen(false)
          setEditing(undefined)
          void refetch()
        }}
      />
    </div>
  )
}

function ProductTypesListLoading({ loadingLabel }: { loadingLabel: string }) {
  return (
    <div className="rounded-md border bg-card text-card-foreground shadow-sm">
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        {loadingLabel}
      </div>
    </div>
  )
}

function ProductTypeSheet({
  open,
  onOpenChange,
  item,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: ProductTypeRecord
  onSuccess: () => void
}) {
  const messages = useProductsUiMessagesOrDefault().productTypesPage
  const { create, update } = useProductTypeMutation()
  const formSchema = useMemo(() => getFormSchema(messages), [messages])

  const form = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      code: "",
      description: "",
      sortOrder: 0,
      active: true,
    },
  })

  useEffect(() => {
    if (open && item) {
      form.reset({
        name: item.name,
        code: item.code,
        description: item.description ?? "",
        sortOrder: item.sortOrder,
        active: item.active,
      })
    } else if (open) {
      form.reset()
    }
  }, [open, item, form])

  const isSubmitting = create.isPending || update.isPending

  const onSubmit = async (values: FormOutput) => {
    const editableFields = {
      name: values.name,
      description: values.description || null,
      sortOrder: values.sortOrder,
      active: values.active,
    }

    if (item) {
      await update.mutateAsync({ id: item.id, input: editableFields })
    } else {
      await create.mutateAsync({ ...editableFields, code: values.code })
    }
    onSuccess()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg">
        <SheetHeader>
          <SheetTitle>{item ? messages.editSheetTitle : messages.newSheetTitle}</SheetTitle>
        </SheetHeader>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <SheetBody className="grid gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>{messages.nameLabel}</Label>
                <Input
                  {...form.register("name")}
                  placeholder={messages.namePlaceholder}
                  autoFocus
                />
                {form.formState.errors.name ? (
                  <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <Label>{messages.codeLabel}</Label>
                <Input
                  {...form.register("code")}
                  placeholder={messages.codePlaceholder}
                  disabled={Boolean(item)}
                />
                {form.formState.errors.code ? (
                  <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>{messages.descriptionLabel}</Label>
              <Textarea
                {...form.register("description")}
                placeholder={messages.descriptionPlaceholder}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>{messages.sortOrderLabel}</Label>
                <Input {...form.register("sortOrder")} type="number" />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch
                  checked={form.watch("active")}
                  onCheckedChange={(checked) => form.setValue("active", checked)}
                />
                <Label>{messages.activeLabel}</Label>
              </div>
            </div>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              {messages.cancel}
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {item ? messages.saveChanges : messages.createType}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
