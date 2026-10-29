---
name: agent-security
description: Adversarially safe agent integration. Use for Avroqen implementation and review.
---

# Agent Security

## Instructions
Treat model as hostile/unreliable. Agent may only propose and query. Tools must have schemas, bounded effects and allowlists. Handle prompt injections, tool-output forgery, spending-limit bypass, account takeover, malicious provider and compromised agent. No credentials to owner, verifier or vault in prompts/tool environments.

## Workflow
1. Read AGENTS.md and relevant canonical docs.
2. Name financial and trust boundaries affected.
3. Define positive, negative, and adversarial tests before changing sensitive code.
4. Implement and run tests; include exact failures, not optimistic summaries.
5. Update decision log and PR evidence; require human approval for material authority changes.

## Never
Never bypass checks, expose secrets, claim mocks are live, or carry out irreversible financial/publishing actions without authorization.
