export function createProcessInactivityTimeout(
  timeoutMs: number,
  onTimeout: () => void,
): {
  touch: () => void
  clear: () => void
} {
  let timer: ReturnType<typeof setTimeout>

  const arm = () => {
    clearTimeout(timer)
    timer = setTimeout(onTimeout, timeoutMs)
  }

  arm()
  return { touch: arm, clear: () => clearTimeout(timer) }
}
