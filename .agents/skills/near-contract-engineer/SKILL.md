---
name: near-contract-engineer
description: Safely implement Rust NEAR vault. Use for Avroqen implementation and review.
---

# Near Contract Engineer

## Instructions
Read CONTRACT_SPEC, ARCHITECTURE and official docs. Use checked u128 token units; validate authenticated predecessor; enforce mandate/recipient/cap/execution count; reserve before asynchronous transfers; private callback; explicit failure and unknown handling. Never introduce unilateral platform keys. Demonstrate actual Sandbox tests, then authorized testnet results.

## Workflow
1. Read AGENTS.md and relevant canonical docs.
2. Name financial and trust boundaries affected.
3. Define positive, negative, and adversarial tests before changing sensitive code.
4. Implement and run tests; include exact failures, not optimistic summaries.
5. Update decision log and PR evidence; require human approval for material authority changes.

## Never
Never bypass checks, expose secrets, claim mocks are live, or carry out irreversible financial/publishing actions without authorization.
