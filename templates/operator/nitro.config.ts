import path from "node:path"
import { defineNitroConfig } from "nitro/config"

const isTuyuBookingRuntime = process.env.TUYU_BOOKING_RUNTIME === "1"
const configuredOutput = process.env.TUYU_VOYANT_OUTPUT_DIR

if (isTuyuBookingRuntime && (!configuredOutput || !path.isAbsolute(configuredOutput))) {
  throw new Error("TUYU_VOYANT_OUTPUT_DIR must be an absolute Console work directory")
}

// The Nitro CLI reads nitro.config.ts directly. Keep the upstream Cloudflare
// build unchanged, and redirect only the packaged TuyuBooking runtime.
export default defineNitroConfig(
  isTuyuBookingRuntime
    ? {
        preset: "node-server",
        output: { dir: path.resolve(configuredOutput!) },
      }
    : {},
)
