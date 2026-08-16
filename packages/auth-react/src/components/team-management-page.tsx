"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  CreatedTeamInvitationDto,
  TeamInvitationDto,
  TeamManagementCapabilitiesDto,
  TeamMemberDto,
  TeamRoleDto,
} from "@voyant-travel/auth/team-management-runtime-port"
import { useVoyantReactContext } from "@voyant-travel/react"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  confirmDialog,
  Input,
  Label,
  NativeSelect,
  NativeSelectOption,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components"
import { Check, Copy, Loader2, Mail, Trash2, UserPlus, UserRoundCheck, Users } from "lucide-react"
import { type FormEvent, useEffect, useMemo, useState } from "react"

import { useAuthUiI18nOrDefault } from "../i18n/provider.js"
import {
  createTeamManagementPageApi,
  type TeamManagementPageApi,
  TeamManagementPageApiContext,
  useTeamManagementPageApi,
} from "../team-management-api.js"

const queryKeys = {
  capabilities: ["team-management", "capabilities"] as const,
  members: ["team-management", "members"] as const,
  roles: ["team-management", "roles"] as const,
  invitations: ["team-management", "invitations"] as const,
}

export interface TeamManagementPageProps {
  api?: TeamManagementPageApi
}

export function TeamManagementPage({ api: apiProp }: TeamManagementPageProps = {}) {
  if (apiProp) return <TeamManagementPageContent api={apiProp} />
  return <TeamManagementPageWithRuntime />
}

function TeamManagementPageWithRuntime() {
  const { baseUrl, fetcher } = useVoyantReactContext()
  const api = useMemo(() => createTeamManagementPageApi(baseUrl, fetcher), [baseUrl, fetcher])
  return <TeamManagementPageContent api={api} />
}

function TeamManagementPageContent({ api }: { api: TeamManagementPageApi }) {
  return (
    <TeamManagementPageApiContext.Provider value={api}>
      <TeamManagementView />
    </TeamManagementPageApiContext.Provider>
  )
}

function TeamManagementView() {
  const api = useTeamManagementPageApi()
  const queryClient = useQueryClient()
  const { messages, formatDateTime } = useAuthUiI18nOrDefault()
  const copy = messages.teamManagementPage
  const [actionError, setActionError] = useState<string | null>(null)

  const capabilitiesQuery = useQuery({
    queryKey: queryKeys.capabilities,
    queryFn: () => api.get<{ data: TeamManagementCapabilitiesDto }>("/v1/admin/team/capabilities"),
  })
  const canView = capabilitiesQuery.data?.data.viewMembers === true
  const membersQuery = useQuery({
    queryKey: queryKeys.members,
    queryFn: () => api.get<{ data: TeamMemberDto[] }>("/v1/admin/team/members"),
    enabled: canView,
  })
  const rolesQuery = useQuery({
    queryKey: queryKeys.roles,
    queryFn: () => api.get<{ data: TeamRoleDto[] }>("/v1/admin/team/roles"),
    enabled: canView,
  })
  const invitationsQuery = useQuery({
    queryKey: queryKeys.invitations,
    queryFn: () => api.get<{ data: TeamInvitationDto[] }>("/v1/admin/team/invitations"),
    enabled: canView,
  })

  const invalidateTeam = () => {
    void queryClient.invalidateQueries({ queryKey: ["team-management"] })
  }
  const updateRole = useMutation({
    mutationFn: ({ memberId, roleId }: { memberId: string; roleId: string }) =>
      api.put(`/v1/admin/team/members/${encodeURIComponent(memberId)}/role`, { roleId }),
    onSuccess: invalidateTeam,
    onError: (error) => setActionError(error instanceof Error ? error.message : copy.actionFailed),
  })
  const deactivate = useMutation({
    mutationFn: (memberId: string) =>
      api.delete(`/v1/admin/team/members/${encodeURIComponent(memberId)}`),
    onSuccess: invalidateTeam,
    onError: (error) => setActionError(error instanceof Error ? error.message : copy.actionFailed),
  })
  const activate = useMutation({
    mutationFn: (memberId: string) =>
      api.put(`/v1/admin/team/members/${encodeURIComponent(memberId)}/activation`, undefined),
    onSuccess: invalidateTeam,
    onError: (error) => setActionError(error instanceof Error ? error.message : copy.actionFailed),
  })
  const revoke = useMutation({
    mutationFn: (invitationId: string) =>
      api.delete(`/v1/admin/team/invitations/${encodeURIComponent(invitationId)}`),
    onSuccess: invalidateTeam,
    onError: (error) => setActionError(error instanceof Error ? error.message : copy.actionFailed),
  })

  const capabilities = capabilitiesQuery.data?.data
  const members = membersQuery.data?.data ?? []
  const roles = rolesQuery.data?.data ?? []
  const invitations = invitationsQuery.data?.data ?? []
  const isLoading = capabilitiesQuery.isPending || (canView && membersQuery.isPending)
  const isError =
    capabilitiesQuery.isError ||
    membersQuery.isError ||
    rolesQuery.isError ||
    invitationsQuery.isError

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{copy.title}</h1>
        <p className="text-sm text-muted-foreground">{copy.description}</p>
      </div>

      {isError || actionError ? (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError ?? copy.loadFailed}
        </div>
      ) : null}

      {capabilities?.inviteMembers ? <InviteMemberForm roles={roles} /> : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" aria-hidden="true" />
            {copy.members.title}
          </CardTitle>
          <CardDescription>{copy.members.description}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{copy.members.memberColumn}</TableHead>
                  <TableHead>{copy.members.roleColumn}</TableHead>
                  <TableHead>{copy.members.statusColumn}</TableHead>
                  <TableHead>{copy.members.lastActivityColumn}</TableHead>
                  <TableHead className="w-20 text-right">{copy.members.actionsColumn}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                      {copy.members.empty}
                    </TableCell>
                  </TableRow>
                ) : (
                  members.map((member) => {
                    const label = member.name ?? member.email ?? member.id
                    return (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div className="font-medium">{label}</div>
                          {member.email && member.email !== label ? (
                            <div className="text-xs text-muted-foreground">{member.email}</div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {capabilities?.manageRoles && member.status === "active" ? (
                            <NativeSelect
                              aria-label={`${copy.members.roleColumn}: ${label}`}
                              value={member.roleId}
                              disabled={updateRole.isPending}
                              onChange={(event) => {
                                setActionError(null)
                                updateRole.mutate({
                                  memberId: member.id,
                                  roleId: event.target.value,
                                })
                              }}
                            >
                              {!roles.some((role) => role.id === member.roleId) ? (
                                <NativeSelectOption value={member.roleId}>
                                  {member.roleName}
                                </NativeSelectOption>
                              ) : null}
                              {roles.map((role) => (
                                <NativeSelectOption key={role.id} value={role.id}>
                                  {role.name}
                                </NativeSelectOption>
                              ))}
                            </NativeSelect>
                          ) : (
                            member.roleName
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={member.status === "active" ? "secondary" : "outline"}>
                            {copy.statuses[member.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {member.lastActivityAt
                            ? formatDateTime(member.lastActivityAt)
                            : copy.dateUnknown}
                        </TableCell>
                        <TableCell className="text-right">
                          {capabilities?.deactivateMembers && member.status === "active" ? (
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon-sm"
                              title={copy.members.deactivate}
                              aria-label={copy.members.deactivateLabel(label)}
                              disabled={deactivate.isPending}
                              onClick={async () => {
                                if (
                                  await confirmDialog({
                                    description: copy.members.deactivateConfirm(label),
                                    destructive: true,
                                  })
                                ) {
                                  setActionError(null)
                                  deactivate.mutate(member.id)
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          ) : null}
                          {capabilities?.activateMembers && member.status === "deactivated" ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon-sm"
                              title={copy.members.activate}
                              aria-label={copy.members.activateLabel(label)}
                              disabled={activate.isPending}
                              onClick={() => {
                                setActionError(null)
                                activate.mutate(member.id)
                              }}
                            >
                              <UserRoundCheck className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {canView ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-4 w-4" aria-hidden="true" />
              {copy.invitations.title}
            </CardTitle>
            <CardDescription>{copy.invitations.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{copy.invitations.emailColumn}</TableHead>
                  <TableHead>{copy.invitations.roleColumn}</TableHead>
                  <TableHead>{copy.invitations.expiresColumn}</TableHead>
                  <TableHead className="w-20 text-right">
                    {copy.invitations.actionsColumn}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                      {copy.invitations.empty}
                    </TableCell>
                  </TableRow>
                ) : (
                  invitations.map((invitation) => (
                    <TableRow key={invitation.id}>
                      <TableCell>
                        <div>{invitation.email}</div>
                        <Badge variant="outline">{copy.statuses[invitation.status]}</Badge>
                      </TableCell>
                      <TableCell>{invitation.roleName}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(invitation.expiresAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        {capabilities?.revokeInvitations && invitation.status === "pending" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            title={copy.invitations.revoke}
                            aria-label={copy.invitations.revokeLabel(invitation.email)}
                            disabled={revoke.isPending}
                            onClick={() => revoke.mutate(invitation.id)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function InviteMemberForm({ roles }: { roles: TeamRoleDto[] }) {
  const api = useTeamManagementPageApi()
  const queryClient = useQueryClient()
  const copy = useAuthUiI18nOrDefault().messages.teamManagementPage
  const [email, setEmail] = useState("")
  const [roleId, setRoleId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [createdInvitation, setCreatedInvitation] = useState<CreatedTeamInvitationDto | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!roleId && roles[0]) setRoleId(roles[0].id)
  }, [roleId, roles])

  const invite = useMutation({
    mutationFn: () =>
      api.post<{ data: CreatedTeamInvitationDto }>("/v1/admin/team/invitations", {
        email: email.trim(),
        roleId,
      }),
    onSuccess: ({ data }) => {
      setEmail("")
      setError(null)
      setCreatedInvitation(data)
      setCopied(false)
      void queryClient.invalidateQueries({ queryKey: ["team-management"] })
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : copy.actionFailed),
  })

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setCreatedInvitation(null)
    setCopied(false)
    invite.mutate()
  }

  const copyAcceptUrl = async () => {
    if (!createdInvitation?.acceptUrl) return
    try {
      await navigator.clipboard.writeText(createdInvitation.acceptUrl)
      setCopied(true)
    } catch {
      setError(copy.invite.copyFailed)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          {copy.invite.title}
        </CardTitle>
        <CardDescription>{copy.invite.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_auto]">
          <div className="space-y-2">
            <Label htmlFor="team-invite-email">{copy.invite.emailLabel}</Label>
            <Input
              id="team-invite-email"
              type="email"
              required
              value={email}
              placeholder={copy.invite.emailPlaceholder}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-invite-role">{copy.invite.roleLabel}</Label>
            <NativeSelect
              id="team-invite-role"
              value={roleId}
              required
              onChange={(event) => setRoleId(event.target.value)}
            >
              {roles.map((role) => (
                <NativeSelectOption key={role.id} value={role.id}>
                  {role.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={invite.isPending || !roleId}>
              {invite.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <UserPlus className="h-4 w-4" aria-hidden="true" />
              )}
              {invite.isPending ? copy.invite.submitting : copy.invite.submit}
            </Button>
          </div>
          {error ? <p className="text-sm text-destructive md:col-span-3">{error}</p> : null}
          {createdInvitation?.acceptUrl ? (
            <div className="space-y-2 border-t pt-4 md:col-span-3" role="status">
              <Label htmlFor="team-invite-accept-url">{copy.invite.acceptUrlLabel}</Label>
              <p className="text-sm text-muted-foreground">{copy.invite.acceptUrlDescription}</p>
              <div className="flex gap-2">
                <Input
                  id="team-invite-accept-url"
                  readOnly
                  value={createdInvitation.acceptUrl}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  title={copied ? copy.invite.copied : copy.invite.copyUrl}
                  aria-label={copied ? copy.invite.copied : copy.invite.copyUrl}
                  onClick={() => void copyAcceptUrl()}
                >
                  {copied ? (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  )}
                  {copied ? copy.invite.copied : copy.invite.copyUrl}
                </Button>
              </div>
            </div>
          ) : null}
        </form>
      </CardContent>
    </Card>
  )
}

export type { TeamManagementPageApi } from "../team-management-api.js"
