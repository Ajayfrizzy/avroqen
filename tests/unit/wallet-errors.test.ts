import { expect, it } from "vitest";
import { walletSignInError } from "../../apps/web/app/workspace/wallet-errors";

function meteor(endTags: unknown) {
  return Object.assign(new Error("untrusted detail"), {
    name: "MeteorActionError",
    _reason: { endTags },
  });
}
it("recognizes exact Meteor cancellation shapes without retaining raw errors", () => {
  for (const error of [
    meteor(["USER_CANCELLED"]),
    meteor(["INCOMPLETE_ACTION", "WINDOW_CLOSED"]),
    new Error("Action was cancelled"),
  ]) {
    const result = walletSignInError(error);
    expect(result.kind).toBe("canceled");
    expect(result.message).toBe(
      "Wallet sign-in canceled. No transaction was sent.",
    );
    expect(result.cause).toBeUndefined();
  }
});
it("keeps popup failures, unavailable connections and unexpected errors separate", () => {
  for (const tag of ["POPUP_WINDOW_OPEN_FAILED", "POPUP_WINDOW_REFUSED"])
    expect(walletSignInError(meteor(["USER_CANCELLED", tag])).kind).toBe(
      "popup",
    );
  expect(walletSignInError(meteor(["EXT_DIRECT_RESPONSE_FAILED"])).kind).toBe(
    "unavailable",
  );
  for (const error of [
    meteor(["INCOMPLETE_ACTION"]),
    meteor(["USER_CANCELLED", "UNKNOWN"]),
    meteor("USER_CANCELLED"),
    new Error("Service cancelled request"),
    new TypeError("Failed to fetch"),
    null,
    {},
  ])
    expect(walletSignInError(error).kind).toBe("unexpected");
});
