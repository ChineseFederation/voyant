import { Button, Column, Row, Section, Text } from "@react-email/components"

import { buildAdminUrl, cornerRadiusToPx, readableTextOn, type StaffAlertBrand } from "./brand.js"

const TEXT = "#16181d"
const MUTED = "#6b7280"
const BORDER = "#e4e6ea"
const SUBTLE_BACKGROUND = "#f8f9fb"

/**
 * The headline figure of an alert — an amount, a booking total.
 *
 * Rendered large because the whole point of a staff alert is that the recipient
 * can triage it from the notification preview without opening anything.
 */
export function StatBlock({
  value,
  caption,
  brand,
}: {
  value: string
  caption?: string | null
  brand: StaffAlertBrand
}) {
  return (
    <Section
      style={{
        backgroundColor: SUBTLE_BACKGROUND,
        borderRadius: cornerRadiusToPx(brand.cornerRadius),
        padding: "16px 18px",
        marginBottom: "18px",
      }}
    >
      <Text
        style={{
          margin: 0,
          fontSize: "26px",
          lineHeight: "32px",
          fontWeight: 700,
          color: TEXT,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </Text>
      {caption ? (
        <Text style={{ margin: "4px 0 0", fontSize: "13px", color: MUTED }}>{caption}</Text>
      ) : null}
    </Section>
  )
}

/**
 * One label/value line of the detail list.
 *
 * Two columns rather than a definition list: Outlook collapses `<dl>` margins
 * unpredictably, and a row keeps label and value aligned at any width.
 */
export function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <Row style={{ borderBottom: `1px solid ${BORDER}` }}>
      <Column style={{ padding: "9px 0", verticalAlign: "top", width: "38%" }}>
        <Text style={{ margin: 0, fontSize: "13px", color: MUTED }}>{label}</Text>
      </Column>
      <Column style={{ padding: "9px 0", verticalAlign: "top" }}>
        <Text style={{ margin: 0, fontSize: "13px", color: TEXT, fontWeight: 500 }}>{value}</Text>
      </Column>
    </Row>
  )
}

export function DetailList({ children }: { children: React.ReactNode }) {
  return <Section style={{ marginBottom: "22px" }}>{children}</Section>
}

/** Primary action. One per email — a staff alert has exactly one next step. */
export function CTAButton({
  brand,
  adminPath,
  label,
}: {
  brand: StaffAlertBrand
  adminPath: string
  label: string
}) {
  return (
    <Button
      href={buildAdminUrl(brand, adminPath)}
      style={{
        backgroundColor: brand.brandColor,
        color: readableTextOn(brand.brandColor),
        borderRadius: cornerRadiusToPx(brand.cornerRadius),
        fontSize: "14px",
        fontWeight: 600,
        padding: "11px 20px",
        textDecoration: "none",
        display: "inline-block",
      }}
    >
      {label}
    </Button>
  )
}

/** Short emphasised aside, e.g. "this booking is now paid in full". */
export function Callout({ text, brand }: { text: string; brand: StaffAlertBrand }) {
  return (
    <Section
      style={{
        borderLeft: `3px solid ${brand.brandColor}`,
        padding: "2px 0 2px 12px",
        marginBottom: "18px",
      }}
    >
      <Text style={{ margin: 0, fontSize: "13px", lineHeight: "20px", color: TEXT }}>{text}</Text>
    </Section>
  )
}
