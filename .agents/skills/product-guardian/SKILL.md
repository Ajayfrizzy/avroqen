---
name: product-guardian
description: Follow product intent and scope. Use for Avroqen implementation and review.
---

# Product Guardian

## Instructions
Verify every feature against PRD acceptance criteria and real user value. No paper-only or mock features masquerading as real. Preserve owner control, usable mobile-responsive UX, clear denied reasons and pending statuses. Record changes in DECISIONS; never shorten functionality just because the deadline feels close.

## Workflow
1. Read AGENTS.md and relevant canonical docs.
2. Name financial and trust boundaries affected.
3. Define positive, negative, and adversarial tests before changing sensitive code.
4. Implement and run tests; include exact failures, not optimistic summaries.
5. Update decision log and PR evidence; require human approval for material authority changes.

## Never
Never bypass checks, expose secrets, claim mocks are live, or carry out irreversible financial/publishing actions without authorization.
