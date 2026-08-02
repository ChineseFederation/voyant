import { HeadContent, Scripts } from "@tanstack/react-router"
import { adminChromeMessages } from "@voyant-travel/i18n"
import { Button, Toaster } from "@voyant-travel/ui/components"
import { Alert, AlertDescription, AlertTitle } from "@voyant-travel/ui/components/alert"
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@voyant-travel/ui/components/empty"
import { RefreshCcw } from "lucide-react"
import type { ReactNode } from "react"

import { ThemeProvider } from "../providers/theme.js"

export interface AdminRootHeadOptions {
  /** Document/OG title. */
  title: string
  description?: string
  faviconHref?: string
  themeColor?: string
  /** Extra meta tags appended after the defaults. */
  meta?: Array<Record<string, string>>
  /** Extra link tags appended after the favicon. */
  links?: Array<Record<string, string>>
}

/**
 * Inline browser bootstrap, run before module scripts and hydration. It opts
 * Zod out of its optional `new Function` optimization so admin apps can use a
 * strict CSP, then applies theme and language without a first-paint flash.
 * Load-bearing: keep in sync with the ThemeProvider storage key (`theme`) and
 * locale storage key (`admin-locale`).
 */
const ADMIN_BOOTSTRAP_SCRIPT = `(function(){globalThis.__zod_globalConfig=Object.assign({},globalThis.__zod_globalConfig,{jitless:true});var t=localStorage.getItem("theme");if(t==="dark"||(!t||t==="system")&&matchMedia("(prefers-color-scheme:dark)").matches){document.documentElement.classList.add("dark")}var l=localStorage.getItem("admin-locale")||(navigator.language||"en");l=l.toLowerCase().split("-")[0];document.documentElement.lang=l==="ro"?"ro":"en"})()`

/**
 * The root route `head()` payload for a Voyant admin app: charset/viewport,
 * robots noindex, OG basics, favicon, and the pre-hydration browser
 * bootstrap script.
 */
export function adminRootHead(options: AdminRootHeadOptions) {
  const { title, description, faviconHref = "/fav128.png", themeColor = "#ffffff" } = options

  return {
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "robots", content: "noindex,nofollow" },
      ...(description ? [{ name: "description", content: description }] : []),
      { name: "theme-color", content: themeColor },
      { property: "og:title", content: title },
      { property: "og:type", content: "website" },
      { title },
      ...(options.meta ?? []),
    ],
    links: [{ rel: "icon", type: "image/png", href: faviconHref }, ...(options.links ?? [])],
    scripts: [{ children: ADMIN_BOOTSTRAP_SCRIPT }],
  }
}

/**
 * The SSR'd document shell (`shellComponent` on the root route): bare
 * html/head/body with head content and router scripts. `suppressHydrationWarning`
 * because the bootstrap script mutates `documentElement` before hydration.
 */
export function AdminRootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased" suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

export interface AdminRootErrorBoundaryProps {
  error: unknown
  reset: () => void
  /** Fallback copy when the error has no usable message. */
  fallbackMessage?: string
  homeHref?: string
}

/**
 * Root error boundary. TanStack Router's `errorComponent` replaces the root
 * component entirely, so the app's provider tree (ThemeProvider etc.) isn't
 * above us — mount a local ThemeProvider so <Toaster />'s useTheme() call
 * doesn't crash the boundary.
 */
export function AdminRootErrorBoundary({
  error,
  reset,
  fallbackMessage = adminChromeMessages.en.somethingWentWrongDetail,
  homeHref = "/",
}: AdminRootErrorBoundaryProps) {
  const message = error instanceof Error && error.message ? error.message : fallbackMessage

  return (
    <ThemeProvider defaultTheme="system" storageKey="theme">
      <div className="flex min-h-screen items-center justify-center p-6">
        <Empty className="max-w-xl border border-border bg-card p-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <RefreshCcw className="size-5" />
            </EmptyMedia>
            <EmptyTitle>{adminChromeMessages.en.somethingWentWrong}</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Alert variant="destructive" className="text-left">
              <AlertTitle>{adminChromeMessages.en.requestFailed}</AlertTitle>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
            <div className="flex items-center gap-3">
              <Button onClick={() => reset()}>{adminChromeMessages.en.retry}</Button>
              <Button variant="outline" onClick={() => window.location.assign(homeHref)}>
                {adminChromeMessages.en.goToDashboard}
              </Button>
            </div>
          </EmptyContent>
        </Empty>
        <Toaster />
      </div>
    </ThemeProvider>
  )
}
