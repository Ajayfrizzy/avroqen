import { atomicAmount } from "@avroqen/domain";
import { z } from "zod";
// Validation only. No signer, credentials, network client or executor is provided.
// M0 schema compatibility only. The live M4 API exclusively dispatches runtimeTool.
export const agentRequest = z.discriminatedUnion("tool", [
  z.strictObject({
    tool: z.literal("query"),
    proposalId: z.string().min(1).max(128),
  }),
  z.strictObject({
    tool: z.literal("propose"),
    mandateId: z.string().min(1).max(128),
    recipient: z.string().min(2).max(64),
    amount: atomicAmount,
  }),
]);

export { denialReasons, prepareProposal, runtimeTool } from "./runtime.js";
