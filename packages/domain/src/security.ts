import { z } from "zod";
export const securityParams = z.object({
  orgId: z.uuid(),
  alertId: z.uuid().optional(),
});
export const incidentUpdate = z.strictObject({
  version: z.number().int().positive(),
  state: z.enum(["ACKNOWLEDGED", "INVESTIGATING", "RESOLVED", "DISMISSED"]),
  reason: z
    .enum([
      "CONTROL_APPLIED",
      "EXPECTED_ACTIVITY",
      "DUPLICATE_INCIDENT",
      "INVESTIGATION_COMPLETE",
    ])
    .optional(),
});
