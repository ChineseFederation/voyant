import { useQuery } from "@tanstack/react-query"
import { formatMessage } from "@voyant-travel/i18n"
import { Badge, DropdownMenuItem, DropdownMenuSeparator } from "@voyant-travel/ui/components"
import { Image as MediaImage } from "@voyant-travel/ui/components/image"
import { ChevronDown, ChevronRight, Image as ImageIcon, Pencil, Plus, Trash2 } from "lucide-react"
import { useProductDetailApi, useProductDetailMessages } from "./host.js"
import { ActionMenu } from "./product-detail-sections.js"
import {
  type DayService,
  getProductDayMediaQueryOptions,
  getProductDetailDayServicesQueryOptions,
  type ProductDay,
} from "./product-detail-shared.js"

export interface ProductDetailDayRowProps {
  day: ProductDay
  productId: string
  expanded: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onAddService: () => void
  onEditService: (service: DayService) => void
  onDeleteService: (serviceId: string) => void
}

function getServiceTypeLabel(
  serviceType: DayService["serviceType"],
  messages: ReturnType<typeof useProductDetailMessages>["products"]["operations"]["services"],
) {
  switch (serviceType) {
    case "accommodation":
      return messages.serviceTypeAccommodation
    case "transfer":
      return messages.serviceTypeTransfer
    case "experience":
      return messages.serviceTypeExperience
    case "guide":
      return messages.serviceTypeGuide
    case "meal":
      return messages.serviceTypeMeal
    case "other":
      return messages.serviceTypeOther
    default:
      return serviceType
  }
}

export function ProductDetailDayRow({
  day,
  productId,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onAddService,
  onEditService,
  onDeleteService,
}: ProductDetailDayRowProps) {
  const api = useProductDetailApi()
  const messages = useProductDetailMessages()
  const dayRowMessages = messages.products.operations.dayRows
  const serviceMessages = messages.products.operations.services
  const { data: servicesData } = useQuery({
    ...getProductDetailDayServicesQueryOptions(api, productId, day.id),
    enabled: expanded,
  })

  const { data: dayMediaData } = useQuery(getProductDayMediaQueryOptions(api, productId, day.id))
  const mediaCount = dayMediaData?.data.length ?? 0
  const cover = dayMediaData?.data.find((m) => m.isCover) ?? dayMediaData?.data[0]

  return (
    <div className="rounded-lg border">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {cover?.mediaType === "image" ? (
          <MediaImage
            src={cover.url}
            alt={cover.altText ?? cover.name}
            className="h-10 w-14 flex-shrink-0 rounded object-cover"
            iconClassName="size-4"
          />
        ) : (
          <div className="flex h-10 w-14 flex-shrink-0 items-center justify-center rounded border bg-muted/50 text-muted-foreground">
            <ImageIcon className="h-4 w-4" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium">
            {formatMessage(dayRowMessages.title, { dayNumber: day.dayNumber })}
            {day.title ? `: ${day.title}` : ""}
          </span>
          {day.location ? (
            <span className="ml-2 text-xs text-muted-foreground">{day.location}</span>
          ) : null}
        </div>
        {mediaCount > 0 ? (
          <Badge variant="outline" className="text-[10px]">
            {formatMessage(dayRowMessages.photoCount, {
              count: mediaCount,
              suffix: mediaCount === 1 ? "" : "s",
            })}
          </Badge>
        ) : null}
        <ActionMenu
          label={`${formatMessage(dayRowMessages.title, { dayNumber: day.dayNumber })}${
            day.title ? `: ${day.title}` : ""
          }`}
        >
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            {dayRowMessages.editAction}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onAddService}>
            <Plus className="h-4 w-4" />
            {dayRowMessages.addServiceAction}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
            {dayRowMessages.deleteAction}
          </DropdownMenuItem>
        </ActionMenu>
      </div>

      {expanded ? (
        <div className="border-t">
          {!servicesData?.data || servicesData.data.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              {dayRowMessages.emptyServices}
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30 text-muted-foreground">
                  <th className="py-2 pl-4 pr-3 text-left font-medium">
                    {dayRowMessages.tableName}
                  </th>
                  <th className="px-3 py-2 text-left font-medium">{dayRowMessages.tableType}</th>
                  <th className="px-3 py-2 text-left font-medium">{dayRowMessages.tableCost}</th>
                  <th className="px-3 py-2 text-left font-medium">
                    {dayRowMessages.tableQuantity}
                  </th>
                  <th className="w-10 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {servicesData.data.map((service) => (
                  <tr key={service.id} className="border-b last:border-b-0">
                    <td className="py-2 pl-4 pr-3">{service.name}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-xs capitalize">
                        {getServiceTypeLabel(service.serviceType, serviceMessages)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {(service.costAmountCents / 100).toFixed(2)} {service.costCurrency}
                    </td>
                    <td className="px-3 py-2">{service.quantity}</td>
                    <td className="px-3 py-2">
                      <ActionMenu
                        label={`${service.name}: ${dayRowMessages.editAction} / ${dayRowMessages.deleteAction}`}
                      >
                        <DropdownMenuItem onClick={() => onEditService(service)}>
                          <Pencil className="h-4 w-4" />
                          {dayRowMessages.editAction}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => onDeleteService(service.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                          {dayRowMessages.deleteAction}
                        </DropdownMenuItem>
                      </ActionMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </div>
  )
}
