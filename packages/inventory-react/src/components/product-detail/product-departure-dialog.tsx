import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@voyant-travel/ui/components"
import { useProductDetailMessages } from "./host.js"

import { DepartureForm, type DepartureSlot } from "./product-departure-form.js"

export type { DepartureSlot }

type DepartureDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  productId: string
  durationMinutes?: number | null
  slot?: DepartureSlot
  onSuccess: () => void
}

export function DepartureDialog({
  open,
  onOpenChange,
  productId,
  durationMinutes,
  slot,
  onSuccess,
}: DepartureDialogProps) {
  const messages = useProductDetailMessages()
  const departureMessages = messages.products.operations.departures
  const isEditing = !!slot

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg">
        <SheetHeader>
          <SheetTitle>
            {isEditing ? departureMessages.editTitle : departureMessages.newTitle}
          </SheetTitle>
        </SheetHeader>
        <SheetBody>
          <DepartureForm
            productId={productId}
            durationMinutes={durationMinutes}
            slot={slot}
            onSuccess={onSuccess}
            onCancel={() => onOpenChange(false)}
          />
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}
