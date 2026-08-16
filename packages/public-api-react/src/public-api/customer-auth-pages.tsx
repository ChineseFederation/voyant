import {
  SignInPage,
  type SignInPageMessages,
  type SignInSocialProvider,
  SignUpPage,
  type SignUpPageMessages,
  type SignUpSocialProvider,
  VerifyEmailPage,
  type VerifyEmailPageMessages,
} from "@voyant-travel/auth-react/ui"
import { Button, buttonVariants } from "@voyant-travel/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@voyant-travel/ui/components/card"
import { Input } from "@voyant-travel/ui/components/input"
import { Label } from "@voyant-travel/ui/components/label"
import { Loader2 } from "lucide-react"
import { type FormEvent, useState } from "react"
import { useCustomerPortalMutation } from "../customer-portal/hooks/index.js"
import type { CustomerAuthMethods } from "./customer-auth-config.js"

export type CustomerSocialAuthProvider = "google" | "facebook" | "apple"

const signInMessages: Partial<SignInPageMessages> = {
  title: "Sign in to your travel account",
  description: "Access your profile, saved travelers, documents, and bookings.",
  emailPlaceholder: "you@example.com",
  submit: "Sign in",
  signingIn: "Signing in",
}

const signUpMessages: Partial<SignUpPageMessages> = {
  title: "Create your travel account",
  description: "Save traveler details and manage bookings without using the operator workspace.",
  nameLabel: "Full name",
  emailPlaceholder: "you@example.com",
  submit: "Create account",
  signingUp: "Creating account",
}

const verifyEmailMessages: Partial<VerifyEmailPageMessages> = {
  title: "Verify your email",
  description: "Enter the verification code we sent before signing in.",
  successTitle: "Email verified",
  successDescription: "Your travel account is ready.",
}

export function CustomerSignInPage({
  methods,
  onNavigate,
  requestEmailCode,
  redirectTo,
  signInWithEmailCode,
  signInWithSocial,
  verified = false,
}: {
  methods: CustomerAuthMethods
  onNavigate: (to: string) => void
  requestEmailCode: (email: string) => Promise<unknown>
  redirectTo: string
  signInWithEmailCode: (input: { email: string; code: string }) => Promise<unknown>
  signInWithSocial: (provider: CustomerSocialAuthProvider, callbackURL: string) => Promise<unknown>
  verified?: boolean
}): React.ReactElement {
  const customerPortal = useCustomerPortalMutation()
  const [emailMethod, setEmailMethod] = useState<"password" | "code">(
    methods.emailPassword ? "password" : "code",
  )
  const socialProviders = createSignInSocialProviders(methods, signInWithSocial)
  const completeSignIn = async () => {
    await customerPortal.bootstrap.mutateAsync({ createCustomerIfMissing: true })
    onNavigate(redirectTo)
  }
  return (
    <div className="mx-auto max-w-md py-10">
      {verified ? (
        <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-green-900 text-sm">
          Email verified. Sign in to continue.
        </div>
      ) : null}
      {emailMethod === "password" && methods.emailPassword ? (
        <SignInPage
          redirectTo={redirectTo}
          signUpHref={`/shop/account/sign-up?next=${encodeURIComponent(redirectTo)}`}
          messages={signInMessages}
          socialProviders={socialProviders}
          onSignedIn={completeSignIn}
        />
      ) : (
        <CustomerEmailCodeSignIn
          emailCodeEnabled={methods.emailCode}
          redirectTo={redirectTo}
          socialProviders={socialProviders}
          requestEmailCode={requestEmailCode}
          signInWithEmailCode={signInWithEmailCode}
          onSignedIn={completeSignIn}
        />
      )}
      {methods.emailPassword && methods.emailCode ? (
        <Button
          type="button"
          variant="outline"
          className="mt-3 w-full"
          onClick={() =>
            setEmailMethod((current) => (current === "password" ? "code" : "password"))
          }
        >
          {emailMethod === "password" ? "Sign in with an email code" : "Sign in with a password"}
        </Button>
      ) : null}
      <PublicApiBackLink />
    </div>
  )
}

export function CustomerSignUpPage({
  methods,
  onNavigateToVerify,
  redirectTo,
  signInWithSocial,
}: {
  methods: CustomerAuthMethods
  onNavigateToVerify: (email: string) => void
  redirectTo: string
  signInWithSocial: (provider: CustomerSocialAuthProvider, callbackURL: string) => Promise<unknown>
}): React.ReactElement {
  const signInHref = `/shop/account/sign-in?next=${encodeURIComponent(redirectTo)}`
  if (!methods.emailPassword) {
    return (
      <div className="mx-auto max-w-md py-10">
        <Card>
          <CardHeader>
            <CardTitle>Continue with your email</CardTitle>
            <CardDescription>
              This storefront creates your account when you sign in with the code sent to your
              email.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <a href={signInHref} className={buttonVariants({ className: "w-full" })}>
              Continue to sign in
            </a>
          </CardContent>
        </Card>
        <PublicApiBackLink />
      </div>
    )
  }
  return (
    <div className="mx-auto max-w-md py-10">
      <SignUpPage
        redirectTo={redirectTo}
        signInHref={signInHref}
        messages={signUpMessages}
        socialProviders={createSignUpSocialProviders(methods, signInWithSocial)}
        onSignedUp={async ({ email }) => onNavigateToVerify(email)}
      />
      <PublicApiBackLink />
    </div>
  )
}

function CustomerEmailCodeSignIn({
  emailCodeEnabled,
  onSignedIn,
  redirectTo,
  requestEmailCode,
  signInWithEmailCode,
  socialProviders,
}: {
  emailCodeEnabled: boolean
  onSignedIn: () => Promise<void>
  redirectTo: string
  requestEmailCode: (email: string) => Promise<unknown>
  signInWithEmailCode: (input: { email: string; code: string }) => Promise<unknown>
  socialProviders: readonly SignInSocialProvider[]
}): React.ReactElement {
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [codeSent, setCodeSent] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [pendingSocialProvider, setPendingSocialProvider] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    const normalizedEmail = email.trim()
    if (!normalizedEmail) {
      setError("Email is required.")
      return
    }
    setIsPending(true)
    try {
      if (!codeSent) {
        await requestEmailCode(normalizedEmail)
        setCodeSent(true)
        return
      }
      if (!code.trim()) {
        setError("Sign-in code is required.")
        return
      }
      await signInWithEmailCode({ email: normalizedEmail, code: code.trim() })
      await onSignedIn()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in. Try again.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Card data-slot="customer-email-code-sign-in">
      <CardHeader>
        <CardTitle>Sign in to your travel account</CardTitle>
        <CardDescription>
          {emailCodeEnabled
            ? "We will email you a one-time code. No password needed."
            : "Choose one of the configured sign-in methods below."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {emailCodeEnabled ? (
          <form className="space-y-4" onSubmit={onSubmit}>
            {error ? (
              <div className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">
                {error}
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="customer-auth-email-code-email">Email</Label>
              <Input
                id="customer-auth-email-code-email"
                type="email"
                autoComplete="email"
                autoFocus
                disabled={codeSent}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            {codeSent ? (
              <div className="space-y-2">
                <Label htmlFor="customer-auth-email-code">Sign-in code</Label>
                <Input
                  id="customer-auth-email-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  required
                />
              </div>
            ) : null}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {codeSent ? "Sign in" : "Email me a code"}
            </Button>
            {codeSent ? (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={isPending}
                onClick={() => {
                  setCode("")
                  setCodeSent(false)
                  setError(null)
                }}
              >
                Use a different email
              </Button>
            ) : null}
          </form>
        ) : null}
        {socialProviders.length > 0 ? (
          <>
            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-muted-foreground text-xs uppercase">Or</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="space-y-2">
              {socialProviders.map((provider) => (
                <Button
                  key={provider.id}
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={pendingSocialProvider !== null}
                  onClick={() => {
                    setPendingSocialProvider(provider.id)
                    void Promise.resolve(provider.onSignIn({ redirectTo })).catch(() => {
                      setPendingSocialProvider(null)
                      setError("Could not sign in. Try again.")
                    })
                  }}
                >
                  {pendingSocialProvider === provider.id ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  {provider.label}
                </Button>
              ))}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}

const socialProviderLabels: Record<CustomerSocialAuthProvider, string> = {
  google: "Continue with Google",
  facebook: "Continue with Facebook",
  apple: "Continue with Apple",
}

function enabledSocialProviders(methods: CustomerAuthMethods): CustomerSocialAuthProvider[] {
  return (["google", "facebook", "apple"] as const).filter((provider) => methods[provider])
}

function createSignInSocialProviders(
  methods: CustomerAuthMethods,
  signInWithSocial: (provider: CustomerSocialAuthProvider, callbackURL: string) => Promise<unknown>,
): SignInSocialProvider[] {
  return enabledSocialProviders(methods).map((provider) => ({
    id: provider,
    label: socialProviderLabels[provider],
    onSignIn: async ({ redirectTo }) => {
      await signInWithSocial(provider, redirectTo ?? "/shop/account")
    },
  }))
}

function createSignUpSocialProviders(
  methods: CustomerAuthMethods,
  signInWithSocial: (provider: CustomerSocialAuthProvider, callbackURL: string) => Promise<unknown>,
): SignUpSocialProvider[] {
  return enabledSocialProviders(methods).map((provider) => ({
    id: provider,
    label: socialProviderLabels[provider],
    onSignUp: async ({ redirectTo }) => {
      await signInWithSocial(provider, redirectTo ?? "/shop/account")
    },
  }))
}

export function CustomerVerifyEmailPage({
  email,
  onCompleted,
  onNavigateToSignIn,
  onResendVerification,
  redirectTo,
}: {
  email?: string
  onCompleted: () => Promise<void>
  onNavigateToSignIn: () => void
  onResendVerification: (email: string) => Promise<void>
  redirectTo: string
}): React.ReactElement {
  return (
    <div className="mx-auto max-w-md py-10">
      <VerifyEmailPage
        mode="otp"
        email={email}
        signInHref={`/shop/account/sign-in?next=${encodeURIComponent(redirectTo)}&verify=1`}
        messages={verifyEmailMessages}
        onCompleted={onCompleted}
        onResendVerification={onResendVerification}
        onSignInClick={onNavigateToSignIn}
      />
    </div>
  )
}

function PublicApiBackLink(): React.ReactElement {
  return (
    <div className="mt-4 text-center">
      <a href="/shop" className={buttonVariants({ variant: "ghost", size: "sm" })}>
        Back to storefront
      </a>
    </div>
  )
}
