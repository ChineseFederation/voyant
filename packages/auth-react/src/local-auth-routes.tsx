import { useMutation, useQuery } from "@tanstack/react-query"
import { Outlet, redirect, useNavigate, useSearch } from "@tanstack/react-router"
import { formatMessage } from "@voyant-travel/admin/lib/i18n"
import type { AdminAuthMessages } from "@voyant-travel/i18n"
import type { ReactNode } from "react"
import { z } from "zod"
import { AcceptInvitationPage } from "./components/accept-invitation-page.js"
import { AuthLayout } from "./components/auth-layout.js"
import {
  ForgotPasswordPage,
  type ForgotPasswordPageMessages,
  ResetPasswordPage,
  type ResetPasswordPageMessages,
} from "./components/password-reset-pages.js"
import {
  RedeemInvitationPage,
  type RedeemInvitationStatus,
} from "./components/redeem-invitation-page.js"
import {
  SignInPage,
  type SignInPageMessages,
  type SignInSocialProvider,
} from "./components/sign-in-page.js"
import {
  SignUpPage,
  type SignUpPageMessages,
  type SignUpSocialProvider,
} from "./components/sign-up-page.js"
import { VerifyEmailPage, type VerifyEmailPageMessages } from "./components/verify-email-page.js"
import { type LocalAuthRoute, resolveLocalAuthRedirect } from "./local-auth-bootstrap.js"

export interface LocalAuthPresentationRuntime<TUser> {
  getCurrentUser: () => Promise<TUser | null>
  getBootstrapStatus: () => Promise<{
    hasUsers: boolean
    authMode?: "local" | "voyant-cloud"
  }>
  cloudAuthStartHref: (next?: string) => string
  useMessages: () => AdminAuthMessages
  getInvitation: (token: string) => Promise<RedeemInvitationStatus>
  redeemInvitation: (token: string, input: { name: string; password: string }) => Promise<void>
  signInWithEmail: (input: {
    email: string
    password: string
  }) => Promise<{ error?: { message?: string | null } | null }>
  signInWithSocial: (provider: "google", callbackURL: string) => Promise<unknown>
  sendVerificationOtp: (email: string) => Promise<unknown>
  refreshAuthStatus: () => Promise<unknown>
}

export interface LocalAuthRouteContribution {
  readonly id: "@voyant-travel/auth#presentation.local-auth"
  readonly routes: {
    readonly layout: LocalAuthRouteOptions
    readonly acceptInvitation: LocalAuthRouteOptions
    readonly acceptInvite: LocalAuthRouteOptions
    readonly forgotPassword: LocalAuthRouteOptions
    readonly onboarding: LocalAuthRouteOptions
    readonly resetPassword: LocalAuthRouteOptions
    readonly signIn: LocalAuthRouteOptions
    readonly signUp: LocalAuthRouteOptions
    readonly verifyEmail: LocalAuthRouteOptions
  }
}

export interface LocalAuthRouteOptions {
  readonly component: () => ReactNode
  readonly loader?: (input: { location: { href: string } }) => Promise<void>
  readonly validateSearch?: z.ZodType
}

export function createLocalAuthRouteContribution<TUser>(
  runtime: LocalAuthPresentationRuntime<TUser>,
): LocalAuthRouteContribution {
  const localAuthLoader =
    (route: LocalAuthRoute) =>
    async ({ location }: { location: { href: string } }) => {
      const destination = await resolveLocalAuthRedirect({
        route,
        currentHref: location.href,
        getCurrentUser: runtime.getCurrentUser,
        getBootstrapStatus: runtime.getBootstrapStatus,
        getCloudAuthStartHref: runtime.cloudAuthStartHref,
      })
      if (!destination) return
      if ("href" in destination) {
        throw redirect({ href: destination.href, reloadDocument: true })
      }
      throw redirect(destination)
    }

  function AcceptInvitationRoute() {
    const navigate = useNavigate()
    const { id } = useSearch({ strict: false }) as { id: string }
    return (
      <AcceptInvitationPage
        token={id}
        isAuthenticated
        continueHref="/"
        onContinue={() => void navigate({ to: "/" })}
      />
    )
  }

  function AcceptInviteRoute() {
    const { token } = useSearch({ strict: false }) as { token: string }
    const navigate = useNavigate()
    const messages = runtime.useMessages().acceptInvite
    const invitation = useQuery({
      queryKey: ["invitation", token],
      queryFn: async () => {
        try {
          return await runtime.getInvitation(token)
        } catch (error) {
          if (hasStatus(error, 404) || hasStatus(error, 410)) return { valid: false } as const
          throw error
        }
      },
      retry: false,
    })
    const redeem = useMutation({
      mutationFn: async (input: { name: string; password: string }) => {
        await runtime.redeemInvitation(token, input)
        const email = invitation.data?.valid ? invitation.data.email : ""
        const result = await runtime.signInWithEmail({ email, password: input.password })
        if (result.error) {
          throw new Error(result.error.message ?? messages.signInAfterRedeemFailed)
        }
      },
      onSuccess: () => void navigate({ to: "/" }),
    })

    return (
      <RedeemInvitationPage
        invitation={invitation.data}
        isLoading={invitation.isPending}
        isSubmitting={redeem.isPending}
        messages={messages}
        onRedeem={(input) => redeem.mutateAsync(input)}
      />
    )
  }

  function ForgotPasswordRoute() {
    const navigate = useNavigate()
    const adminMessages = runtime.useMessages().forgotPassword
    const messages: Partial<ForgotPasswordPageMessages> = {
      title: adminMessages.title,
      description: adminMessages.description,
      emailLabel: adminMessages.emailLabel,
      emailPlaceholder: adminMessages.emailPlaceholder,
      submit: adminMessages.submit,
      submitting: adminMessages.submit,
      somethingWentWrong: adminMessages.somethingWentWrong,
      successTitle: adminMessages.checkEmailTitle,
      successDescription: (email) => formatMessage(adminMessages.checkEmailDescription, { email }),
      backToSignIn: adminMessages.backToSignIn,
    }
    return (
      <ForgotPasswordPage
        redirectTo="/reset-password"
        messages={messages}
        onNavigateToSignIn={() => void navigate({ to: "/sign-in" })}
        signInHref="/sign-in"
      />
    )
  }

  function ResetPasswordRoute() {
    const navigate = useNavigate()
    const { token } = useSearch({ strict: false }) as { token?: string }
    const adminMessages = runtime.useMessages().resetPassword
    const messages: Partial<ResetPasswordPageMessages> = {
      title: adminMessages.title,
      description: adminMessages.description,
      newPasswordLabel: adminMessages.newPasswordLabel,
      confirmPasswordLabel: adminMessages.confirmPasswordLabel,
      submit: adminMessages.submit,
      submitting: adminMessages.submit,
      tokenRequired: adminMessages.missingResetToken,
      passwordsDoNotMatch: adminMessages.passwordsDoNotMatch,
      somethingWentWrong: adminMessages.somethingWentWrong,
      signIn: adminMessages.backToSignIn,
    }
    return (
      <ResetPasswordPage
        token={token}
        messages={messages}
        signInHref="/sign-in"
        onPasswordReset={() => void navigate({ to: "/sign-in", search: { reset: "success" } })}
        onNavigateToSignIn={() => void navigate({ to: "/sign-in" })}
      />
    )
  }

  function SignInRoute() {
    const navigate = useNavigate()
    const { next, redirect_url } = useSearch({ strict: false }) as {
      next?: string
      redirect_url?: string
    }
    const redirectTo = next || redirect_url || "/"
    const adminMessages = runtime.useMessages().signIn
    const messages: Partial<SignInPageMessages> = {
      title: adminMessages.title,
      description: adminMessages.description,
      emailLabel: adminMessages.emailLabel,
      emailPlaceholder: adminMessages.emailPlaceholder,
      passwordLabel: adminMessages.passwordLabel,
      forgotPassword: adminMessages.forgotPassword,
      submit: adminMessages.submit,
      signingIn: adminMessages.submit,
      or: adminMessages.or,
      emailNotVerified: adminMessages.emailNotVerified,
      invalidEmailOrPassword: adminMessages.invalidEmailOrPassword,
      somethingWentWrong: adminMessages.somethingWentWrong,
      resendVerificationCode: adminMessages.resendVerificationCode,
      sending: adminMessages.sending,
    }
    const socialProviders: SignInSocialProvider[] = [
      {
        id: "google",
        label: adminMessages.continueWithGoogle,
        icon: <GoogleIcon />,
        onSignIn: async () => {
          await runtime.signInWithSocial("google", redirectTo)
        },
      },
    ]
    return (
      <SignInPage
        redirectTo={redirectTo}
        forgotPasswordHref="/forgot-password"
        messages={messages}
        socialProviders={socialProviders}
        onSignedIn={async () => {
          await runtime.refreshAuthStatus()
          void navigate({ to: redirectTo })
        }}
        onResendVerification={async (email) => {
          await runtime.sendVerificationOtp(email)
          void navigate({ to: "/verify-email", search: { email } })
        }}
      />
    )
  }

  function SignUpRoute() {
    const navigate = useNavigate()
    const adminMessages = runtime.useMessages().signUp
    const messages: Partial<SignUpPageMessages> = {
      title: adminMessages.title,
      description: adminMessages.description,
      nameLabel: adminMessages.fullNameLabel,
      namePlaceholder: adminMessages.fullNamePlaceholder,
      emailLabel: adminMessages.emailLabel,
      emailPlaceholder: adminMessages.emailPlaceholder,
      passwordLabel: adminMessages.passwordLabel,
      submit: adminMessages.submit,
      signingUp: adminMessages.submit,
      or: adminMessages.or,
      couldNotCreateAccount: adminMessages.couldNotCreateAccount,
      somethingWentWrong: adminMessages.somethingWentWrong,
    }
    const socialProviders: SignUpSocialProvider[] = [
      {
        id: "google",
        label: adminMessages.continueWithGoogle,
        icon: <GoogleIcon />,
        onSignUp: async () => {
          await runtime.signInWithSocial("google", "/")
        },
      },
    ]
    return (
      <SignUpPage
        messages={messages}
        socialProviders={socialProviders}
        onSignedUp={({ email }) => void navigate({ to: "/verify-email", search: { email } })}
      />
    )
  }

  function VerifyEmailRoute() {
    const navigate = useNavigate()
    const { email } = useSearch({ strict: false }) as { email: string }
    const adminMessages = runtime.useMessages().verifyEmail
    const messages: Partial<VerifyEmailPageMessages> = {
      title: adminMessages.title,
      description: formatMessage(adminMessages.description, { email }),
      submit: adminMessages.submit,
      verifying: adminMessages.submit,
      invalidVerification: adminMessages.invalidVerificationCode,
      resendCode: adminMessages.resendCode,
      sending: adminMessages.sending,
      resent: adminMessages.resent,
      resendFailed: adminMessages.resendFailed,
    }
    return (
      <VerifyEmailPage
        mode="otp"
        email={email}
        messages={messages}
        onCompleted={async () => {
          await runtime.refreshAuthStatus()
          void navigate({ to: "/" })
        }}
        onResendVerification={async (emailAddress) => {
          await runtime.sendVerificationOtp(emailAddress)
        }}
      />
    )
  }

  return {
    id: "@voyant-travel/auth#presentation.local-auth",
    routes: {
      layout: { component: LocalAuthLayout },
      acceptInvitation: {
        validateSearch: z.object({ id: z.string() }),
        loader: localAuthLoader("accept-invitation"),
        component: AcceptInvitationRoute,
      },
      acceptInvite: {
        validateSearch: z.object({ token: z.string().min(1) }),
        component: AcceptInviteRoute,
      },
      forgotPassword: {
        loader: localAuthLoader("forgot-password"),
        component: ForgotPasswordRoute,
      },
      onboarding: {
        loader: async ({ location }) => {
          const user = await runtime.getCurrentUser()
          throw redirect(user ? { to: "/" } : { to: "/sign-in", search: { next: location.href } })
        },
        component: EmptyRoute,
      },
      resetPassword: {
        loader: localAuthLoader("reset-password"),
        validateSearch: z.object({ token: z.string().optional() }),
        component: ResetPasswordRoute,
      },
      signIn: {
        loader: localAuthLoader("sign-in"),
        validateSearch: z.object({
          next: z.string().optional(),
          redirect_url: z.string().optional(),
          reset: z.string().optional(),
        }),
        component: SignInRoute,
      },
      signUp: { loader: localAuthLoader("sign-up"), component: SignUpRoute },
      verifyEmail: {
        loader: localAuthLoader("verify-email"),
        validateSearch: z.object({ email: z.string() }),
        component: VerifyEmailRoute,
      },
    },
  }
}

function LocalAuthLayout() {
  return (
    <AuthLayout>
      <Outlet />
    </AuthLayout>
  )
}

function EmptyRoute() {
  return null
}

function hasStatus(error: unknown, status: number): boolean {
  return error instanceof Error && "status" in error && error.status === status
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="mr-2 h-4 w-4" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}
