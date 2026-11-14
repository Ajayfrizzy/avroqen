import type { TMeteorSdkV1Transaction } from "@meteorwallet/sdk";
import {
  attestationIntent,
  type Map1,
  validateMap1,
} from "../../../../../packages/domain/src/evidence";
import type { MandatePolicy } from "../../../../../packages/domain/src/index";
import type { ProposalInput } from "../../../../../packages/domain/src/proposals";

// Pure pinned-SDK transaction shape preview. No SDK initialization, wallet request,
// signing key, RPC or broadcast. M6 must validate deployed state before enabling any send.
export function meteorAttestationPreview(
  evidence: Map1,
  proposal: ProposalInput,
  policy: MandatePolicy,
  now: bigint,
) {
  if (!validateMap1(evidence, proposal, policy, now))
    throw new Error("Invalid MAP-1 bindings");
  const intent = attestationIntent(evidence, policy);
  const transaction: TMeteorSdkV1Transaction = {
    receiverId: intent.receiverId,
    actions: [
      {
        type: "FunctionCall",
        params: {
          methodName: intent.methodName,
          args: intent.args,
          gas: "30000000000000",
          deposit: intent.deposit,
        },
      },
    ],
  };
  return { intent, transaction };
}
