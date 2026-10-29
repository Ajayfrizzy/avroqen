---
name: evidence-attestations
description: Independent evidence and MAP-1. Use for Avroqen implementation and review.
---

# Evidence Attestations

## Instructions
Follow ATTESTATION_PROTOCOL. Verify source independence, scoped verifier authorization, exact claim binding, replay prevention and expiry. Evidence hash verifies content integrity, not truth. Compromised verifier controls must include revoke, scope limitation and optional quorum/owner review.

## Workflow
1. Read AGENTS.md and relevant canonical docs.
2. Name financial and trust boundaries affected.
3. Define positive, negative, and adversarial tests before changing sensitive code.
4. Implement and run tests; include exact failures, not optimistic summaries.
5. Update decision log and PR evidence; require human approval for material authority changes.

## Never
Never bypass checks, expose secrets, claim mocks are live, or carry out irreversible financial/publishing actions without authorization.
