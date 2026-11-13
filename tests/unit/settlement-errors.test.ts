import { describe, expect, it } from "vitest";
import { settlementRequestError } from "../../apps/web/app/workspace/settlement/errors.js";

describe("settlement request errors", () => {
  it.each([
    [
      "DEPLOYMENT_VERIFICATION_TIMEOUT",
      "timed out before the wallet prompt opened",
    ],
    ["DEPLOYMENT_VERIFICATION_UNAVAILABLE", "temporarily unavailable"],
    [
      "DEPLOYMENT_VERIFICATION_INCONSISTENT",
      "did not match the authorized manifest",
    ],
  ])("explains pre-wallet %s failures", (code, message) => {
    const error = settlementRequestError(503, {
      error: code,
      correlationId: "request-42",
    });
    expect(error.message).toContain(message);
    expect(error.message).toContain("Reference: request-42.");
  });

  it("does not expose an unrecognized server diagnostic", () => {
    const message = settlementRequestError(503, {
      error: "private provider response",
    }).message;
    expect(message).toBe("Request unavailable. Refresh state before retrying.");
    expect(message).not.toContain("private provider response");
  });
});
