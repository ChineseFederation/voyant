import type { LocaleMessageDefinitions } from "../runtime.js"

export type AdminAuthMessages = {
  signIn: {
    title: string
    description: string
    emailNotVerified: string
    invalidEmailOrPassword: string
    somethingWentWrong: string
    resendVerificationCode: string
    sending: string
    emailLabel: string
    emailPlaceholder: string
    passwordLabel: string
    forgotPassword: string
    submit: string
    or: string
    continueWithGoogle: string
  }
  signUp: {
    title: string
    description: string
    couldNotCreateAccount: string
    somethingWentWrong: string
    fullNameLabel: string
    fullNamePlaceholder: string
    emailLabel: string
    emailPlaceholder: string
    passwordLabel: string
    submit: string
    or: string
    continueWithGoogle: string
  }
  forgotPassword: {
    checkEmailTitle: string
    checkEmailDescription: string
    backToSignIn: string
    title: string
    description: string
    couldNotSendResetEmail: string
    somethingWentWrong: string
    emailLabel: string
    emailPlaceholder: string
    submit: string
  }
  resetPassword: {
    title: string
    description: string
    passwordsDoNotMatch: string
    missingResetToken: string
    couldNotResetPassword: string
    somethingWentWrong: string
    newPasswordLabel: string
    confirmPasswordLabel: string
    submit: string
    backToSignIn: string
  }
  verifyEmail: {
    title: string
    description: string
    invalidVerificationCode: string
    somethingWentWrong: string
    resendFailed: string
    resent: string
    submit: string
    resendCode: string
    sending: string
  }
  acceptInvite: {
    signInAfterRedeemFailed: string
    couldNotAcceptInvitation: string
    invitationUnavailableTitle: string
    invitationAlreadyUsed: string
    invitationExpired: string
    invitationInvalid: string
    title: string
    description: string
    fullNameLabel: string
    passwordLabel: string
    submit: string
  }
}

export const adminAuthMessages = {
  "zh-CN": {
    auth: {
      signIn: {
        title: "登录",
        description: "登录旅行社员工账户以继续",
        emailNotVerified: "邮箱尚未验证，请检查收件箱或重新发送验证码。",
        invalidEmailOrPassword: "邮箱或密码错误",
        somethingWentWrong: "出现问题，请重试。",
        resendVerificationCode: "重新发送验证码",
        sending: "正在发送...",
        emailLabel: "邮箱",
        emailPlaceholder: "you@company.com",
        passwordLabel: "密码",
        forgotPassword: "忘记密码？",
        submit: "登录",
        or: "或",
        continueWithGoogle: "使用 Google 继续",
      },
      signUp: {
        title: "创建首个员工管理员",
        description:
          "当前工作区还没有员工账户。创建的账户将成为员工超级管理员，其他员工通过邀请加入。",
        couldNotCreateAccount: "无法创建账户",
        somethingWentWrong: "出现问题，请重试。",
        fullNameLabel: "姓名",
        fullNamePlaceholder: "张三",
        emailLabel: "邮箱",
        emailPlaceholder: "you@company.com",
        passwordLabel: "密码",
        submit: "创建账户",
        or: "或",
        continueWithGoogle: "使用 Google 继续",
      },
      forgotPassword: {
        checkEmailTitle: "检查邮箱",
        checkEmailDescription: "密码重置链接已发送至 {email}，请按照邮件说明重置密码。",
        backToSignIn: "返回登录",
        title: "忘记密码",
        description: "输入邮箱，我们将发送密码重置链接",
        couldNotSendResetEmail: "无法发送重置邮件",
        somethingWentWrong: "出现问题，请重试。",
        emailLabel: "邮箱",
        emailPlaceholder: "you@company.com",
        submit: "发送重置链接",
      },
      resetPassword: {
        title: "重置密码",
        description: "输入新密码",
        passwordsDoNotMatch: "两次输入的密码不一致",
        missingResetToken: "缺少重置凭证，请使用邮件中的链接。",
        couldNotResetPassword: "无法重置密码",
        somethingWentWrong: "出现问题，请重试。",
        newPasswordLabel: "新密码",
        confirmPasswordLabel: "确认新密码",
        submit: "重置密码",
        backToSignIn: "返回登录",
      },
      verifyEmail: {
        title: "验证邮箱",
        description: "验证码已发送至 {email}",
        invalidVerificationCode: "验证码无效",
        somethingWentWrong: "出现问题，请重试。",
        resendFailed: "重新发送失败，请重试。",
        resent: "新验证码已发送。",
        submit: "验证邮箱",
        resendCode: "重新发送验证码",
        sending: "正在发送...",
      },
      acceptInvite: {
        signInAfterRedeemFailed: "接受邀请后登录失败",
        couldNotAcceptInvitation: "无法接受邀请",
        invitationUnavailableTitle: "邀请不可用",
        invitationAlreadyUsed: "该邀请已被使用。",
        invitationExpired: "该邀请已过期，请联系管理员重新邀请。",
        invitationInvalid: "邀请链接无效。",
        title: "接受邀请",
        description: "你已受邀以 {email} 加入，请设置姓名和密码完成员工账户创建。",
        fullNameLabel: "姓名",
        passwordLabel: "密码",
        submit: "接受邀请",
      },
    },
  },
  en: {
    auth: {
      signIn: {
        title: "Sign in",
        description: "Sign in to your account to continue",
        emailNotVerified:
          "Your email address has not been verified. Please check your inbox or resend the verification code.",
        invalidEmailOrPassword: "Invalid email or password",
        somethingWentWrong: "Something went wrong. Please try again.",
        resendVerificationCode: "Resend verification code",
        sending: "Sending...",
        emailLabel: "Email",
        emailPlaceholder: "you@company.com",
        passwordLabel: "Password",
        forgotPassword: "Forgot password?",
        submit: "Sign in",
        or: "or",
        continueWithGoogle: "Continue with Google",
      },
      signUp: {
        title: "Create the first admin",
        description:
          "This workspace has no users yet. The account you create will become the super-admin - everyone else joins via invitation.",
        couldNotCreateAccount: "Could not create account",
        somethingWentWrong: "Something went wrong. Please try again.",
        fullNameLabel: "Full name",
        fullNamePlaceholder: "Jane Smith",
        emailLabel: "Email",
        emailPlaceholder: "you@company.com",
        passwordLabel: "Password",
        submit: "Create account",
        or: "or",
        continueWithGoogle: "Continue with Google",
      },
      forgotPassword: {
        checkEmailTitle: "Check your email",
        checkEmailDescription:
          "We sent a password reset link to {email}. Follow the link in the email to reset your password.",
        backToSignIn: "Back to sign in",
        title: "Forgot password",
        description: "Enter your email and we'll send you a reset link",
        couldNotSendResetEmail: "Could not send reset email",
        somethingWentWrong: "Something went wrong. Please try again.",
        emailLabel: "Email",
        emailPlaceholder: "you@company.com",
        submit: "Send reset link",
      },
      resetPassword: {
        title: "Reset password",
        description: "Enter your new password",
        passwordsDoNotMatch: "Passwords do not match",
        missingResetToken: "Missing reset token. Please use the link from your email.",
        couldNotResetPassword: "Could not reset password",
        somethingWentWrong: "Something went wrong. Please try again.",
        newPasswordLabel: "New password",
        confirmPasswordLabel: "Confirm password",
        submit: "Reset password",
        backToSignIn: "Back to sign in",
      },
      verifyEmail: {
        title: "Verify your email",
        description: "We sent a 6-digit code to {email}",
        invalidVerificationCode: "Invalid verification code",
        somethingWentWrong: "Something went wrong. Please try again.",
        resendFailed: "Failed to resend code. Please try again.",
        resent: "A new code has been sent to your email.",
        submit: "Verify email",
        resendCode: "Resend code",
        sending: "Sending...",
      },
      acceptInvite: {
        signInAfterRedeemFailed: "Sign-in after redeem failed",
        couldNotAcceptInvitation: "Could not accept invitation",
        invitationUnavailableTitle: "Invitation unavailable",
        invitationAlreadyUsed: "This invitation has already been used.",
        invitationExpired: "This invitation has expired. Ask an admin for a new one.",
        invitationInvalid: "This invitation link isn't valid.",
        title: "Accept your invitation",
        description:
          "You've been invited to join as {email}. Set your name and password to finish creating your account.",
        fullNameLabel: "Full name",
        passwordLabel: "Password",
        submit: "Accept invitation",
      },
    },
  },
  ro: {
    auth: {
      signIn: {
        title: "Autentificare",
        description: "Autentifica-te pentru a continua",
        emailNotVerified:
          "Adresa de email nu a fost verificata. Verifica inbox-ul sau retrimite codul de verificare.",
        invalidEmailOrPassword: "Email sau parola invalida",
        somethingWentWrong: "A aparut o problema. Incearca din nou.",
        resendVerificationCode: "Retrimite codul de verificare",
        sending: "Se trimite...",
        emailLabel: "Email",
        emailPlaceholder: "tu@companie.com",
        passwordLabel: "Parola",
        forgotPassword: "Ai uitat parola?",
        submit: "Autentificare",
        or: "sau",
        continueWithGoogle: "Continua cu Google",
      },
      signUp: {
        title: "Creeaza primul administrator",
        description:
          "Acest spatiu de lucru nu are inca utilizatori. Contul creat va deveni super-admin, iar ceilalti se vor alatura prin invitatie.",
        couldNotCreateAccount: "Contul nu a putut fi creat",
        somethingWentWrong: "A aparut o problema. Incearca din nou.",
        fullNameLabel: "Nume complet",
        fullNamePlaceholder: "Ana Popescu",
        emailLabel: "Email",
        emailPlaceholder: "tu@companie.com",
        passwordLabel: "Parola",
        submit: "Creeaza cont",
        or: "sau",
        continueWithGoogle: "Continua cu Google",
      },
      forgotPassword: {
        checkEmailTitle: "Verifica emailul",
        checkEmailDescription:
          "Am trimis un link de resetare la {email}. Urmeaza linkul din email pentru a-ti reseta parola.",
        backToSignIn: "Inapoi la autentificare",
        title: "Ai uitat parola",
        description: "Introdu emailul si iti trimitem un link de resetare",
        couldNotSendResetEmail: "Emailul de resetare nu a putut fi trimis",
        somethingWentWrong: "A aparut o problema. Incearca din nou.",
        emailLabel: "Email",
        emailPlaceholder: "tu@companie.com",
        submit: "Trimite linkul de resetare",
      },
      resetPassword: {
        title: "Reseteaza parola",
        description: "Introdu parola noua",
        passwordsDoNotMatch: "Parolele nu coincid",
        missingResetToken: "Lipseste tokenul de resetare. Foloseste linkul primit pe email.",
        couldNotResetPassword: "Parola nu a putut fi resetata",
        somethingWentWrong: "A aparut o problema. Incearca din nou.",
        newPasswordLabel: "Parola noua",
        confirmPasswordLabel: "Confirma parola",
        submit: "Reseteaza parola",
        backToSignIn: "Inapoi la autentificare",
      },
      verifyEmail: {
        title: "Verifica emailul",
        description: "Am trimis un cod de 6 cifre la {email}",
        invalidVerificationCode: "Cod de verificare invalid",
        somethingWentWrong: "A aparut o problema. Incearca din nou.",
        resendFailed: "Codul nu a putut fi retrimis. Incearca din nou.",
        resent: "Un cod nou a fost trimis pe email.",
        submit: "Verifica emailul",
        resendCode: "Retrimite codul",
        sending: "Se trimite...",
      },
      acceptInvite: {
        signInAfterRedeemFailed: "Autentificarea dupa acceptarea invitatiei a esuat",
        couldNotAcceptInvitation: "Invitatia nu a putut fi acceptata",
        invitationUnavailableTitle: "Invitatie indisponibila",
        invitationAlreadyUsed: "Aceasta invitatie a fost deja folosita.",
        invitationExpired: "Aceasta invitatie a expirat. Cere unui administrator o invitatie noua.",
        invitationInvalid: "Acest link de invitatie nu este valid.",
        title: "Accepta invitatia",
        description:
          "Ai fost invitat sa te alaturi ca {email}. Seteaza-ti numele si parola pentru a finaliza contul.",
        fullNameLabel: "Nume complet",
        passwordLabel: "Parola",
        submit: "Accepta invitatia",
      },
    },
  },
} satisfies LocaleMessageDefinitions<{ auth: AdminAuthMessages }>
