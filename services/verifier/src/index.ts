// Human-source adapter only. No provider credentials, network fetch, blockchain signer or daemon.
export {
  allowedReviewer,
  assessment as assessHumanObservation,
  readiness,
} from "../../../packages/domain/src/evidence.js";
export const sourceClassification =
  "HUMAN_ASSERTION_NOT_AUTOMATED_PROVIDER_VERIFICATION";
