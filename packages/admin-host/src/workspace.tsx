"use client"

import { useNavigate } from "@tanstack/react-router"
import { defaultOperatorNavIcons, type OperatorAdminNavigationIcons } from "@voyant-travel/admin"
import type { AdminAuthRuntime } from "@voyant-travel/admin/app"
import {
  AdminWorkspacePendingFallback,
  AdminWorkspaceShell,
  type AdminWorkspaceShellUser,
  createAdminWorkspaceBeforeLoad,
} from "@voyant-travel/admin/app/workspace"
import { createAdminUserBindings } from "@voyant-travel/admin-react"
import type { ComponentType, ReactNode } from "react"

import { createAdminHostDestinations } from "./admin-destinations.js"
import type { AdminHostPresentation } from "./admin-presentation.js"

export interface AdminHostRealtimeProviderProps<TFetcher, TChannel, TSession> {
  children: ReactNode
  fetcher: TFetcher
  getApiUrl: () => string
  realtimeChannel: TChannel
  useSession: () => TSession
}

export interface CreateAdminHostWorkspaceOptions<
  TUser extends AdminWorkspaceShellUser,
  TFetcher,
  TChannel,
  TSession,
> {
  auth: AdminAuthRuntime<TUser>
  presentation: AdminHostPresentation
  api: {
    getBaseUrl: () => string
    fetcher: TFetcher
  }
  realtime: {
    Provider: ComponentType<AdminHostRealtimeProviderProps<TFetcher, TChannel, TSession>>
    channel: TChannel
    useSession: () => TSession
  }
  icons?: OperatorAdminNavigationIcons
  signInPath?: string
  hydrateShellBootstrap?: Parameters<
    typeof createAdminWorkspaceBeforeLoad<TUser>
  >[0]["hydrateShellBootstrap"]
}

export interface AdminHostWorkspace<TUser> {
  beforeLoad: ReturnType<typeof createAdminWorkspaceBeforeLoad<TUser>>
  PendingComponent: typeof AdminWorkspacePendingFallback
  Workspace: (props: { initialUser: TUser; children: ReactNode }) => ReactNode
}

/**
 * Compose the authenticated admin workspace from deployment-provided ports.
 * Concrete auth, realtime, and transport implementations remain host-owned.
 */
export function createAdminHostWorkspace<
  TUser extends AdminWorkspaceShellUser,
  TFetcher,
  TChannel,
  TSession,
>({
  auth,
  presentation,
  api,
  realtime,
  icons = defaultOperatorNavIcons,
  signInPath = "/sign-in",
  hydrateShellBootstrap,
}: CreateAdminHostWorkspaceOptions<
  TUser,
  TFetcher,
  TChannel,
  TSession
>): AdminHostWorkspace<TUser> {
  const { UserProvider, useUser } = createAdminUserBindings<TUser>(auth.getCurrentUser)
  const destinations = createAdminHostDestinations(presentation.extensions)
  const beforeLoad = createAdminWorkspaceBeforeLoad({ auth, signInPath, hydrateShellBootstrap })

  function Workspace({ initialUser, children }: { initialUser: TUser; children: ReactNode }) {
    return (
      <UserProvider initialUser={initialUser}>
        <realtime.Provider
          fetcher={api.fetcher}
          getApiUrl={api.getBaseUrl}
          realtimeChannel={realtime.channel}
          useSession={realtime.useSession}
        >
          <WorkspaceContent>{children}</WorkspaceContent>
        </realtime.Provider>
      </UserProvider>
    )
  }

  function WorkspaceContent({ children }: { children: ReactNode }) {
    const { user, isLoading, refetch } = useUser()
    const navigate = useNavigate()

    return (
      <AdminWorkspaceShell
        user={user}
        isUserLoading={isLoading}
        icons={icons}
        extensions={(messages) => presentation.createExtensions(messages.nav)}
        destinations={destinations}
        onPreferenceChange={
          auth.updateCurrentUserPreferences
            ? async (preference) => {
                await auth.updateCurrentUserPreferences?.(preference)
                await refetch()
              }
            : undefined
        }
        onSignOut={async () => {
          await auth.signOut()
          void navigate({ to: signInPath })
        }}
      >
        {children}
      </AdminWorkspaceShell>
    )
  }

  return { beforeLoad, PendingComponent: AdminWorkspacePendingFallback, Workspace }
}
