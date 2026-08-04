import { describe, expect, it } from "vitest"

import { filenameFromContentDisposition } from "./use-slot-allocation-planning.js"

/**
 * The export legs answer `text/csv` with a `Content-Disposition` the server
 * builds from the departure's own id, so the downloaded file is named after the
 * departure rather than after the route.
 */
describe("filenameFromContentDisposition", () => {
  it("reads the quoted filename the allocation exports send", () => {
    expect(
      filenameFromContentDisposition('attachment; filename="rooming-abc12345-slot_1.csv"'),
    ).toBe("rooming-abc12345-slot_1.csv")
  })

  it("prefers the RFC 5987 encoded form when both are present", () => {
    expect(
      filenameFromContentDisposition(
        "attachment; filename=\"fallback.csv\"; filename*=UTF-8''seating-%C3%AEnsorit.csv",
      ),
    ).toBe("seating-însorit.csv")
  })

  it("accepts an unquoted filename", () => {
    expect(filenameFromContentDisposition("attachment; filename=passengers.csv")).toBe(
      "passengers.csv",
    )
  })

  it("returns null when there is nothing to read", () => {
    expect(filenameFromContentDisposition(null)).toBeNull()
    expect(filenameFromContentDisposition("attachment")).toBeNull()
  })
})
