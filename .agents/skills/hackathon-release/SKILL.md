---
name: hackathon-release
description: Submission and publishing safety. Use for Avroqen implementation and review.
---

# Hackathon Release

## Instructions
Read unchanged HACKATHON.md. Prepare README do-X-see-Y, public repo and demo assets only when human approves. Human posts X. Print full final payload, ask explicit confirmation, submit one time and reuse requestId on allowed retry. No auto-spend or submission.

## Workflow
1. Read AGENTS.md and relevant canonical docs.
2. Name financial and trust boundaries affected.
3. Define positive, negative, and adversarial tests before changing sensitive code.
4. Implement and run tests; include exact failures, not optimistic summaries.
5. Update decision log and PR evidence; require human approval for material authority changes.

## Never
Never bypass checks, expose secrets, claim mocks are live, or carry out irreversible financial/publishing actions without authorization.
