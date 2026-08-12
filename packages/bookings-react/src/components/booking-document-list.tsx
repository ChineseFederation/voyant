"use client"

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  confirmDialog,
} from "@voyant-travel/ui/components"
import { ExternalLink, FileText, Plus, Trash2 } from "lucide-react"
import * as React from "react"
import { useBookingsUiI18nOrDefault, useBookingsUiMessagesOrDefault } from "../i18n/provider.js"
import {
  type BookingTravelerRecord,
  useBookingTravelerDocumentMutation,
  useBookingTravelerDocuments,
  useTravelers,
} from "../index.js"
import { BookingDocumentDialog } from "./booking-document-dialog.js"

const typeVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  visa: "default",
  insurance: "secondary",
  health: "secondary",
  passport_copy: "outline",
  other: "outline",
}

export interface BookingDocumentListProps {
  bookingId: string
}

export function BookingDocumentList({ bookingId }: BookingDocumentListProps) {
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const { data } = useBookingTravelerDocuments(bookingId)
  const { data: travelersData } = useTravelers(bookingId)
  const { remove } = useBookingTravelerDocumentMutation(bookingId)
  const { formatDate } = useBookingsUiI18nOrDefault()
  const messages = useBookingsUiMessagesOrDefault()

  const documents = data?.data ?? []
  const travelers = travelersData?.data ?? []

  const travelerMap = new Map<string, BookingTravelerRecord>()
  for (const traveler of travelers) {
    travelerMap.set(traveler.id, traveler)
  }

  return (
    <Card data-slot="booking-document-list">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          {messages.bookingDocumentList.title}
        </CardTitle>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {messages.bookingDocumentList.addDocument}
        </Button>
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {messages.bookingDocumentList.empty}
          </p>
        ) : (
          <div className="overflow-x-auto rounded border bg-background">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="p-2 text-left font-medium">
                    {messages.bookingDocumentList.columns.type}
                  </th>
                  <th className="p-2 text-left font-medium">
                    {messages.bookingDocumentList.columns.file}
                  </th>
                  <th className="p-2 text-left font-medium">
                    {messages.bookingDocumentList.columns.traveler}
                  </th>
                  <th className="p-2 text-left font-medium">
                    {messages.bookingDocumentList.columns.expires}
                  </th>
                  <th className="p-2 text-left font-medium">
                    {messages.bookingDocumentList.columns.notes}
                  </th>
                  <th className="w-20 p-2" />
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => {
                  const traveler = doc.travelerId ? travelerMap.get(doc.travelerId) : undefined
                  return (
                    <tr key={doc.id} className="border-b last:border-b-0">
                      <td className="p-2">
                        <Badge variant={typeVariant[doc.type] ?? "outline"}>
                          {messages.bookingDocumentDialog.documentTypeLabels[doc.type]}
                        </Badge>
                      </td>
                      <td className="p-2">
                        <a
                          href={doc.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 hover:underline"
                        >
                          {doc.fileName}
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </a>
                      </td>
                      <td className="p-2">
                        {traveler
                          ? `${traveler.firstName} ${traveler.lastName}`
                          : doc.travelerId
                            ? doc.travelerId
                            : messages.bookingDocumentList.values.travelerUnavailable}
                      </td>
                      <td className="p-2">
                        {doc.expiresAt
                          ? formatDate(doc.expiresAt)
                          : messages.bookingDocumentList.values.expiresUnavailable}
                      </td>
                      <td className="max-w-[200px] truncate p-2 text-muted-foreground">
                        {doc.notes ?? messages.bookingDocumentList.values.notesUnavailable}
                      </td>
                      <td className="p-2">
                        <button
                          type="button"
                          onClick={async () => {
                            if (
                              await confirmDialog({
                                description: messages.bookingDocumentList.actions.deleteConfirm,
                                destructive: true,
                              })
                            ) {
                              remove.mutate(doc.id)
                            }
                          }}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <BookingDocumentDialog open={dialogOpen} onOpenChange={setDialogOpen} bookingId={bookingId} />
    </Card>
  )
}
