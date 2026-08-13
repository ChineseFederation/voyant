// agent-quality: file-size exception -- package i18n catalog contract is intentionally centralized.
import type { ReactNode } from "react"

export interface AcceptInvitationPageMessages {
  title: string
  description: string
  tokenLabel: string
  tokenPlaceholder: string
  tokenRequired: string
  submit: string
  submitting: string
  handoffTitle: string
  handoffDescription: string
  signIn: string
  signUp: string
  successTitle: string
  successDescription: string
  continue: string
  failureTitle: string
  failureDescription: string
  signInRequired: string
  somethingWentWrong: string
}

export interface AccountProfileFormMessages {
  title: string
  description: string
  firstNameLabel: string
  firstNamePlaceholder: string
  lastNameLabel: string
  lastNamePlaceholder: string
  profilePictureUrlLabel: string
  profilePictureUrlPlaceholder: string
  submit: string
  saving: string
  success: string
  loadFailed: string
  noUser: string
  error: string
}

export interface AccountChangeEmailFormMessages {
  title: string
  description: string
  currentEmailLabel: string
  currentEmailMissing: string
  newEmailLabel: string
  newEmailPlaceholder: string
  verificationCodeLabel: string
  verificationCodePlaceholder: string
  sendCode: string
  sendingCode: string
  confirm: string
  confirming: string
  codeSent: string
  success: string
  emailRequired: string
  codeRequired: string
  error: string
}

export interface AccountChangePasswordFormMessages {
  title: string
  description: string
  currentPasswordLabel: string
  newPasswordLabel: string
  confirmPasswordLabel: string
  revokeOtherSessionsLabel: string
  submit: string
  saving: string
  success: string
  currentPasswordRequired: string
  newPasswordRequired: string
  passwordsDoNotMatch: string
  passwordTooShort: string
  error: string
}

export interface AccountPageMessages {
  title: string
  description: string
  loading: string
  loadFailed: string
  profile: AccountProfileFormMessages
  email: AccountChangeEmailFormMessages
  password: AccountChangePasswordFormMessages
}

export type PartialAccountPageMessages = Partial<
  Omit<AccountPageMessages, "profile" | "email" | "password">
> & {
  profile?: Partial<AccountProfileFormMessages>
  email?: Partial<AccountChangeEmailFormMessages>
  password?: Partial<AccountChangePasswordFormMessages>
}

export interface OrganizationMembersPageMessages {
  title: string
  description: string
  loading: string
  loadFailed: string
  noActiveOrganization: string
  invite: {
    title: string
    description: string
    emailLabel: string
    emailPlaceholder: string
    roleLabel: string
    submit: string
    submitting: string
    errors: {
      emailRequired: string
      failed: string
    }
  }
  members: {
    title: string
    description: string
    memberColumn: string
    roleColumn: string
    joinedColumn: string
    actionsColumn: string
    empty: string
    actions: {
      updateRoleAriaLabel: (name: string) => string
      remove: string
      removeAriaLabel: (name: string) => string
      removeConfirm: (name: string) => string
    }
    errors: {
      updateRoleFailed: string
      removeFailed: string
    }
  }
  invitations: {
    title: string
    description: string
    emailColumn: string
    roleColumn: string
    expiresColumn: string
    actionsColumn: string
    empty: string
    actions: {
      resend: string
      resendAriaLabel: (email: string) => string
      cancel: string
      cancelAriaLabel: (email: string) => string
    }
    errors: {
      resendFailed: string
      cancelFailed: string
    }
  }
  roles: Record<string, string>
  date: {
    unknown: string
  }
}

export type PartialOrganizationMembersPageMessages = Partial<
  Omit<OrganizationMembersPageMessages, "invite" | "members" | "invitations" | "roles" | "date">
> & {
  invite?: Partial<Omit<OrganizationMembersPageMessages["invite"], "errors">> & {
    errors?: Partial<OrganizationMembersPageMessages["invite"]["errors"]>
  }
  members?: Partial<Omit<OrganizationMembersPageMessages["members"], "actions" | "errors">> & {
    actions?: Partial<OrganizationMembersPageMessages["members"]["actions"]>
    errors?: Partial<OrganizationMembersPageMessages["members"]["errors"]>
  }
  invitations?: Partial<
    Omit<OrganizationMembersPageMessages["invitations"], "actions" | "errors">
  > & {
    actions?: Partial<OrganizationMembersPageMessages["invitations"]["actions"]>
    errors?: Partial<OrganizationMembersPageMessages["invitations"]["errors"]>
  }
  roles?: Partial<OrganizationMembersPageMessages["roles"]>
  date?: Partial<OrganizationMembersPageMessages["date"]>
}

export interface TeamManagementPageMessages {
  title: string
  description: string
  loadFailed: string
  invite: {
    title: string
    description: string
    emailLabel: string
    emailPlaceholder: string
    roleLabel: string
    submit: string
    submitting: string
    acceptUrlLabel: string
    acceptUrlDescription: string
    copyUrl: string
    copied: string
    copyFailed: string
  }
  members: {
    title: string
    description: string
    memberColumn: string
    roleColumn: string
    statusColumn: string
    lastActivityColumn: string
    actionsColumn: string
    empty: string
    activate: string
    activateLabel: (name: string) => string
    deactivate: string
    deactivateLabel: (name: string) => string
    deactivateConfirm: (name: string) => string
  }
  invitations: {
    title: string
    description: string
    emailColumn: string
    roleColumn: string
    expiresColumn: string
    actionsColumn: string
    empty: string
    revoke: string
    revokeLabel: (email: string) => string
  }
  statuses: {
    active: string
    deactivated: string
    pending: string
    accepted: string
    expired: string
    revoked: string
  }
  dateUnknown: string
  actionFailed: string
}

export interface CustomerBusinessAccountsPageMessages {
  title: string
  description: string
  loading: string
  loadFailed: string
  forbidden: string
  actionFailed: string
  requests: {
    title: string
    description: string
    requesterColumn: string
    businessColumn: string
    statusColumn: string
    submittedColumn: string
    actionsColumn: string
    empty: string
    approve: string
    approveLabel: (name: string) => string
    reject: string
    rejectLabel: (name: string) => string
    rejectConfirm: (name: string) => string
  }
  provision: {
    title: string
    description: string
    storefrontOriginLabel: string
    storefrontOriginPlaceholder: string
    storefrontOriginRequired: string
    customerEmailLabel: string
    customerEmailPlaceholder: string
    businessNameLabel: string
    businessNamePlaceholder: string
    existingOrganizationIdLabel: string
    existingOrganizationIdPlaceholder: string
    existingOrganizationIdDescription: string
    submit: string
    submitting: string
    success: string
    emailRequired: string
    nameRequired: string
  }
  statuses: {
    pending: string
    approved: string
    rejected: string
    canceled: string
  }
  dateUnknown: string
}

export interface ForgotPasswordPageMessages {
  title: string
  description: string
  emailLabel: string
  emailPlaceholder: string
  submit: string
  submitting: string
  emailRequired: string
  successTitle: string
  successDescription: (email: string) => ReactNode
  somethingWentWrong: string
  backToSignIn: string
}

export interface ResetPasswordPageMessages {
  title: string
  description: string
  newPasswordLabel: string
  confirmPasswordLabel: string
  submit: string
  submitting: string
  tokenRequired: string
  passwordRequired: string
  passwordsDoNotMatch: string
  passwordTooShort: (minPasswordLength: number) => string
  successTitle: string
  successDescription: string
  somethingWentWrong: string
  signIn: string
  requestNewLink: string
}

export interface OnboardingPageMessages {
  title: string
  description: string
  firstNameLabel: string
  firstNamePlaceholder: string
  lastNameLabel: string
  lastNamePlaceholder: string
  localeLabel: string
  localePlaceholder: string
  timezoneLabel: string
  timezonePlaceholder: string
  firstNameRequired: string
  lastNameRequired: string
  submit: string
  submitting: string
  somethingWentWrong: string
}

export interface SignInPageMessages {
  title: string
  description: string
  emailLabel: string
  emailPlaceholder: string
  passwordLabel: string
  forgotPassword: string
  submit: string
  signingIn: string
  invalidEmailOrPassword: string
  emailRequired: string
  passwordRequired: string
  emailNotVerified: string
  resendVerificationCode: string
  sending: string
  somethingWentWrong: string
  or: string
  noAccount: string
  signUp: string
}

export interface SignUpPageMessages {
  title: string
  description: string
  nameLabel: string
  namePlaceholder: string
  emailLabel: string
  emailPlaceholder: string
  passwordLabel: string
  invitationTokenLabel: string
  invitationTokenPlaceholder: string
  submit: string
  signingUp: string
  nameRequired: string
  emailRequired: string
  passwordRequired: string
  invitationSignUpRequiresHandler: string
  couldNotCreateAccount: string
  somethingWentWrong: string
  or: string
  haveAccount: string
  signIn: string
}

export interface VerifyEmailPageMessages {
  title: string
  description: string
  tokenDescription: string
  emailLabel: string
  emailPlaceholder: string
  codeLabel: string
  tokenLabel: string
  tokenPlaceholder: string
  submit: string
  verifying: string
  emailRequired: string
  codeRequired: string
  tokenRequired: string
  invalidVerification: string
  successTitle: string
  successDescription: string
  resendCode: string
  sending: string
  resent: string
  resendFailed: string
  signIn: string
  changeEmail: string
}

export interface StorefrontsPageMessages {
  title: string
  description: string
  loading: string
  loadFailed: string
  actionFailed: string
  refresh: string
  businessUnsupported: string
  create: {
    title: string
    description: string
    nameLabel: string
    namePlaceholder: string
    slugLabel: string
    slugPlaceholder: string
    hostingLabel: string
    hostingExternal: string
    hostingCloudSite: string
    siteIdLabel: string
    siteIdPlaceholder: string
    submit: string
    submitting: string
    nameRequired: string
    slugRequired: string
    createFailed: string
  }
  list: {
    title: string
    empty: string
    externalBadge: string
    cloudSiteBadge: string
    originsSummary: (count: number) => string
  }
  detail: {
    overviewTitle: string
    nameLabel: string
    slugLabel: string
    hostingLabel: string
    save: string
    saving: string
    delete: string
    deleteConfirm: string
    close: string
  }
  origins: {
    title: string
    description: string
    addPlaceholder: string
    add: string
    remove: string
    empty: string
    localhostHint: string
  }
  channel: {
    title: string
    description: string
    unavailable: string
    defaultDeny: string
    selectLabel: string
    selectPlaceholder: string
    loading: string
    noActiveChannels: string
    boundStatus: string
    unboundStatus: string
    inactiveWarning: string
    save: string
    saving: string
    clear: string
    clearConfirm: string
  }
  keys: {
    title: string
    description: string
    namePlaceholder: string
    issuePublishable: string
    issueSecret: string
    empty: string
    revoke: string
    revokeConfirm: string
    rotate: string
    rotateConfirm: string
    kindPublishable: string
    kindSecret: string
    revoked: string
    active: string
    revealTitle: string
    revealDescription: string
    copy: string
    copied: string
    dismiss: string
  }
  account: {
    methodsTitle: string
    methodsDescription: string
    methodEmailCode: string
    methodEmailPassword: string
    methodGoogle: string
    methodFacebook: string
    methodApple: string
    saveMethods: string
    policyTitle: string
    policyDescription: string
    allowPersonal: string
    allowBusiness: string
    personalSignup: string
    personalSignupOpen: string
    personalSignupDisabled: string
    businessOnboarding: string
    businessOnboardingDisabled: string
    businessOnboardingOpen: string
    businessOnboardingRequest: string
    businessOnboardingInviteOnly: string
    savePolicy: string
    saving: string
  }
  providers: {
    title: string
    description: string
    configured: string
    notConfigured: string
    clientIdLabel: string
    clientSecretLabel: string
    secretHint: string
    save: string
    clear: string
    clearConfirm: string
    providerGoogle: string
    providerFacebook: string
    providerApple: string
  }
  sites: {
    title: string
    description: string
    seam: string
  }
}

export type AuthUiMessages = {
  acceptInvitationPage: AcceptInvitationPageMessages
  accountPage: AccountPageMessages
  forgotPasswordPage: ForgotPasswordPageMessages
  organizationMembersPage: OrganizationMembersPageMessages
  teamManagementPage: TeamManagementPageMessages
  customerBusinessAccountsPage: CustomerBusinessAccountsPageMessages
  storefrontsPage: StorefrontsPageMessages
  onboardingPage: OnboardingPageMessages
  resetPasswordPage: ResetPasswordPageMessages
  signInPage: SignInPageMessages
  signUpPage: SignUpPageMessages
  verifyEmailPage: VerifyEmailPageMessages
  serviceApiKeysPage: {
    title: string
    description: string
    catalogUnavailable: {
      title: string
      description: string
    }
    createdToken: {
      title: string
      description: string
      copy: string
    }
    create: {
      title: string
      description: string
      open: string
      cancel: string
      name: string
      namePlaceholder: string
      expiration: string
      submit: string
      errors: {
        nameRequired: string
        permissionRequired: string
        createFailed: string
      }
      expirationOptions: {
        never: string
        sevenDays: string
        thirtyDays: string
        ninetyDays: string
        oneYear: string
      }
    }
    scopes: {
      title: string
      description: string
      presets: string
      fullAccess: string
      fullAccessHint: string
      search: string
      noResults: string
      selectedCount: string
      groupAllLabel: string
      groupAllHint: string
      lockedHint: string
      sensitive: string
      countOf: string
      clear: string
    }
    list: {
      title: string
      refresh: string
      loading: string
      empty: string
      untitled: string
      enabled: string
      disabled: string
      noPermissions: string
      created: string
      actions: string
      moreScopes: string
      deleteConfirm: string
      columns: {
        name: string
        scopes: string
        expires: string
        lastUsed: string
      }
      disable: string
      enable: string
      rotate: string
      rotateConfirm: string
      rotateFailed: string
      delete: string
    }
    permissions: {
      fullAccess: string
    }
    date: {
      never: string
    }
  }
}
