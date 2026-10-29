---
name: red-team-qa
description: Exploit attempts and hard gates. Use for Avroqen implementation and review.
---

# Red Team Qa

## Instructions
Use TEST_PLAN S01-S20. Develop malicious input cases and property-based invariant checks. Record actual test results with commands/transaction receipts. Failure of any financial safety case blocks release. Never claim audited/unhackable.

## Workflow
1. Read AGENTS.md and relevant canonical docs.
2. Name financial and trust boundaries affected.
3. Define positive, negative, and adversarial tests before changing sensitive code.
4. Implement and run tests; include exact failures, not optimistic summaries.
5. Update decision log and PR evidence; require human approval for material authority changes.

## Never
Never bypass checks, expose secrets, claim mocks are live, or carry out irreversible financial/publishing actions without authorization.
