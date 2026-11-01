// Pinned Meteor SDK 3.24.1 error shapes. Never display or retain raw wallet errors.
export class WalletSignInError extends Error {
  constructor(
    public readonly kind: "canceled" | "popup" | "unavailable" | "unexpected",
  ) {
    super(
      {
        canceled: "Wallet sign-in canceled. No transaction was sent.",
        popup:
          "The wallet popup could not open. Allow popups and retry. No transaction was sent.",
        unavailable:
          "The wallet connection is unavailable. Please retry. No transaction was sent.",
        unexpected:
          "Wallet sign-in failed unexpectedly. Please retry. No transaction was sent.",
      }[kind],
    );
  }
}
export function walletSignInError(reason: unknown): WalletSignInError {
  if (reason instanceof Error && reason.name === "MeteorActionError") {
    const tags: unknown = (
      reason as Error & { _reason?: { endTags?: unknown } }
    )._reason?.endTags;
    if (Array.isArray(tags) && tags.every((tag) => typeof tag === "string")) {
      if (
        tags.some((tag) =>
          ["POPUP_WINDOW_OPEN_FAILED", "POPUP_WINDOW_REFUSED"].includes(tag),
        )
      )
        return new WalletSignInError("popup");
      if (tags.includes("EXT_DIRECT_RESPONSE_FAILED"))
        return new WalletSignInError("unavailable");
      if (
        tags.length &&
        tags.every((tag) =>
          ["USER_CANCELLED", "WINDOW_CLOSED", "INCOMPLETE_ACTION"].includes(
            tag,
          ),
        ) &&
        tags.some((tag) => tag === "USER_CANCELLED" || tag === "WINDOW_CLOSED")
      )
        return new WalletSignInError("canceled");
    }
  }
  // The SDK's own Cancel action uses this exact plain Error, without endTags.
  if (
    reason instanceof Error &&
    reason.name === "Error" &&
    reason.message === "Action was cancelled"
  )
    return new WalletSignInError("canceled");
  return new WalletSignInError("unexpected");
}
