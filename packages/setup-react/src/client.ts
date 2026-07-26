import type { AdminRouteRuntime } from "@voyant-travel/admin"
import type {
  InitializeSetupInput,
  SetupState,
  SetupStateSnapshot,
  SetupStepState,
} from "@voyant-travel/setup"

export interface SetupInitializeResponse extends SetupState {
  shouldRedirect: boolean
}

export async function getSetupStateClient(runtime: AdminRouteRuntime): Promise<SetupStateSnapshot> {
  return setupRequest<{ data: SetupStateSnapshot }>(runtime, "/v1/admin/setup", {
    method: "GET",
  }).then(({ data }) => data)
}

export async function initializeSetupClient(
  runtime: AdminRouteRuntime,
  input: InitializeSetupInput,
): Promise<SetupInitializeResponse> {
  return setupRequest<{ data: SetupInitializeResponse }>(runtime, "/v1/admin/setup/initialize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  }).then(({ data }) => data)
}

export async function updateSetupStepClient(
  runtime: AdminRouteRuntime,
  stepId: string,
  action: "complete" | "skip",
): Promise<SetupStepState> {
  return setupRequest<{ data: SetupStepState }>(
    runtime,
    `/v1/admin/setup/steps/${encodeURIComponent(stepId)}/${action}`,
    { method: "POST" },
  ).then(({ data }) => data)
}

export async function dismissSetupClient(runtime: AdminRouteRuntime): Promise<SetupState> {
  return setupRequest<{ data: SetupState }>(runtime, "/v1/admin/setup/dismiss", {
    method: "POST",
  }).then(({ data }) => data)
}

async function setupRequest<T>(
  runtime: AdminRouteRuntime,
  path: string,
  init: RequestInit,
): Promise<T> {
  const fetcher = runtime.fetcher ?? ((url: string, request?: RequestInit) => fetch(url, request))
  const baseUrl = runtime.baseUrl.endsWith("/") ? runtime.baseUrl.slice(0, -1) : runtime.baseUrl
  const response = await fetcher(`${baseUrl}${path}`, init)
  const body = (await response.json().catch(() => ({}))) as T & { error?: unknown }
  if (!response.ok) {
    throw new Error(
      typeof body.error === "string" ? body.error : `Setup request failed (${response.status}).`,
    )
  }
  return body
}
