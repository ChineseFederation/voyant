import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components"
import type { ReactNode } from "react"

import { buildAdminUrl, cornerRadiusToPx, EMAIL_FONT_STACK, type StaffAlertBrand } from "./brand.js"
import type { StaffAlertEmailMessages } from "./messages/index.js"

const PAGE_BACKGROUND = "#f4f5f7"
const CARD_BACKGROUND = "#ffffff"
const BORDER = "#e4e6ea"
const TEXT = "#16181d"
const MUTED = "#6b7280"

export interface StaffAlertLayoutProps {
  brand: StaffAlertBrand
  messages: StaffAlertEmailMessages
  /** Inbox preview line. Distinct from the subject, which repeats in the body. */
  preview: string
  /** Small uppercase label above the headline, naming the event. */
  eyebrow: string
  headline: string
  lead: string
  children: ReactNode
}

/**
 * The shell every staff alert renders into.
 *
 * Table-free layout is deliberate: `@react-email/components` emits the table
 * scaffolding Outlook needs, so hand-rolling one here would double it. All
 * styling is inline because Gmail strips `<style>` blocks from the head.
 */
export function StaffAlertLayout({
  brand,
  messages,
  preview,
  eyebrow,
  headline,
  lead,
  children,
}: StaffAlertLayoutProps) {
  const radius = cornerRadiusToPx(brand.cornerRadius)

  return (
    <Html lang={brand.locale}>
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: PAGE_BACKGROUND,
          fontFamily: EMAIL_FONT_STACK,
          margin: 0,
          padding: "24px 12px",
        }}
      >
        <Container style={{ maxWidth: "600px", margin: "0 auto" }}>
          <Section style={{ paddingBottom: "16px" }}>
            {brand.logoUrl ? (
              <Img
                src={brand.logoUrl}
                alt={brand.operatorName}
                height="28"
                style={{ maxHeight: "28px", width: "auto", display: "block" }}
              />
            ) : (
              <Text
                style={{
                  margin: 0,
                  fontSize: "15px",
                  fontWeight: 700,
                  color: TEXT,
                  letterSpacing: "-0.01em",
                }}
              >
                {brand.operatorName}
              </Text>
            )}
          </Section>

          <Section
            style={{
              backgroundColor: CARD_BACKGROUND,
              border: `1px solid ${BORDER}`,
              borderRadius: radius,
              padding: "28px",
            }}
          >
            <Text
              style={{
                margin: "0 0 10px",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: brand.brandColor,
              }}
            >
              {eyebrow}
            </Text>
            <Text
              style={{
                margin: "0 0 8px",
                fontSize: "22px",
                lineHeight: "29px",
                fontWeight: 700,
                color: TEXT,
                letterSpacing: "-0.02em",
              }}
            >
              {headline}
            </Text>
            <Text
              style={{ margin: "0 0 22px", fontSize: "14px", lineHeight: "21px", color: MUTED }}
            >
              {lead}
            </Text>
            {children}
          </Section>

          <Hr style={{ borderColor: BORDER, margin: "24px 0 14px" }} />

          <Section>
            <Text style={{ margin: "0 0 6px", fontSize: "12px", color: MUTED }}>
              {messages.common.whyReceiving}{" "}
              <Link
                href={buildAdminUrl(brand, "/settings/my-notifications")}
                style={{ color: brand.brandColor, textDecoration: "underline" }}
              >
                {messages.common.managePreferences}
              </Link>
            </Text>
            <Text style={{ margin: 0, fontSize: "12px", color: MUTED }}>
              {messages.common.sentBy(brand.operatorName)}
              {brand.supportEmail ? (
                <>
                  {" · "}
                  <Link
                    href={`mailto:${brand.supportEmail}`}
                    style={{ color: MUTED, textDecoration: "underline" }}
                  >
                    {brand.supportEmail}
                  </Link>
                </>
              ) : null}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
