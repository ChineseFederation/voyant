"use client"

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@voyant-travel/ui/components"
import { Download, Printer } from "lucide-react"

import type { AllocationUiMessages } from "../i18n/index.js"
import { VEHICLE_SEAT_KIND } from "./slot-allocation-model.js"

/**
 * Seat-shaped kinds print as a seating manifest; everything else prints as a
 * rooming list. Mirrors `allocationExportPrefixForKind` on the server so the
 * menu entry and the downloaded filename agree.
 */
export function isSeatingExportKind(kind: string): boolean {
  return kind === VEHICLE_SEAT_KIND || kind === "flight_seat"
}

export interface AllocationExportMenuProps {
  kind: string
  messages: AllocationUiMessages
  onExportPassengers: () => void
  /** Passes the active kind through, so a coach can export its seating list. */
  onExportResources: () => void
  onPrint: () => void
  pending: boolean
}

export function AllocationExportMenu({
  kind,
  messages,
  onExportPassengers,
  onExportResources,
  onPrint,
  pending,
}: AllocationExportMenuProps) {
  const copy = messages.exportMenu

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" disabled={pending} data-slot="allocation-export-menu">
            <Download data-icon="inline-start" aria-hidden="true" />
            {pending ? copy.downloading : copy.label}
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onExportPassengers}>
          {messages.exportPassengers}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onExportResources}>
          {isSeatingExportKind(kind) ? copy.seating : messages.exportRooming}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onPrint}>
          <Printer data-icon="inline-start" aria-hidden="true" />
          {copy.print}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
