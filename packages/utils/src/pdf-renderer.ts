import { PDFDocument, rgb, StandardFonts } from "pdf-lib"

export type PdfContentFormat = "text" | "html" | "markdown" | "lexical_json"

export interface RenderPdfDocumentInput {
  title?: string | null
  content: string
  format?: PdfContentFormat
  metadataLines?: string[]
  fontBytes?: Uint8Array
  fontkit?: Parameters<PDFDocument["registerFontkit"]>[0]
}

function decodeEntities(input: string) {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function stripHtml(input: string) {
  return decodeEntities(
    input
      .replace(/<\/(p|div|section|article|h[1-6]|li|tr)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+\n/g, "\n"),
  )
}

function stripMarkdown(input: string) {
  return input
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/[*_~`>#-]+/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
}

function extractLexicalText(input: string) {
  try {
    const root = JSON.parse(input)
    const parts: string[] = []
    const visit = (node: unknown) => {
      if (!node || typeof node !== "object") return
      if ("text" in node && typeof node.text === "string") {
        parts.push(node.text)
      }
      if ("children" in node && Array.isArray(node.children)) {
        for (const child of node.children) visit(child)
        if ((node as { type?: string }).type === "paragraph") {
          parts.push("\n")
        }
      }
    }
    visit(root)
    return parts.join(" ")
  } catch {
    return input
  }
}

function normalizePdfText(input: string, format: PdfContentFormat) {
  const text =
    format === "html"
      ? stripHtml(input)
      : format === "markdown"
        ? stripMarkdown(input)
        : format === "lexical_json"
          ? extractLexicalText(input)
          : input

  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

function wrapLine(text: string, width: number, measure: (value: string) => number) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ""

  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (measure(next) <= width || !current) {
      current = next
    } else {
      lines.push(current)
      current = word
    }
  }

  if (current) lines.push(current)
  return lines.length > 0 ? lines : [""]
}

export async function renderPdfDocument(input: RenderPdfDocumentInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  if (input.fontBytes) {
    if (!input.fontkit) {
      throw new Error("Custom PDF font bytes require an explicit fontkit runtime.")
    }
    pdfDoc.registerFontkit(input.fontkit)
  }
  const font = input.fontBytes
    ? await pdfDoc.embedFont(input.fontBytes)
    : await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = input.fontBytes ? font : await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const PAGE_WIDTH = 595.28
  const PAGE_HEIGHT = 841.89
  const MARGIN = 48
  const TITLE_SIZE = 18
  const BODY_SIZE = 10
  const LINE_HEIGHT = 14
  const bodyWidth = PAGE_WIDTH - MARGIN * 2
  const measure = (value: string) => font.widthOfTextAtSize(value, BODY_SIZE)

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      y = PAGE_HEIGHT - MARGIN
    }
  }

  const drawLine = (text: string, options?: { bold?: boolean; size?: number }) => {
    const size = options?.size ?? BODY_SIZE
    ensureSpace(LINE_HEIGHT)
    page.drawText(text, {
      x: MARGIN,
      y,
      size,
      font: options?.bold ? bold : font,
      color: rgb(0.12, 0.12, 0.12),
    })
    y -= LINE_HEIGHT
  }

  const title = input.title?.trim()
  if (title) {
    drawLine(title, { bold: true, size: TITLE_SIZE })
    y -= 6
  }

  for (const meta of input.metadataLines ?? []) {
    const trimmed = meta.trim()
    if (!trimmed) continue
    for (const line of wrapLine(trimmed, bodyWidth, measure)) {
      drawLine(line)
    }
  }

  if ((input.metadataLines?.length ?? 0) > 0) {
    y -= 6
  }

  const normalized = normalizePdfText(input.content, input.format ?? "text")
  for (const paragraph of normalized.split(/\n{2,}/)) {
    const lines = paragraph.split("\n").flatMap((line) => wrapLine(line, bodyWidth, measure))
    for (const line of lines) {
      drawLine(line)
    }
    y -= 4
  }

  return pdfDoc.save()
}
