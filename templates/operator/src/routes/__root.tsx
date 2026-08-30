import type { QueryClient } from "@tanstack/react-query"
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
  useRouteContext,
} from "@tanstack/react-router"
import { ThemeProvider } from "@voyantjs/admin"
import { Button, Toaster } from "@voyantjs/ui/components"
import { Alert, AlertDescription, AlertTitle } from "@voyantjs/ui/components/alert"
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@voyantjs/ui/components/empty"
import { RefreshCcw } from "lucide-react"
import type { ReactNode } from "react"

import { Providers } from "../components/providers"
import { ApiError } from "../lib/api-client"
import "../styles.css"

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "robots", content: "noindex,nofollow" },
      { name: "description", content: "Voyant operator workspace" },
      { name: "theme-color", content: "#ffffff" },
      { property: "og:title", content: "Voyant" },
      { property: "og:type", content: "website" },
      { title: "Voyant" },
    ],
    links: [{ rel: "icon", type: "image/png", href: "/fav128.png" }],
    scripts: [
      {
        // Inline theme and language detection to prevent flashes before hydration.
        children: `(function(){var t=localStorage.getItem("theme");if(t==="dark"||(!t||t==="system")&&matchMedia("(prefers-color-scheme:dark)").matches){document.documentElement.classList.add("dark")}var l=localStorage.getItem("admin-locale")||(navigator.language||"zh-CN");l=l.toLowerCase();document.documentElement.lang=l.indexOf("zh")===0?"zh-CN":"en"})()`,
      },
    ],
  }),
  // shellComponent is always SSR'd — renders the <html> document shell
  shellComponent: RootShell,
  component: RootComponent,
  errorComponent: RootErrorBoundary,
})

function RootShell({ children }: { children: ReactNode }) {
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

function RootComponent() {
  const queryClient = useRouteContext({
    from: "__root__",
    select: (context) => context.queryClient,
  })

  return (
    <Providers queryClient={queryClient}>
      <Outlet />
      <Toaster />
    </Providers>
  )
}

function RootErrorBoundary({ error, reset }: { error: unknown; reset: () => void }) {
  const message =
    error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Something went wrong while loading this page."

  // TanStack Router's errorComponent replaces RootComponent entirely, so the
  // app's <Providers> tree (ThemeProvider etc.) isn't above us. Mount a local
  // ThemeProvider so <Toaster />'s useTheme() call doesn't crash the boundary.
  return (
    <ThemeProvider defaultTheme="system" storageKey="theme">
      <div className="flex min-h-screen items-center justify-center p-6">
        <Empty className="max-w-xl border border-border bg-card p-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <RefreshCcw className="size-5" />
            </EmptyMedia>
            <EmptyTitle>Something went wrong</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Alert variant="destructive" className="text-left">
              <AlertTitle>Request failed</AlertTitle>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
            <div className="flex items-center gap-3">
              <Button onClick={() => reset()}>Try again</Button>
              <Button variant="outline" onClick={() => window.location.assign("/")}>
                Go to dashboard
              </Button>
            </div>
          </EmptyContent>
        </Empty>
        <Toaster />
      </div>
    </ThemeProvider>
  )
}
