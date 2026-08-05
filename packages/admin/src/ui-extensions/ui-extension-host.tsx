"use client"

import {
  ADMIN_UI_EXTENSION_API_VERSION,
  capUiExtensionToastMessage,
  clampUiExtensionHeight,
  createContextMessage,
  createErrorMessage,
  createInitMessage,
  createTokenMessage,
  isNavigateMessage,
  isReadyMessage,
  isRequestTokenMessage,
  isResizeMessage,
  isToastMessage,
  type UiExtensionContext,
  type UiExtensionDescriptor,
  type UiExtensionToastIntent,
} from "@voyant-travel/admin-extension-sdk"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@voyant-travel/ui/components/card"
import { Skeleton } from "@voyant-travel/ui/components/skeleton"
import { cn } from "@voyant-travel/ui/lib/utils"
import { Component, type ReactNode, useEffect, useMemo, useRef, useState } from "react"

import { useAdminExtensionAnalytics } from "../analytics.js"
import { useOperatorAdminI18n } from "../providers/operator-admin-messages.js"
import { isUiExtensionCompatible } from "./compat.js"

/** A short-lived admin session token the host delivers in answer to `request-token`. */
export interface UiExtensionSessionTokenGrant {
  token: string
  tokenId: string
  /** Expiry as epoch milliseconds. */
  expiresAt: number
}

/**
 * Broker a session token for a frame. Resolves with a grant to deliver, or
 * `null` to answer `unavailable` (issuance declined). The host binds the
 * current entity/slot context; the callback maps it to an installation and
 * mints a token via the apps module. Absence answers `not-supported`.
 */
export type UiExtensionRequestTokenHandler = () => Promise<UiExtensionSessionTokenGrant | null>

/** Sandbox tokens the frame is allowed — never `allow-same-origin`. */
const UI_EXTENSION_SANDBOX = "allow-scripts allow-forms allow-popups"
/** Handshake budget before the host degrades to an error card. */
const UI_EXTENSION_HANDSHAKE_TIMEOUT_MS = 10_000
/** Height the frame reserves while loading so a lazy iframe still fetches. */
const UI_EXTENSION_LOADING_HEIGHT = 96

export interface UiExtensionHostProps {
  descriptor: UiExtensionDescriptor
  slot: string
  context: UiExtensionContext
  /** Invoked when the extension requests navigation to a relative admin path. */
  onNavigate?: (to: string) => void
  /** Invoked when the extension raises a toast (message already length-capped). */
  onToast?: (intent: UiExtensionToastIntent, message: string) => void
  /**
   * Broker for the reserved `request-token` message. When omitted the host
   * answers `not-supported`, preserving the prior behavior for hosts without a
   * session-token backend.
   */
  onRequestToken?: UiExtensionRequestTokenHandler
  className?: string
  /**
   * Render as a full-page extension (app-owned admin route) instead of a slot
   * widget: the frame fills the available height and is not resize-driven.
   */
  fill?: boolean
  /** Handshake timeout override, primarily for tests. */
  timeoutMs?: number
}

/**
 * Whether `to` is a relative admin path safe to navigate to. Rejects absolute
 * URLs, protocol-relative (`//host`), scheme-bearing, and backslash paths so a
 * hostile frame cannot redirect the operator off the admin.
 */
function isRelativeAdminPath(to: unknown): to is string {
  if (typeof to !== "string" || to.length === 0) return false
  if (!to.startsWith("/")) return false
  if (to.startsWith("//")) return false
  if (to.includes("\\")) return false
  if (to.includes("://")) return false
  return true
}

function UiExtensionStateCard({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: string
  children?: ReactNode
  className?: string
}) {
  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      {children ? <CardContent>{children}</CardContent> : null}
    </Card>
  )
}

function UiExtensionLoadingCard({
  displayName,
  description,
}: {
  displayName: string
  description: string
}) {
  return (
    <UiExtensionStateCard title={displayName} description={description}>
      <div className="space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </UiExtensionStateCard>
  )
}

function UiExtensionErrorCard({
  displayName,
  description,
}: {
  displayName: string
  description: string
}) {
  return (
    <UiExtensionStateCard
      title={displayName}
      description={description}
      className="border-destructive/40"
    />
  )
}

function UiExtensionIncompatibleCard({
  descriptor,
  description,
}: {
  descriptor: UiExtensionDescriptor
  description: string
}) {
  return <UiExtensionStateCard title={descriptor.displayName} description={description} />
}

type FrameStatus = "loading" | "ready" | "error"

function UiExtensionFrame({
  descriptor,
  slot,
  context,
  onNavigate,
  onToast,
  onRequestToken,
  className,
  fill = false,
  timeoutMs = UI_EXTENSION_HANDSHAKE_TIMEOUT_MS,
}: UiExtensionHostProps) {
  const { messages } = useOperatorAdminI18n()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [status, setStatus] = useState<FrameStatus>("loading")
  const [height, setHeight] = useState<number>()

  // Keep the latest context/handlers/config available to the message listener
  // without re-subscribing it on every render.
  const contextRef = useRef(context)
  contextRef.current = context
  const onNavigateRef = useRef(onNavigate)
  onNavigateRef.current = onNavigate
  const onToastRef = useRef(onToast)
  onToastRef.current = onToast
  const onRequestTokenRef = useRef(onRequestToken)
  onRequestTokenRef.current = onRequestToken
  const configRef = useRef(descriptor.config)
  configRef.current = descriptor.config

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional -- owner: admin; descriptor.entryUrl re-runs the handshake when the frame source changes, and context/handlers/config are read via refs so they don't re-fire it
  useEffect(() => {
    let ready = false
    setStatus("loading")
    setHeight(undefined)

    const timer = window.setTimeout(() => {
      if (!ready) setStatus("error")
    }, timeoutMs)

    function handleMessage(event: MessageEvent) {
      const frame = iframeRef.current
      const source = frame?.contentWindow
      if (!source || event.source !== source) return

      if (isReadyMessage(event.data)) {
        ready = true
        window.clearTimeout(timer)
        setStatus("ready")
        source.postMessage(
          createInitMessage({
            apiVersion: ADMIN_UI_EXTENSION_API_VERSION,
            slot,
            context: contextRef.current,
            config: configRef.current ?? {},
          }),
          "*",
        )
        return
      }
      if (isResizeMessage(event.data)) {
        setHeight(clampUiExtensionHeight(event.data.payload.height))
        return
      }
      if (isNavigateMessage(event.data)) {
        const { to } = event.data.payload
        if (isRelativeAdminPath(to)) onNavigateRef.current?.(to)
        return
      }
      if (isToastMessage(event.data)) {
        onToastRef.current?.(
          event.data.payload.intent,
          capUiExtensionToastMessage(event.data.payload.message),
        )
        return
      }
      if (isRequestTokenMessage(event.data)) {
        const requestId = event.data.payload?.requestId
        const handler = onRequestTokenRef.current
        if (!handler) {
          source.postMessage(createErrorMessage("not-supported", requestId), "*")
          return
        }
        // The token flows only to the exact document that requested it. The
        // grant can be exchanged for online app access, so if the frame
        // navigated or reloaded before the broker settled (its contentWindow
        // no longer equals the requester) the reply is dropped rather than
        // posted to a different document. A slow or failed broker degrades to
        // `unavailable` and never blocks the host.
        const requester = source
        const postToRequester = (message: unknown) => {
          if (iframeRef.current?.contentWindow !== requester) return
          requester.postMessage(message, "*")
        }
        handler()
          .then((grant) => {
            postToRequester(
              grant
                ? createTokenMessage({ ...grant, requestId })
                : createErrorMessage("unavailable", requestId),
            )
          })
          .catch(() => {
            postToRequester(createErrorMessage("unavailable", requestId))
          })
      }
    }

    window.addEventListener("message", handleMessage)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener("message", handleMessage)
    }
  }, [slot, timeoutMs, descriptor.entryUrl])

  // Reported on `ready`, not on mount: a frame that never completes the
  // handshake was never opened, and counting it would hide exactly the
  // extensions that are broken.
  useAdminExtensionAnalytics(descriptor.key, status === "ready")

  // Forward context updates once the handshake has completed.
  useEffect(() => {
    if (status !== "ready") return
    iframeRef.current?.contentWindow?.postMessage(createContextMessage(context), "*")
  }, [context, status])

  if (status === "error") {
    return (
      <UiExtensionErrorCard
        displayName={descriptor.displayName}
        description={messages.extensionLoadFailed}
      />
    )
  }

  // The frame stays laid out (not `sr-only`) while loading — a hidden,
  // zero-area `loading="lazy"` iframe would never fetch and so never complete
  // the handshake. The loading card is overlaid until the frame is ready.
  // A full-page extension fills the available height instead of following the
  // frame's self-reported resize height.
  const frameHeight = fill
    ? "100%"
    : status === "ready"
      ? (height ?? 0)
      : UI_EXTENSION_LOADING_HEIGHT

  return (
    <div
      className={cn("relative w-full", fill && "h-full min-h-[480px]", className)}
      data-slot="ui-extension-host"
    >
      <iframe
        ref={iframeRef}
        src={descriptor.entryUrl}
        title={descriptor.displayName}
        sandbox={UI_EXTENSION_SANDBOX}
        referrerPolicy="no-referrer"
        loading="lazy"
        className="block w-full border-0"
        style={{ height: frameHeight }}
      />
      {status === "loading" ? (
        <div className="absolute inset-0" data-slot="ui-extension-loading">
          <UiExtensionLoadingCard
            displayName={descriptor.displayName}
            description={messages.extensionLoading}
          />
        </div>
      ) : null}
    </div>
  )
}

class UiExtensionErrorBoundary extends Component<
  { displayName: string; errorDescription: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.warn("[voyant-admin] UI extension host crashed", error)
  }

  render() {
    if (this.state.failed) {
      return (
        <UiExtensionErrorCard
          displayName={this.props.displayName}
          description={this.props.errorDescription}
        />
      )
    }
    return this.props.children
  }
}

/**
 * Host side of the admin UI-extension protocol.
 *
 * Renders a descriptor into a sandboxed iframe, performs the `postMessage`
 * handshake, and mediates the extension's small action surface
 * (navigate/toast/resize). A render-time compatibility check is authoritative:
 * an incompatible descriptor renders a quiet card and never mounts the frame.
 * The whole host is wrapped in an error boundary so a failed or slow extension
 * can never break the surrounding admin.
 */
export function UiExtensionHost(props: UiExtensionHostProps) {
  const { formatMessage, messages } = useOperatorAdminI18n()
  const compatible = useMemo(
    () => isUiExtensionCompatible(props.descriptor.extensionApi),
    [props.descriptor.extensionApi],
  )

  if (!compatible) {
    return (
      <UiExtensionIncompatibleCard
        descriptor={props.descriptor}
        description={formatMessage(messages.extensionIncompatible, {
          required: props.descriptor.extensionApi,
          provided: ADMIN_UI_EXTENSION_API_VERSION,
        })}
      />
    )
  }

  return (
    <UiExtensionErrorBoundary
      displayName={props.descriptor.displayName}
      errorDescription={messages.extensionLoadFailed}
    >
      <UiExtensionFrame {...props} />
    </UiExtensionErrorBoundary>
  )
}
