---
name: financial-reconciliation
description: Precise execution and recovery. Use for Avroqen implementation and review.
---

# Financial Reconciliation

## Instructions
Model proposed, reserved, pending, succeeded, confirmed_failed, unknown separately. Read chain receipts and contract state; reconcile with idempotent workers. Do not infer success from API response or failure from timeout. Verify conservation and owner withdrawal constraints.

## Workflow
1. Read AGENTS.md and relevant canonical docs.
2. Name financial and trust boundaries affected.
3. Define positive, negative, and adversarial tests before changing sensitive code.
4. Implement and run tests; include exact failures, not optimistic summaries.
5. Update decision log and PR evidence; require human approval for material authority changes.

## Never
Never bypass checks, expose secrets, claim mocks are live, or carry out irreversible financial/publishing actions without authorization.
