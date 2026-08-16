import { buttonVariants } from "@voyant-travel/ui/components/button"
import { cn } from "@voyant-travel/ui/lib/utils"
import { CircleUserRound, LogIn } from "lucide-react"
import type { ReactNode } from "react"
import { PublicApiMarketSelector } from "./market-selector.js"
import { usePublicApiMessages } from "./messages.js"

export function PublicApiShell({
  children,
  sessionPending = false,
  signedIn = false,
}: {
  children: ReactNode
  sessionPending?: boolean
  signedIn?: boolean
}): React.ReactElement {
  const t = usePublicApiMessages().layout
  const accountHref = signedIn ? "/shop/account" : "/shop/account/sign-in?next=/shop/account"

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <a href="/shop" className="font-medium">
            {t.brand}
          </a>
          <nav className="flex items-center gap-2">
            <PublicApiMarketSelector />
            <a
              href={accountHref}
              aria-disabled={sessionPending}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                sessionPending && "pointer-events-none opacity-50",
              )}
            >
              {signedIn ? (
                <CircleUserRound className="size-4" aria-hidden="true" />
              ) : (
                <LogIn className="size-4" aria-hidden="true" />
              )}
              {signedIn ? t.account : t.signIn}
            </a>
          </nav>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
