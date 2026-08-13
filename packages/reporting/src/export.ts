import ExcelJS from "exceljs"
import { PDFDocument, rgb, StandardFonts } from "pdf-lib"

import type { ReportExport, ReportExportSection } from "./service.js"

export type ReportExportFormat = "csv" | "xlsx" | "pdf"

export const REPORT_EXPORT_CONTENT_TYPES: Record<ReportExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
}

/** A filesystem-safe base name for the downloaded file (no extension). */
export function reportExportFileBase(report: ReportExport): string {
  const slug = report.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug.length > 0 ? slug : "report"
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

type ExportColumn = ReportExportSection["columns"][number]
type ExportFormat = ReportExportSection["format"]

/**
 * Scale a money cell to major units. The widget's own option wins where the
 * author set it; otherwise the column's declaration from its dataset is used, so
 * a custom widget that never opened the inspector still exports at the right
 * scale.
 */
function toMajorUnits(value: unknown, column: ExportColumn, format: ExportFormat): number | null {
  const numeric = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(numeric)) return null
  return (format?.minorUnit ?? column.minorUnit) ? numeric / 100 : numeric
}

/**
 * Spreadsheet cell: currency amounts become major-unit NUMBERS (so Excel can sum
 * them), everything else stays raw. The currency code lives in its own column, so
 * no symbol is embedded here.
 */
function numericCell(
  value: unknown,
  column: ExportColumn,
  format: ExportFormat,
): number | boolean | string {
  if (column.valueType === "currency") {
    const major = toMajorUnits(value, column, format)
    return major ?? cellText(value)
  }
  if (typeof value === "number" || typeof value === "boolean") return value
  return cellText(value)
}

/**
 * Presentation cell (PDF): currency formatted with the row's own currency
 * symbol. When neither the widget nor the column says which currency the row is
 * in, the amount is written as a plain number — a symbol borrowed from a default
 * would make it read as an amount it is not.
 */
function displayCell(
  value: unknown,
  column: ExportColumn,
  format: ExportFormat,
  row: Record<string, unknown>,
): string {
  if (value === null || value === undefined) return ""
  if (column.valueType === "currency") {
    const major = toMajorUnits(value, column, format)
    if (major === null) return cellText(value)
    const currencyField = format?.currencyField ?? column.currencyField
    const perRow = currencyField ? row[currencyField] : undefined
    const currency = (typeof perRow === "string" && perRow) || format?.currency
    if (!currency) return major.toLocaleString("en-US")
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(major)
    } catch {
      return major.toLocaleString("en-US")
    }
  }
  return cellText(value)
}

// ── CSV ─────────────────────────────────────────────────────────────────────

function csvField(value: unknown): string {
  const text = cellText(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function reportToCsv(report: ReportExport): string {
  const lines: string[] = []
  report.sections.forEach((section, index) => {
    if (index > 0) lines.push("")
    lines.push(csvField(section.title))
    if (section.error) {
      lines.push(csvField(`No data — ${section.error}`))
      return
    }
    lines.push(section.columns.map((column) => csvField(column.label)).join(","))
    for (const row of section.rows) {
      lines.push(
        section.columns
          .map((column) => csvField(numericCell(row[column.id], column, section.format)))
          .join(","),
      )
    }
  })
  // Excel opens UTF-8 CSV correctly only with a BOM.
  return `﻿${lines.join("\r\n")}\r\n`
}

// ── XLSX ────────────────────────────────────────────────────────────────────

function worksheetName(title: string, index: number): string {
  // Excel sheet names: ≤31 chars, none of : \ / ? * [ ].
  const cleaned = title.replace(/[:\\/?*[\]]/g, " ").trim() || `Sheet ${index + 1}`
  return cleaned.slice(0, 31)
}

export async function reportToXlsx(report: ReportExport): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Voyant Reporting"
  const usedNames = new Set<string>()
  report.sections.forEach((section, index) => {
    let name = worksheetName(section.title, index)
    while (usedNames.has(name)) name = worksheetName(`${section.title} ${index + 1}`, index)
    usedNames.add(name)
    const sheet = workbook.addWorksheet(name)
    if (section.error) {
      sheet.addRow([`No data — ${section.error}`])
      return
    }
    const header = sheet.addRow(section.columns.map((column) => column.label))
    header.font = { bold: true }
    for (const row of section.rows) {
      sheet.addRow(
        section.columns.map((column) => numericCell(row[column.id], column, section.format)),
      )
    }
    sheet.columns.forEach((column) => {
      column.width = 22
    })
  })
  if (report.sections.length === 0) workbook.addWorksheet("Report")
  const buffer = await workbook.xlsx.writeBuffer()
  return new Uint8Array(buffer)
}

// ── PDF ─────────────────────────────────────────────────────────────────────

const PDF_MARGIN = 48
const PDF_ROW_HEIGHT = 18
const PDF_FONT_SIZE = 9

export async function reportToPdf(report: ReportExport): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const muted = rgb(0.42, 0.42, 0.45)
  const ink = rgb(0.1, 0.1, 0.12)

  let page = doc.addPage()
  let { width, height } = page.getSize()
  let cursorY = height - PDF_MARGIN

  const ensureSpace = (needed: number) => {
    if (cursorY - needed < PDF_MARGIN) {
      page = doc.addPage()
      ;({ width, height } = page.getSize())
      cursorY = height - PDF_MARGIN
    }
  }
  const truncate = (text: string, cellFont: typeof font, size: number, maxWidth: number) => {
    if (cellFont.widthOfTextAtSize(text, size) <= maxWidth) return text
    let out = text
    while (out.length > 1 && cellFont.widthOfTextAtSize(`${out}…`, size) > maxWidth) {
      out = out.slice(0, -1)
    }
    return `${out}…`
  }

  page.drawText(truncate(report.name, bold, 18, width - PDF_MARGIN * 2), {
    x: PDF_MARGIN,
    y: cursorY,
    size: 18,
    font: bold,
    color: ink,
  })
  cursorY -= 26
  if (report.description) {
    page.drawText(truncate(report.description, font, 10, width - PDF_MARGIN * 2), {
      x: PDF_MARGIN,
      y: cursorY,
      size: 10,
      font,
      color: muted,
    })
    cursorY -= 20
  }

  for (const section of report.sections) {
    ensureSpace(PDF_ROW_HEIGHT * 2)
    cursorY -= 12
    page.drawText(truncate(section.title, bold, 12, width - PDF_MARGIN * 2), {
      x: PDF_MARGIN,
      y: cursorY,
      size: 12,
      font: bold,
      color: ink,
    })
    cursorY -= PDF_ROW_HEIGHT
    drawSectionTable(section, {
      page,
      addPage: () => {
        page = doc.addPage()
        ;({ width, height } = page.getSize())
        cursorY = height - PDF_MARGIN
        return page
      },
      font,
      bold,
      muted,
      ink,
      widthOf: () => width,
      getY: () => cursorY,
      setY: (y) => {
        cursorY = y
      },
      truncate,
    })
  }

  return doc.save()
}

interface PdfContext {
  page: Awaited<ReturnType<PDFDocument["addPage"]>>
  addPage: () => PdfContext["page"]
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>
  bold: PdfContext["font"]
  muted: ReturnType<typeof rgb>
  ink: ReturnType<typeof rgb>
  widthOf: () => number
  getY: () => number
  setY: (y: number) => void
  truncate: (text: string, font: PdfContext["font"], size: number, maxWidth: number) => string
}

function drawSectionTable(section: ReportExportSection, ctx: PdfContext) {
  let page = ctx.page
  const width = ctx.widthOf()
  const usableWidth = width - PDF_MARGIN * 2

  if (section.error) {
    ctx.page.drawText(ctx.truncate(`No data — ${section.error}`, ctx.font, 9, usableWidth), {
      x: PDF_MARGIN,
      y: ctx.getY(),
      size: 9,
      font: ctx.font,
      color: ctx.muted,
    })
    ctx.setY(ctx.getY() - PDF_ROW_HEIGHT)
    return
  }
  if (section.columns.length === 0) return

  const colWidth = usableWidth / section.columns.length
  const drawRow = (
    values: string[],
    rowFont: PdfContext["font"],
    color: ReturnType<typeof rgb>,
  ) => {
    if (ctx.getY() - PDF_ROW_HEIGHT < PDF_MARGIN) {
      page = ctx.addPage()
    }
    const y = ctx.getY()
    values.forEach((value, index) => {
      page.drawText(ctx.truncate(value, rowFont, PDF_FONT_SIZE, colWidth - 6), {
        x: PDF_MARGIN + index * colWidth,
        y,
        size: PDF_FONT_SIZE,
        font: rowFont,
        color,
      })
    })
    ctx.setY(y - PDF_ROW_HEIGHT)
  }

  drawRow(
    section.columns.map((column) => column.label),
    ctx.bold,
    ctx.ink,
  )
  for (const row of section.rows) {
    drawRow(
      section.columns.map((column) => displayCell(row[column.id], column, section.format, row)),
      ctx.font,
      ctx.ink,
    )
  }
  if (section.rows.length === 0) {
    drawRow(["No rows for the selected period."], ctx.font, ctx.muted)
  }
}
